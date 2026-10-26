import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Digit } from "../engine";
import type { Level } from "../engine/step";
import { SAMPLE_EASY } from "../engine/samples";
import { createLocalStoragePersistence } from "../state/persistence";
import { checkBoard } from "../state/check";
import { hasProgress } from "../state/progress";
import { isPaused } from "../state/timer";
import type { GameRecord } from "../state/events";
import { createPlayedStore, createPuzzleSource, type PuzzleSource } from "../state/puzzles";
import { getEngineClient } from "../workers/client";
import { createGameStore, newGameRecord } from "../state/store";
import { newGame, resetGame } from "../state/newGame";
import { Board } from "./components/Board";
import { SubmitDialog } from "./components/SubmitDialog";
import { submitErrors } from "../state/store";
import { Controls } from "./components/Controls";
import { PauseOverlay } from "./components/PauseOverlay";
import { NewGame } from "./components/NewGame";
import { Pad } from "./components/Pad";
import { SidePanel } from "./components/SidePanel";
import { SettingsDialog } from "./components/SettingsDialog";
import { actionForKey } from "./keyboard";
import { ShortcutsDialog } from "./components/ShortcutsDialog";
import { cellCommitCounts } from "./renderProbe";
import { initialInputMode, inputModeReducer, tapForLockedDigit } from "./inputMode";
import { moveSelection } from "./selection";
import { describeChange, describeCheck, describeSubmit } from "./announce";
import { useSettings } from "./useSettings";
import { GameProvider, useGame } from "./useGame";
import { useVisibility } from "./useVisibility";

// ?test=1 exposes a controllable clock for e2e (docs/ARCHITECTURE.md, "Testing hooks").
const testMode = new URLSearchParams(window.location.search).has("test");
let clockOffset = 0;
const persistence = createLocalStoragePersistence();

function makeStore(record?: GameRecord) {
  const now = () => Date.now() + clockOffset;
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
  const onNewGame = useCallback(
    (level: Level) => {
      puzzleSource.current ??= createPuzzleSource({
        fetch: (url) => fetch(url),
        generator: getEngineClient(),
        played: createPlayedStore(),
        baseUrl: import.meta.env.BASE_URL + "puzzles/",
      });
      setPending(true);
      newGame(level, puzzleSource.current, {
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
  useVisibility(store);
  return (
    <GameProvider store={store}>
      <Game key={store.getSnapshot().record.id} pending={pending} onNewGame={onNewGame} />
    </GameProvider>
  );
}

function Game({ pending, onNewGame }: { pending: boolean; onNewGame: (level: Level) => void }) {
  const { game, dispatch } = useGame();
  // Selection is UI state; board state lives in the store.
  const [selected, setSelected] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { settings, update } = useSettings();
  const { givens, board, notes, conflicts } = game;
  const [entry, entryDispatch] = useReducer(inputModeReducer, settings.entryMode, initialInputMode);
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
  const act = useCallback(
    (action: NonNullable<ReturnType<typeof actionForKey>>, input: "keyboard" | "pad" = "keyboard") => {
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
      if (action.type === "hint") return; // hints arrive in M7; the key is reserved
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
        dispatch({ type: "place", cell: selected, digit: action.digit, input });
      else dispatch({ type: "erase", cell: selected });
    },
    [selected, dispatch, noting, board, notes, pending, onPause, onResume, digitFirst],
  );

  useEffect(() => {
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
      act(action);
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
  }, [act, onResume]);

  // Hand focus back to the board once the overlay (and the focused Resume button) is gone.
  useEffect(() => {
    if (paused || !refocusBoard.current) return;
    refocusBoard.current = false;
    document.querySelector<HTMLButtonElement>(`[data-cell="${selected ?? 0}"]`)?.focus();
  }, [paused, selected]);

  // Keep keyboard focus on the selected cell so screen readers follow the selection.
  useEffect(() => {
    if (selected === null) return;
    const el = document.querySelector<HTMLButtonElement>(`[data-cell="${selected}"]`);
    if (el && document.activeElement?.closest(".board")) el.focus();
  }, [selected]);

  // Cells are memoized on onSelect, so the handler stays stable and reads current state via a ref.
  const tapState = { pending, noting, digitFirst, entry, board, notes, givens, dispatch };
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
    const tap = tapForLockedDigit(t.entry, t.board[cell] ?? 0, t.givens[cell] !== 0);
    if (tap?.type === "place") t.dispatch({ type: "place", cell, digit: tap.digit, input: "digit-first" });
    else if (tap?.type === "erase") t.dispatch({ type: "erase", cell });
  }, []);
  const onToggleEntry = useCallback(() => {
    const mode = digitFirst ? "cell-first" : "digit-first";
    entryDispatch({ type: "set-mode", mode });
    update({ entryMode: mode });
  }, [digitFirst, update]);

  const onDigit = useCallback((digit: Digit) => act({ type: "place", digit }, "pad"), [act]);
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
  const submitResult = [...game.record.log].reverse().find((e) => e.type === "submit");
  // Baseline is the submit already in the log at mount, so resuming a submitted game stays silent.
  // Adjusting state during render (not in an effect) keeps it to one render pass.
  const [seenSubmit, setSeenSubmit] = useState(submitResult);
  if (submitResult !== seenSubmit) {
    setSeenSubmit(submitResult);
    if (submitResult?.type === "submit") setAnnouncement(describeSubmit(submitResult.result));
  }
  const errors = useMemo(() => submitErrors(game.record, board), [game.record, board]);

  const checkKey = `${game.record.cursor}:${game.record.nodes.length}`;
  const [checked, setChecked] = useState<{ key: string; mistakes: number; wrong: number[] } | null>(null);
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
    () => (settings.checkHighlighting && checkResult ? new Set(checkResult.wrong) : undefined),
    [settings.checkHighlighting, checkResult],
  );

  return (
    <div className="app" data-left-handed={settings.leftHanded ? "" : undefined}>
      <header className="app-header">
        <h1>Sudoku</h1>
        <NewGame pending={pending} inProgress={hasProgress(game.record)} onNewGame={onNewGame} />
        <button type="button" className="ctl" onClick={() => setHelpOpen(true)} aria-keyshortcuts="?">
          Shortcuts
        </button>
        <button type="button" className="ctl" onClick={() => setSettingsOpen(true)}>
          Settings
        </button>
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
            conflicts={conflicts}
            wrong={wrongSet}
            onSelect={onSelectCell}
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
            checkResult={checkResult}
          />
          {!paused && <Pad board={board} onDigit={onDigit} onErase={onErase} notesMode={noting} lockedDigit={digitFirst ? entry.locked : null} />}
          <SidePanel record={game.record} showTimer={settings.showTimer} wallClock={settings.wallClock} />
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
      {submitted && !resultDismissed && submitResult?.type === "submit" && (
        <SubmitDialog
          result={submitResult.result}
          wrong={errors.wrong}
          blank={errors.blank}
          onClose={() => setResultDismissed(true)}
        />
      )}
      {helpOpen && <ShortcutsDialog onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
