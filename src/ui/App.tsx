import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import {
  findConflicts,
  parseGrid,
  puzzleUrl,
  UNITS,
  type Digit,
} from "../engine";
import type { Hint } from "../analysis/hints";
import type { HintTier } from "../state/events";
import { HintButton, HintPanel } from "./components/HintButton";
import { marksAtStep } from "./timeline";
import type { Level } from "../engine/step";
import { SAMPLE_EASY } from "../engine/samples";
import { createLocalStoragePersistence } from "../state/persistence";
import { checkBoard } from "../state/check";
import { hasProgress } from "../state/progress";
import { isPaused } from "../state/timer";
import type { GameRecord } from "../state/events";
import {
  createPlayedStore,
  createPuzzleSource,
  type PuzzleSource,
} from "../state/puzzles";
import { getEngineClient } from "../workers/client";
import { createGameStore, newGameRecord } from "../state/store";
import { newGame, resetGame, type PuzzleSupplier } from "../state/newGame";
import { dailyLevel, dailyPuzzle } from "../state/daily";
import { recordFromSearch } from "../state/puzzleParam";
import type { CellMark } from "./components/Cell";
import { Board } from "./components/Board";
import { SubmitDialog } from "./components/SubmitDialog";
import { submitErrors } from "../state/store";
import { Controls } from "./components/Controls";
import { ShareDialog } from "./components/ShareDialog";
import { ImportDialog, type ImportedPuzzle } from "./components/ImportDialog";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { PauseOverlay } from "./components/PauseOverlay";
import { NewGame } from "./components/NewGame";
import { Pad } from "./components/Pad";
import { useAnalysis } from "./useAnalysis";
import { replayRecord } from "../analysis/replay";
import { SidePanel } from "./components/SidePanel";
import { SettingsDialog } from "./components/SettingsDialog";
import { actionForKey } from "./keyboard";
import { ShortcutsDialog } from "./components/ShortcutsDialog";
import { StatsDialog } from "./components/StatsDialog";
import { cellCommitCounts } from "./renderProbe";
import {
  initialInputMode,
  inputModeReducer,
  tapForLockedDigit,
} from "./inputMode";
import { moveSelection } from "./selection";
import { describeChange, describeCheck, describeSubmit } from "./announce";
import { useSettings } from "./useSettings";
import { GameProvider, useGame } from "./useGame";
import { useVisibility } from "./useVisibility";
import { useIdle } from "./useIdle";
import {
  modeFromSearch,
  pauseForDisplay,
  searchForMode,
  type AppMode,
} from "./display/mode";

// ?test=1 exposes a controllable clock for e2e (docs/ARCHITECTURE.md, "Testing hooks").
// Split out of the initial bundle: Display mode and the analysis panel are not needed to start solving.
const DisplayMode = lazy(() =>
  import("./display/DisplayMode").then((m) => ({ default: m.DisplayMode })),
);
const AnalysisPanel = lazy(() =>
  import("./components/AnalysisPanel").then((m) => ({
    default: m.AnalysisPanel,
  })),
);

const NO_CELLS: ReadonlySet<number> = new Set();
const noop = () => {};

const testMode = new URLSearchParams(window.location.search).has("test");
let clockOffset = 0;
const persistence = createLocalStoragePersistence();

function makeStore(record?: GameRecord) {
  const now = () => Date.now() + clockOffset;
  // A ?puzzle= link starts that puzzle once; the saved record then lets a reload resume it.
  const fromUrl = record
    ? null
    : recordFromSearch(window.location.search, Date.now());
  if (fromUrl) record = fromUrl;
  const store = createGameStore(
    record ??
      persistence.loadCurrent() ??
      newGameRecord({
        id: "sample",
        puzzle: SAMPLE_EASY.puzzle,
        solution: SAMPLE_EASY.solution,
        level: "easy",
        createdAt: Date.now(),
      }),
    testMode ? { now, persistence } : { persistence },
  );
  if (record) persistence.saveCurrent(record);
  if (testMode) {
    (window as unknown as { __sudoku: unknown }).__sudoku = {
      advance: (ms: number) => void (clockOffset += ms),
      store,
      cellCommits: () => [...cellCommitCounts()],
    };
  }
  return store;
}

