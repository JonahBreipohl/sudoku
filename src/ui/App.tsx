import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { UNITS, type Digit } from "../engine";
import type { Hint } from "../analysis/hints";
import type { HintTier } from "../state/events";
import { HintButton, HintPanel } from "./components/HintButton";
import type { Level } from "../engine/step";
import { SAMPLE_EASY } from "../engine/samples";
import { createLocalStoragePersistence } from "../state/persistence";
import { checkBoard, checkMessage, wrongCells } from "../state/check";
import { hasProgress } from "../state/progress";
import { activeMs, isPaused } from "../state/timer";
import type { GameRecord } from "../state/events";
import {
  createPlayedStore,
  createPuzzleSource,
  type PlayedStore,
  type PuzzleSource,
} from "../state/puzzles";
import type { Assist } from "../state/settings";
import { getEngineClient } from "../workers/client";
import { createGameStore, newGameRecord } from "../state/store";
import { newGame, type PuzzleSupplier } from "../state/newGame";
import { dailyLevel, dailyPuzzle, dailySolvedOn } from "../state/daily";
import { recordFromSearch } from "../state/puzzleParam";
import { freshStartRecord } from "../state/freshStart";
import type { CellMark } from "./components/Cell";
import { Board } from "./components/Board";
import { SubmitDialog } from "./components/SubmitDialog";
import { submitErrors } from "../state/store";
import { Controls } from "./components/Controls";
import { AssistSwitch } from "./components/AssistSwitch";
import { PauseOverlay } from "./components/PauseOverlay";
import { NewGame } from "./components/NewGame";
import { Pad } from "./components/Pad";
import { actionForKey } from "./keyboard";
import { cellCommitCounts } from "./renderProbe";
import { moveSelection } from "./selection";
import { describeChange, describeCheck, describeSubmit, describeUnits } from "./announce";
import { unitsCompletedBy } from "./unitComplete";
import { prefersReducedMotion, RIPPLE_DIALOG_DELAY_MS } from "./ripple";
import { useSettings } from "./useSettings";
import { haptic } from "./haptics";
import { ThemeToggle } from "./components/ThemeToggle";
import { GameProvider, useGame } from "./useGame";
import { useVisibility } from "./useVisibility";
import { assistView } from "./assist";
import { formatElapsed } from "./clock";
import { app, assist as assistCopy, controls as controlsCopy, HOME_URL } from "./strings";
import {
  modeFromSearch,
  pauseForDisplay,
  searchForMode,
  type AppMode,
} from "./display/mode";

