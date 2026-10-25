import { useCallback, useEffect, useRef, useState } from "react";
import type { Digit } from "../engine";
import type { Level } from "../engine/step";
import { SAMPLE_EASY } from "../engine/samples";
import { createLocalStoragePersistence } from "../state/persistence";
import { hasProgress } from "../state/progress";
import { isPaused } from "../state/timer";
import type { GameRecord } from "../state/events";
import { createPlayedStore, createPuzzleSource, type PuzzleSource } from "../state/puzzles";
import { getEngineClient } from "../workers/client";
import { createGameStore, newGameRecord } from "../state/store";
import { Board } from "./components/Board";
import { Controls } from "./components/Controls";
import { PauseOverlay } from "./components/PauseOverlay";
import { NewGame } from "./components/NewGame";
import { Pad } from "./components/Pad";
import { ThemeToggle } from "./components/ThemeToggle";
import { actionForKey } from "./keyboard";
import { cellCommitCounts } from "./renderProbe";
import { moveSelection } from "./selection";
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
      puzzleSource.current
        .nextPuzzle(level)
        .then((p) => {
          refocusNewGame.current = true;
          setStore(
            makeStore(
              newGameRecord({
                id: p.id,
                puzzle: p.puzzle,
                solution: p.solution,
                level: p.level,
                score: p.score,
                source: p.source,
                createdAt: Date.now(),
              }),
            ),
          );
        })
        .catch(() => {
          /* generation failed or was cancelled: keep the current game */
        })
        .finally(() => setPending(false));
    },
    [],
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
  const { settings, update } = useSettings();
  const { givens, board, notes, conflicts } = game;
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
      if (action.type === "move") {
        setSelected((cell) => moveSelection(cell ?? 0, action.direction));
        return;
      }
      if (action.type === "toggle-notes") {
        setNotesMode((on) => !on);
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
    [selected, dispatch, noting, board, notes, pending],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, dialog")) return;
      if (e.key === "Shift") setShiftHeld(true);
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        if (pausedRef.current) onResume();
        else onPause();
        return;
      }
      if (pausedRef.current) {
        if (e.key === "Enter") {
          e.preventDefault();
          onResume();
        }
        return;
      }
      const action = actionForKey(e);
      if (!action) return;
      e.preventDefault();
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
  }, [act, onPause, onResume]);

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

  const onDigit = useCallback((digit: Digit) => act({ type: "place", digit }, "pad"), [act]);
  const onErase = useCallback(() => act({ type: "erase" }), [act]);

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

  return (
    <div className="app">
      <header className="app-header">
        <h1>Sudoku</h1>
        <NewGame pending={pending} inProgress={hasProgress(game.record)} onNewGame={onNewGame} />
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
            conflicts={conflicts}
            onSelect={setSelected}
          />
        )}
        <div className="play-side">
          <Controls
            notesMode={notesMode}
            shiftHeld={shiftHeld}
            autoCandidates={settings.autoCandidates}
            onToggleNotes={() => setNotesMode((on) => !on)}
            onAutoNotes={onAutoNotes}
            onToggleAuto={onToggleAuto}
            onPause={onPause}
            paused={paused}
          />
          {!paused && <Pad board={board} onDigit={onDigit} onErase={onErase} notesMode={noting} />}
        </div>
      </main>
    </div>
  );
}