export function App({ source }: { source?: PuzzleSource } = {}) {
  // A saved game, if any, resumes on first mount; "New game" swaps in a fresh store.
  const [store, setStore] = useState(() => makeStore());
  const [pending, setPending] = useState(false);
  const puzzleSource = useRef<PuzzleSource | null>(source ?? null);
  const refocusNewGame = useRef(false);
  // The swap remounts Game, which drops focus to body; hand it back to the control the player used.
  useEffect(() => {
    if (!refocusNewGame.current) return;
    refocusNewGame.current = false;
    document.querySelector<HTMLButtonElement>("[data-new-game]")?.focus();
  }, [store]);
  const start = useCallback(
    (supplier: PuzzleSupplier, level: Level) => {
      setPending(true);
      newGame(level, supplier, {
        current: store.getSnapshot().record,
        persistence,
        now: Date.now,
      })
        .then((record) => {
          refocusNewGame.current = true;
          setStore(makeStore(record));
        })
        .catch(() => {
          /* generation failed or was cancelled: keep the current game */
        })
        .finally(() => setPending(false));
    },
    [store],
  );
  const onNewGame = useCallback(
    (level: Level) => {
      puzzleSource.current ??= createPuzzleSource({
        fetch: (url) => fetch(url),
        generator: getEngineClient(),
        played: createPlayedStore(),
        baseUrl: import.meta.env.BASE_URL + "puzzles/",
      });
      start(puzzleSource.current, level);
    },
    [start],
  );
  const onDaily = useCallback(() => {
    const date = new Date();
    start(
      {
        nextPuzzle: () =>
          dailyPuzzle(date, {
            fetch: (url) => fetch(url),
            baseUrl: import.meta.env.BASE_URL + "puzzles/",
          }),
      },
      dailyLevel(date),
    );
  }, [start]);
  const onImport = useCallback(
    (p: ImportedPuzzle) => {
      start(
        {
          nextPuzzle: () =>
            Promise.resolve({
              id: `import-${Date.now()}`,
              puzzle: p.puzzle,
              solution: p.solution,
              level: p.level,
              score: p.score,
              source: "import" as const,
            }),
        },
        p.level,
      );
    },
    [start],
  );
  useVisibility(store);
  const [mode, setModeState] = useState<AppMode>(() =>
    modeFromSearch(window.location.search),
  );
  const setMode = useCallback(
    (next: AppMode) => {
      // Display is a glance view, so the game clock must not run behind it; coming back leaves it
      // paused (the Resume overlay) rather than silently restarting.
      if (next === "display") pauseForDisplay(store);
      setModeState(next);
      window.history.replaceState(
        null,
        "",
        searchForMode(window.location.search, next) || window.location.pathname,
      );
      // Unmounting the toggle drops focus to body; hand it to the control that replaces it.
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(
            next === "display" ? ".display-exit" : "[data-display-toggle]",
          )
          ?.focus(),
      );
    },
    [store],
  );
  const display = mode === "display";
  // Idle in Play pauses the game and shows Display; returning leaves it paused until resumed.
  const { settings: appSettings } = useSettings();
  const onIdle = useCallback(() => setMode("display"), [setMode]);
  useIdle(appSettings.idleMinutes, !display, onIdle);
  // Game stays mounted (hidden) in Display so selection, notes mode and other local UI state survive the round trip.
  return (
    <GameProvider store={store}>
      <div hidden={display}>
        <Game
          key={store.getSnapshot().record.id}
          active={!display}
          pending={pending}
          onNewGame={onNewGame}
          onDaily={onDaily}
          onImport={onImport}
          onDisplay={() => setMode("display")}
        />
      </div>
      {display && (
        <Suspense fallback={null}>
          <DisplayMode onExit={() => setMode("play")} />
        </Suspense>
      )}
    </GameProvider>
  );
}