// ?test=1 exposes a controllable clock for e2e (docs/ARCHITECTURE.md, "Testing hooks").
// Split out of the initial bundle: Display mode is not needed to start solving.
const DisplayMode = lazy(() =>
  import("./display/DisplayMode").then((m) => ({ default: m.DisplayMode })),
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

// One played-id store shared by regular games and the daily, so the daily's bank puzzle is skipped.
let sharedPlayed: PlayedStore | null = null;
const getPlayed = () => (sharedPlayed ??= createPlayedStore());

// A first launch (nothing saved, no ?puzzle= link) starts on a random Easy bank puzzle. ?test=1
// keeps the deterministic sample so e2e specs that assume it stay synchronous.
function needsFreshStart(): boolean {
  return (
    !testMode &&
    !persistence.loadCurrent() &&
    !recordFromSearch(window.location.search, 0)
  );
}

export function App({ source }: { source?: PuzzleSource } = {}) {
  const [fresh, setFresh] = useState<GameRecord | null | undefined>(() =>
    needsFreshStart() ? undefined : null,
  );
  useEffect(() => {
    if (fresh !== undefined) return;
    freshStartRecord({
      fetch: (url) => fetch(url),
      baseUrl: import.meta.env.BASE_URL + "puzzles/",
      played: getPlayed(),
    }).then(setFresh, () => setFresh(null)); // bank unavailable: fall back to the sample
  }, [fresh]);
  if (fresh === undefined) return null;
  return <AppReady source={source} initial={fresh ?? undefined} />;
}

function AppReady({
  source,
  initial,
}: {
  source?: PuzzleSource;
  initial?: GameRecord;
}) {
  // A saved game, if any, resumes on first mount; "New game" swaps in a fresh store.
  const [store, setStore] = useState(() => makeStore(initial));
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
        played: getPlayed(),
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
            played: getPlayed(),
          }),
      },
      dailyLevel(date),
    );
  }, [start]);
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
            next === "display" ? ".display-exit" : '.cell[tabindex="0"]',
          )
          ?.focus(),
      );
    },
    [store],
  );
  // Display has no button in the minimal Play screen; it is reached with ?mode=display.
  const display = mode === "display";
  // Game stays mounted (hidden) in Display so selection, notes mode and other local UI state survive the round trip.
  // Crossfade back from Display only; the first load should not animate.
  const [visitedDisplay, setVisitedDisplay] = useState(false);
  if (display && !visitedDisplay) setVisitedDisplay(true);
  return (
    <GameProvider store={store}>
      <div hidden={display} className={visitedDisplay ? "mode-fade" : undefined}>
        <Game
          key={store.getSnapshot().record.id}
          active={!display}
          pending={pending}
          onNewGame={onNewGame}
          onDaily={onDaily}
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
}: {
  active: boolean;
  pending: boolean;
  onNewGame: (level: Level) => void;
  onDaily: () => void;
}) {
  const { game, dispatch } = useGame();
  // Selection is UI state; board state lives in the store.
  const [selected, setSelected] = useState<number | null>(null);
  // Notes have no on-screen button: N toggles them and Shift+digit writes one, on a keyboard.
  const [notesMode, setNotesMode] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const { settings, update } = useSettings();
  const { givens, board, notes, conflicts } = game;
  const view = assistView(settings.assist);
  const onAssist = useCallback((a: Assist) => update({ assist: a }), [update]);
  const noting = notesMode || shiftHeld;
  const paused = isPaused(game.record) && game.record.status === "playing";
  const submitted = game.record.status === "submitted";
  const refocusBoard = useRef(false);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  // There is no Pause button any more, but a game saved while paused still opens paused.
  const onResume = useCallback(() => {
    if (!pausedRef.current) return;
    refocusBoard.current = true;
    dispatch({ type: "resume" });
  }, [dispatch]);
  const onHintRef = useRef<() => void>(noop);
  const dismissHintRef = useRef<() => void>(noop);
  const act = useCallback(
    (
      action: NonNullable<ReturnType<typeof actionForKey>>,
      input: "keyboard" | "pad" = "keyboard",
      code?: string,
    ) => {
      // Input is ignored while a new puzzle generates: the swap would discard it.
      if (pending && action.type !== "move") return;
      switch (action.type) {
        case "hint":
          onHintRef.current();
          return;
        case "undo":
        case "redo":
          dispatch({ type: action.type });
          return;
        case "move":
          setSelected((cell) => moveSelection(cell ?? 0, action.direction));
          return;
        case "toggle-notes":
          setNotesMode((on) => !on);
          return;
        case "escape":
          dismissHintRef.current();
          return;
        case "pause":
        case "help":
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
    [selected, dispatch, noting, board, notes, pending],
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

  // Cells are memoized on onSelect, so it must stay stable.
  const onSelectCell = useCallback((cell: number) => setSelected(cell), []);
  const onDigit = useCallback(
    (digit: Digit) => act({ type: "place", digit }, "pad"),
    [act],
  );
  const onErase = useCallback(() => act({ type: "erase" }), [act]);
  const onUndo = useCallback(() => {
    if (!pending) dispatch({ type: "undo" });
  }, [dispatch, pending]);

  // Hard hides conflicts everywhere: on the board, in announcements and in haptics.
  const shownConflicts = view.conflicts ? conflicts : NO_CELLS;
  const liveWrong = useMemo(
    () =>
      view.liveWrong
        ? wrongCells(game.record.puzzle, game.record.solution, board)
        : [],
    [view.liveWrong, game.record.puzzle, game.record.solution, board],
  );

  // Polite live region: placements and conflicts are diffed from the board, completion comes from the submit event; Check
  // results are announced by their own handler. Resume/new-game remounts start with a fresh baseline.
  const [announcement, setAnnouncement] = useState("");
  const prevView = useRef({ board, conflicts: shownConflicts });
  const prevNodeCount = useRef(game.record.nodes.length);
  // Cells of units a placement just completed, mapped to their sweep order. Alternating the
  // phase restarts the CSS animation when two moves in a row complete units.
  const [sweep, setSweep] = useState<{ order: ReadonlyMap<number, number>; phase: 0 | 1 } | null>(null);
  const sweepPhase = useRef<0 | 1>(0);
  useEffect(() => {
    const prev = prevView.current;
    let msg = describeChange(prev, { board, conflicts: shownConflicts });
    prevView.current = { board, conflicts: shownConflicts };
    const { nodes, cursor, solution } = game.record;
    const last = nodes[cursor];
    const grew = nodes.length > prevNodeCount.current;
    prevNodeCount.current = nodes.length;
    // Only a freshly appended place node sweeps: load, undo and redo move the cursor over
    // existing nodes without growing the tree.
    const fresh = grew && cursor === nodes.length - 1;
    const hapticsOn = settings.haptics;
    const wrongPlace =
      fresh && last?.type === "place" && view.liveWrong && String(last.digit) !== solution[last.cell];
    if (wrongPlace) msg = `${msg ?? ""} ${assistCopy.wrong}`.trim();
    if (fresh && (last?.type === "place" || last?.type === "note")) {
      const newConflict = [...shownConflicts].some((c) => !prev.conflicts.has(c));
      haptic(newConflict || wrongPlace ? "conflict" : "place", hapticsOn);
    }
    if (fresh && last?.type === "place") {
      const units = unitsCompletedBy(prev.board, board, conflicts, last.cell);
      if (units.length > 0) {
        const order = new Map<number, number>();
        for (const u of units) u.cells.forEach((c, i) => order.set(c, Math.min(order.get(c) ?? i, i)));
        sweepPhase.current = sweepPhase.current === 0 ? 1 : 0;
        setSweep({ order, phase: sweepPhase.current });
        msg = `${msg ?? ""} ${describeUnits(units)}`.trim();
        haptic("unit", hapticsOn);
      }
    }
    if (msg) setAnnouncement(msg);
  }, [board, conflicts, shownConflicts, game.record, settings.haptics, view.liveWrong]);
  useEffect(() => {
    if (!sweep) return;
    const t = window.setTimeout(() => setSweep(null), 800);
    return () => window.clearTimeout(t);
  }, [sweep]);

  const [resultDismissed, setResultDismissed] = useState(false);
  const submitResult = [...game.record.log]
    .reverse()
    .find((e) => e.type === "submit");
  // Baseline is the submit already in the log at mount, so resuming a submitted game stays silent.
  // Adjusting state during render (not in an effect) keeps it to one render pass.
  const [seenSubmit, setSeenSubmit] = useState(submitResult);
  if (submitResult !== seenSubmit) {
    setSeenSubmit(submitResult);
    if (submitResult?.type === "submit") {
      setAnnouncement(describeSubmit(submitResult.result));
      if (submitResult.result === "solved") haptic("solve", settings.haptics);
    }
  }
  const solvedGame =
    submitResult?.type === "submit" && submitResult.result === "solved";
  // Let the completion ripple play before the dialog covers it; reduced motion opens at once.
  const [rippleSeen, setRippleSeen] = useState<typeof submitResult>(undefined);
  const rippleWait = solvedGame && !prefersReducedMotion() && rippleSeen !== submitResult;
  useEffect(() => {
    if (!rippleWait) return;
    const t = window.setTimeout(() => setRippleSeen(submitResult), RIPPLE_DIALOG_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [rippleWait, submitResult]);
  const resultOpen = submitted && !resultDismissed && !rippleWait;
  const lastPlaced = [...game.record.nodes].reverse().find((n) => n.type === "place");
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
  // A result describes one board position; any edit or undo makes it stale.
  const checkResult = checked && checked.key === checkKey ? checked : null;
  const wrongSet = useMemo(
    () =>
      liveWrong.length > 0 || checkResult
        ? new Set([...liveWrong, ...(checkResult?.wrong ?? [])])
        : undefined,
    [liveWrong, checkResult],
  );

  // Escalation is per board position: any edit or undo changes the key and starts over.
  const [hintState, setHintState] = useState<{
    key: string;
    hint: Hint;
  } | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  // Leaving Easy hides a hint already on screen.
  const currentHint =
    view.hints && hintState && hintState.key === checkKey ? hintState.hint : null;
  const hintKeyRef = useRef(checkKey);
  useEffect(() => {
    hintKeyRef.current = checkKey;
  }, [checkKey]);
  // Each press goes one tier further; once the answer shows there is nothing more to ask for.
  const nextTier: HintTier | null = !currentHint
    ? "nudge"
    : currentHint.tier === "nudge"
      ? "technique"
      : currentHint.tier === "technique"
        ? "reveal"
        : null;
  const onHint = useCallback(() => {
    if (!view.hints || pending || hintBusy || submitted || pausedRef.current) return;
    const tier = nextTier;
    if (!tier) return;
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
          // A hint about one cell selects it, so the player can type the fix straight away.
          const focus = h.kind === "mistake" || (h.units.length === 0 && h.cells.length === 1) ? h.cells[0] : undefined;
          if (focus !== undefined) setSelected(focus);
        },
        () => setAnnouncement(app.hintFailed),
      )
      .finally(() => setHintBusy(false));
  }, [
    view.hints,
    pending,
    hintBusy,
    submitted,
    nextTier,
    checkKey,
    game.record,
    dispatch,
  ]);
  const onDismissHint = useCallback(() => setHintState(null), []);
  useEffect(() => {
    onHintRef.current = onHint;
    dismissHintRef.current = onDismissHint;
  }, [onHint, onDismissHint]);
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
    <div className="app">
      <header className="app-header">
        {/* Phones show only the arrow; the name stays as the link's accessible name. */}
        <a className="home-link" href={HOME_URL}>
          <span aria-hidden="true">←</span> <span className="home-name">{app.homeName}</span>
        </a>
        <h1>{app.title}</h1>
        {game.record.source === "daily" && (
          <span className="daily-badge">
            <span aria-hidden="true">★ </span>Daily
          </span>
        )}
        <NewGame
          pending={pending}
          inProgress={hasProgress(game.record)}
          onNewGame={onNewGame}
          onDaily={onDaily}
          isDailySolved={() => dailySolvedOn(new Date(), [...persistence.list(), game.record])}
        />
        <ThemeToggle />
      </header>
      <main className="play">
        {paused ? (
          <PauseOverlay onResume={onResume} />
        ) : (
          <Board
            givens={givens}
            board={board}
            notes={notes}
            selected={selected}
            conflicts={shownConflicts}
            wrong={wrongSet}
            marks={hintMarks}
            solved={solvedGame}
            rippleOrigin={lastPlaced?.type === "place" ? lastPlaced.cell : null}
            sweep={sweep}
            onSelect={onSelectCell}
          />
        )}
        {!paused && (
          <div className="play-side">
            <div className="toolbar">
              <Controls
                canUndo={game.canUndo}
                onUndo={onUndo}
                onCheck={onCheck}
                submitted={submitted}
                hintButton={
                  view.hints ? (
                    <HintButton
                      busy={hintBusy}
                      disabled={submitted || pending}
                      next={nextTier}
                      onHint={onHint}
                    />
                  ) : undefined
                }
              />
              <AssistSwitch value={settings.assist} onChange={onAssist} />
            </div>
            <div
              role="status"
              className={
                checkResult
                  ? `check-status check-status--${checkResult.mistakes === 0 ? "ok" : "bad"}`
                  : "check-status"
              }
            >
              {checkResult ? checkMessage(checkResult.mistakes) : ""}
            </div>
            {currentHint && (
              <HintPanel
                hint={currentHint}
                canApply={!submitted}
                onApply={onApplyHint}
                onClose={onDismissHint}
              />
            )}
            <Pad
              board={board}
              onDigit={onDigit}
              onErase={onErase}
              notesMode={noting}
            />
            <p className="keys-hint">
              {noting ? (
                <strong>
                  <span aria-hidden="true">✎ </span>
                  {controlsCopy.notesOn}
                </strong>
              ) : (
                controlsCopy.keysHint
              )}
            </p>
          </div>
        )}
      </main>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      {resultOpen && submitResult?.type === "submit" && (
        <SubmitDialog
          result={submitResult.result}
          time={formatElapsed(activeMs(game.record, submitResult.at))}
          hints={game.record.log.filter((e) => e.type === "hint").length}
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
        />
      )}
    </div>
  );
}