function Game({
  active,
  pending,
  onNewGame,
  onDaily,
  onImport,
  onDisplay,
}: {
  active: boolean;
  pending: boolean;
  onNewGame: (level: Level) => void;
  onDaily: () => void;
  onImport: (p: ImportedPuzzle) => void;
  onDisplay: () => void;
}) {
  const { game, dispatch } = useGame();
  // Selection is UI state; board state lives in the store.
  const [selected, setSelected] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importConfirm, setImportConfirm] = useState<ImportedPuzzle | null>(
    null,
  );
  const { settings, update } = useSettings();
  const { givens, board, notes, conflicts } = game;
  const [entry, entryDispatch] = useReducer(
    inputModeReducer,
    settings.entryMode,
    initialInputMode,
  );
  const digitFirst = entry.mode === "digit-first";
  const noting = notesMode || shiftHeld;
  const paused = isPaused(game.record) && game.record.status === "playing";
  const refocusBoard = useRef(false);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  const onPause = useCallback(() => {
    if (!pausedRef.current) dispatch({ type: "pause" });
  }, [dispatch]);
  const onResume = useCallback(() => {
    if (!pausedRef.current) return;
    refocusBoard.current = true;
    dispatch({ type: "resume" });
  }, [dispatch]);
  const onHintRef = useRef<() => void>(noop);
  const act = useCallback(
    (
      action: NonNullable<ReturnType<typeof actionForKey>>,
      input: "keyboard" | "pad" = "keyboard",
      code?: string,
    ) => {
      // Input is ignored while a new puzzle generates: the swap would discard it.
      if (pending && action.type !== "move") return;
      if (action.type === "help") {
        setHelpOpen(true);
        return;
      }
      if (action.type === "pause") {
        if (pausedRef.current) onResume();
        else onPause();
        return;
      }
      if (action.type === "hint") {
        onHintRef.current();
        return;
      }
      if (action.type === "undo" || action.type === "redo") {
        dispatch({ type: action.type });
        return;
      }
      if (action.type === "move") {
        setSelected((cell) => moveSelection(cell ?? 0, action.direction));
        return;
      }
      if (action.type === "escape") {
        entryDispatch({ type: "unlock" });
        return;
      }
      if (action.type === "toggle-notes") {
        setNotesMode((on) => !on);
        return;
      }
      if (digitFirst && action.type === "place" && !noting) {
        // Digit-first: a digit key or pad button locks it; cells are filled by tapping them.
        entryDispatch({ type: "digit", digit: action.digit });
        return;
      }
      if (selected === null) return;
      if (action.type === "note" || (action.type === "place" && noting)) {
        // Notes only make sense on empty cells.
        if (board[selected] !== 0) return;
        const digit = action.digit;
        const on = (notes[selected]! & (1 << (digit - 1))) === 0;
        dispatch({ type: "note", cell: selected, digit, on });
      } else if (action.type === "place")
        dispatch({
          type: "place",
          cell: selected,
          digit: action.digit,
          input,
          ...(code ? { key: code } : {}),
        });
      else dispatch({ type: "erase", cell: selected });
    },
    [
      selected,
      dispatch,
      noting,
      board,
      notes,
      pending,
      onPause,
      onResume,
      digitFirst,
    ],
  );

  useEffect(() => {
    // Hidden behind Display: keys there must not edit the board.
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, dialog")) return;
      if (e.key === "Shift") setShiftHeld(true);
      const action = actionForKey(e);
      if (pausedRef.current) {
        if (e.key === "Enter") {
          e.preventDefault();
          onResume();
        } else if (action?.type === "pause" || action?.type === "help") {
          e.preventDefault();
          act(action);
        }
        return;
      }
      if (!action) return;
      // Escape also closes dialogs natively; blocking its default could swallow that.
      if (action.type !== "escape") e.preventDefault();
      act(action, "keyboard", e.code);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Shift") setShiftHeld(false);
    }
    // A Shift release while the window is unfocused would otherwise leave notes stuck on.
    const onBlur = () => setShiftHeld(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [active, act, onResume]);

  // Hand focus back to the board once the overlay (and the focused Resume button) is gone.
  useEffect(() => {
    if (paused || !refocusBoard.current) return;
    refocusBoard.current = false;
    document
      .querySelector<HTMLButtonElement>(`[data-cell="${selected ?? 0}"]`)
      ?.focus();
  }, [paused, selected]);

  // Keep keyboard focus on the selected cell so screen readers follow the selection.
  useEffect(() => {
    if (selected === null) return;
    const el = document.querySelector<HTMLButtonElement>(
      `[data-cell="${selected}"]`,
    );
    if (el && document.activeElement?.closest(".board")) el.focus();
  }, [selected]);

  // Cells are memoized on onSelect, so the handler stays stable and reads current state via a ref.
  const tapState = {
    pending,
    noting,
    digitFirst,
    entry,
    board,
    notes,
    givens,
    dispatch,
  };
  const tapRef = useRef(tapState);
  useEffect(() => {
    tapRef.current = tapState;
  });
  const onSelectCell = useCallback((cell: number) => {
    setSelected(cell);
    const t = tapRef.current;
    if (t.pending) return;
    if (t.noting && t.digitFirst && t.entry.locked !== null) {
      if (t.board[cell] !== 0) return;
      const on = (t.notes[cell]! & (1 << (t.entry.locked - 1))) === 0;
      t.dispatch({ type: "note", cell, digit: t.entry.locked, on });
      return;
    }
    const tap = tapForLockedDigit(
      t.entry,
      t.board[cell] ?? 0,
      t.givens[cell] !== 0,
    );
    if (tap?.type === "place")
      t.dispatch({
        type: "place",
        cell,
        digit: tap.digit,
        input: "digit-first",
      });
    else if (tap?.type === "erase") t.dispatch({ type: "erase", cell });
  }, []);
  const onToggleEntry = useCallback(() => {
    const mode = digitFirst ? "cell-first" : "digit-first";
    entryDispatch({ type: "set-mode", mode });
    update({ entryMode: mode });
  }, [digitFirst, update]);

  const onDigit = useCallback(
    (digit: Digit) => act({ type: "place", digit }, "pad"),
    [act],
  );
  const onErase = useCallback(() => act({ type: "erase" }), [act]);

  const onUndo = useCallback(() => {
    if (!pending) dispatch({ type: "undo" });
  }, [dispatch, pending]);
  const onRedo = useCallback(() => {
    if (!pending) dispatch({ type: "redo" });
  }, [dispatch, pending]);
  const onReset = useCallback(() => {
    if (!pending) resetGame({ dispatch });
  }, [dispatch, pending]);
  const onAutoNotes = useCallback(() => {
    if (!pending) dispatch({ type: "auto-notes" });
  }, [dispatch, pending]);
  const onToggleAuto = useCallback(() => {
    if (pending) return;
    const autoCandidates = !settings.autoCandidates;
    update({ autoCandidates });
    dispatch({ type: "settings-assist", autoCandidates });
    if (autoCandidates) dispatch({ type: "auto-notes" });
  }, [settings.autoCandidates, update, dispatch, pending]);

  // Polite live region: placements and conflicts are diffed from the board, completion comes from the submit event; Check
  // results are announced by their own handler. Resume/new-game remounts start with a fresh baseline.
  const [announcement, setAnnouncement] = useState("");
  const prevView = useRef({ board, conflicts });
  useEffect(() => {
    const msg = describeChange(prevView.current, { board, conflicts });
    prevView.current = { board, conflicts };
    if (msg) setAnnouncement(msg);
  }, [board, conflicts]);

  const submitted = game.record.status === "submitted";
  const [resultDismissed, setResultDismissed] = useState(false);
  const onSubmit = useCallback(() => {
    if (!pending) dispatch({ type: "submit" });
  }, [pending, dispatch]);
  const submitResult = [...game.record.log]
    .reverse()
    .find((e) => e.type === "submit");
  // Baseline is the submit already in the log at mount, so resuming a submitted game stays silent.
  // Adjusting state during render (not in an effect) keeps it to one render pass.
  const [seenSubmit, setSeenSubmit] = useState(submitResult);
  if (submitResult !== seenSubmit) {
    setSeenSubmit(submitResult);
    if (submitResult?.type === "submit")
      setAnnouncement(describeSubmit(submitResult.result));
  }
  const resultOpen = submitted && !resultDismissed;
  // A correct solve shows its analysis once the result dialog is dismissed; an incorrect one on request.
  const solvedGame =
    submitResult?.type === "submit" && submitResult.result === "solved";
  const [analysisRequested, setAnalysisRequested] = useState(false);
  const [analysisClosed, setAnalysisClosed] = useState(false);
  const showAnalysis =
    submitted &&
    !resultOpen &&
    !analysisClosed &&
    (analysisRequested || solvedGame);
  const { state: analysis, refetch: refetchAnalysis } = useAnalysis(
    showAnalysis ? game.record : null,
  );
  // Callback ref: the panel is lazy, so it may mount after the render that opened it.
  const analysisRef = useCallback((el: HTMLElement | null) => el?.focus(), []);
  const marks = useMemo(() => {
    if (!showAnalysis || analysis.status !== "ready") return undefined;
    const [root, ...rest] = analysis.result.mistakes.highlight;
    if (root === undefined) return undefined;
    const m = new Map<number, "root" | "support">(
      rest.map((c) => [c, "support"]),
    );
    m.set(root, "root");
    return m;
  }, [showAnalysis, analysis]);
  // Timeline preview: a step short of the end shows an earlier position, read-only and local to
  // the UI; the store is never touched.
  const [previewStep, setPreviewStep] = useState<number | null>(null);
  // Step k keeps the first k path events; the store reopens the submitted game on that node.
  const onRewind = useCallback(
    (step: number) => {
      const path = replayRecord(game.record).path;
      if (step < 0 || step > path.length) return;
      dispatch({ type: "rewind", to: step === 0 ? -1 : path[step - 1]!.id });
      setPreviewStep(null);
      setAnalysisRequested(false);
      setAnalysisClosed(false);
      setResultDismissed(false);
    },
    [game.record, dispatch],
  );
  const timeline = useMemo(
    () =>
      showAnalysis && analysis.status === "ready"
        ? replayRecord(game.record)
        : null,
    [showAnalysis, analysis.status, game.record],
  );
  const preview =
    timeline && previewStep !== null && previewStep < timeline.path.length
      ? (timeline.states[previewStep] ?? null)
      : null;
  const previewConflicts = useMemo(
    () => (preview ? findConflicts([...preview.board]) : NO_CELLS),
    [preview],
  );
  const previewMarks =
    preview && analysis.status === "ready" && timeline
      ? marksAtStep(
          marks,
          analysis.result.mistakes.root?.mistake.index ?? null,
          timeline.path.length,
          previewStep ?? 0,
        )
      : marks;
  const errors = useMemo(
    () => submitErrors(game.record, board),
    [game.record, board],
  );

  const checkKey = `${game.record.cursor}:${game.record.nodes.length}`;
  const [checked, setChecked] = useState<{
    key: string;
    mistakes: number;
    wrong: number[];
  } | null>(null);
  const onCheck = useCallback(() => {
    if (pending) return;
    const { mistakes, wrong } = checkBoard(game.record, board);
    dispatch({ type: "check", mistakes });
    setChecked({ key: checkKey, mistakes, wrong });
    setAnnouncement(describeCheck(mistakes));
  }, [pending, game.record, board, dispatch, checkKey]);
  // A result describes one board position; any edit, undo or rewind makes it stale.
  const checkResult = checked && checked.key === checkKey ? checked : null;
  const wrongSet = useMemo(
    () =>
      settings.checkHighlighting && checkResult
        ? new Set(checkResult.wrong)
        : undefined,
    [settings.checkHighlighting, checkResult],
  );

  // Escalation is per board position: any edit, undo or rewind changes the key and starts over.
  const [hintState, setHintState] = useState<{
    key: string;
    hint: Hint;
  } | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const currentHint =
    hintState && hintState.key === checkKey ? hintState.hint : null;
  const hintKeyRef = useRef(checkKey);
  useEffect(() => {
    hintKeyRef.current = checkKey;
  }, [checkKey]);
  const onHint = useCallback(() => {
    if (pending || hintBusy || submitted || pausedRef.current) return;
    const tier: HintTier = !currentHint
      ? "nudge"
      : currentHint.tier === "nudge"
        ? "technique"
        : "reveal";
    const key = checkKey;
    setHintBusy(true);
    getEngineClient()
      .hint(game.record, tier)
      .then(
        (h) => {
          if (hintKeyRef.current !== key) return; // the board moved on meanwhile
          dispatch({ type: "hint", tier, step: h.logId });
          setHintState({ key, hint: h });
          setAnnouncement(h.text);
        },
        () => setAnnouncement("Hint could not be computed. Please try again."),
      )
      .finally(() => setHintBusy(false));
  }, [
    pending,
    hintBusy,
    submitted,
    currentHint,
    checkKey,
    game.record,
    dispatch,
  ]);
  useEffect(() => {
    onHintRef.current = onHint;
  }, [onHint]);
  const onApplyHint = useCallback(() => {
    const p = currentHint?.placement;
    if (!currentHint || !p) return;
    setSelected(p.cell);
    dispatch({
      type: "hint-reveal",
      cell: p.cell,
      digit: p.digit,
      step: currentHint.logId,
    });
  }, [currentHint, dispatch]);
  const hintMarks = useMemo(() => {
    if (!currentHint) return undefined;
    const m = new Map<number, CellMark>();
    for (const u of currentHint.units)
      for (const c of UNITS[u] ?? []) m.set(c, "hint-unit");
    for (const c of currentHint.cells) m.set(c, "hint");
    return m;
  }, [currentHint]);

  return (
    <div
      className="app"
      data-left-handed={settings.leftHanded ? "" : undefined}
    >
      <header className="app-header">
        <h1>Sudoku</h1>
        <NewGame
          pending={pending}
          inProgress={hasProgress(game.record)}
          onNewGame={onNewGame}
          onDaily={onDaily}
        />
        {game.record.source === "daily" && (
          <span className="daily-badge">
            <span aria-hidden="true">★ </span>Daily
          </span>
        )}
        <button
          type="button"
          className="ctl"
          aria-haspopup="dialog"
          onClick={() => setShareOpen(true)}
        >
          Share
        </button>
        <button
          type="button"
          className="ctl"
          aria-haspopup="dialog"
          disabled={pending}
          onClick={() => setImportOpen(true)}
        >
          Import
        </button>
        <button
          type="button"
          className="ctl"
          onClick={() => setHelpOpen(true)}
          aria-keyshortcuts="?"
        >
          Shortcuts
        </button>
        <button
          type="button"
          className="ctl"
          onClick={() => setStatsOpen(true)}
        >
          Stats
        </button>
        <button
          type="button"
          className="ctl"
          onClick={() => setSettingsOpen(true)}
        >
          Settings
        </button>
        <button
          type="button"
          className="ctl"
          data-display-toggle
          onClick={onDisplay}
        >
          Display
        </button>
      </header>
      <main className="play">
        {paused ? (
          <PauseOverlay onResume={onResume} />
        ) : (
          <Board
            givens={givens}
            board={preview ? [...preview.board] : board}
            notes={preview ? preview.notes : notes}
            selected={preview ? null : selected}
            conflicts={preview ? previewConflicts : conflicts}
            wrong={preview ? undefined : wrongSet}
            marks={previewMarks ?? hintMarks}
            preview={preview !== null}
            solved={solvedGame && preview === null}
            onSelect={preview ? noop : onSelectCell}
            lockedDigit={entry.locked}
          />
        )}
        <div className="play-side">
          <Controls
            canUndo={game.canUndo}
            canRedo={game.canRedo}
            onUndo={onUndo}
            onRedo={onRedo}
            onReset={onReset}
            notesMode={notesMode}
            shiftHeld={shiftHeld}
            autoCandidates={settings.autoCandidates}
            onToggleNotes={() => setNotesMode((on) => !on)}
            onAutoNotes={onAutoNotes}
            onToggleAuto={onToggleAuto}
            onPause={onPause}
            paused={paused}
            digitFirst={digitFirst}
            onToggleEntry={onToggleEntry}
            onCheck={onCheck}
            onSubmit={onSubmit}
            submitted={submitted}
            onViewResult={() => setResultDismissed(false)}
            resultOpen={resultOpen}
            checkResult={checkResult}
            hintButton={
              <HintButton
                busy={hintBusy}
                disabled={submitted || pending}
                onHint={onHint}
              />
            }
          />
          {!paused && currentHint && (
            <HintPanel
              hint={currentHint}
              canApply={!submitted}
              onApply={onApplyHint}
            />
          )}
          {showAnalysis && (
            <Suspense fallback={null}>
              <AnalysisPanel
                ref={analysisRef}
                state={analysis}
                onRetry={refetchAnalysis}
                path={timeline?.path}
                step={previewStep ?? undefined}
                onStep={setPreviewStep}
                onRewind={onRewind}
                onClose={() => {
                  setAnalysisClosed(true);
                  setAnalysisRequested(false);
                  setPreviewStep(null);
                }}
              />
            </Suspense>
          )}
          {!paused && (
            <Pad
              board={board}
              onDigit={onDigit}
              onErase={onErase}
              notesMode={noting}
              lockedDigit={digitFirst ? entry.locked : null}
            />
          )}
          <SidePanel
            record={game.record}
            showTimer={settings.showTimer}
            wallClock={settings.wallClock}
          />
        </div>
      </main>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onChange={update}
          onToggleEntry={onToggleEntry}
          onToggleAuto={onToggleAuto}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {resultOpen && submitResult?.type === "submit" && (
        <SubmitDialog
          result={submitResult.result}
          wrong={errors.wrong}
          blank={errors.blank}
          onClose={() => setResultDismissed(true)}
          onNewGame={() => {
            setResultDismissed(true);
            // The modal keeps the page inert until it unmounts, so click after the next frame.
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLButtonElement>("[data-new-game]")
                ?.click(),
            );
          }}
          onAnalyze={() => {
            setAnalysisClosed(false);
            setAnalysisRequested(true);
            setResultDismissed(true);
          }}
        />
      )}
      {shareOpen && (
        <ShareDialog
          puzzle={game.record.puzzle}
          url={puzzleUrl(
            parseGrid(game.record.puzzle),
            window.location.origin + window.location.pathname,
          )}
          onClose={() => setShareOpen(false)}
        />
      )}
      {importOpen && (
        <ImportDialog
          onCancel={() => setImportOpen(false)}
          onImport={(p) => {
            setImportOpen(false);
            if (hasProgress(game.record)) setImportConfirm(p);
            else onImport(p);
          }}
        />
      )}
      {importConfirm && (
        <ConfirmDialog
          title="Abandon this game?"
          message={`Starting the imported ${importConfirm.level} puzzle discards your progress on this puzzle. It is kept in your history as abandoned.`}
          confirmLabel="Abandon and import"
          cancelLabel="Keep playing"
          onCancel={() => setImportConfirm(null)}
          onConfirm={() => {
            const p = importConfirm;
            setImportConfirm(null);
            onImport(p);
          }}
        />
      )}
      {helpOpen && <ShortcutsDialog onClose={() => setHelpOpen(false)} />}
      {statsOpen && (
        <StatsDialog
          loadArchive={persistence.list}
          onClose={() => setStatsOpen(false)}
        />
      )}
    </div>
  );
}
