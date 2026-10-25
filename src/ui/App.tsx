import { useCallback, useEffect, useState } from "react";
import type { Digit } from "../engine";
import { SAMPLE_EASY } from "../engine/samples";
import { createGameStore, newGameRecord } from "../state/store";
import { Board } from "./components/Board";
import { Pad } from "./components/Pad";
import { ThemeToggle } from "./components/ThemeToggle";
import { actionForKey } from "./keyboard";
import { moveSelection } from "./selection";
import { GameProvider, useGame } from "./useGame";
import { useVisibility } from "./useVisibility";

// ?test=1 exposes a controllable clock for e2e (docs/ARCHITECTURE.md, "Testing hooks").
function makeStore() {
  let offset = 0;
  const testMode = new URLSearchParams(window.location.search).has("test");
  const now = () => Date.now() + offset;
  const store = createGameStore(
    newGameRecord({
      id: "sample",
      puzzle: SAMPLE_EASY.puzzle,
      solution: SAMPLE_EASY.solution,
      level: "easy",
      createdAt: Date.now(),
    }),
    testMode ? { now } : {},
  );
  if (testMode) {
    (window as unknown as { __sudoku: unknown }).__sudoku = {
      advance: (ms: number) => void (offset += ms),
      store,
    };
  }
  return store;
}

export function App() {
  // Created once per mount; M4 persistence will supply a resumed record here.
  const [store] = useState(makeStore);
  useVisibility(store);
  return (
    <GameProvider store={store}>
      <Game />
    </GameProvider>
  );
}

function Game() {
  const { game, dispatch } = useGame();
  // Selection is UI state; board state lives in the store.
  const [selected, setSelected] = useState<number | null>(null);
  const { givens, board, conflicts } = game;
  const act = useCallback(
    (action: NonNullable<ReturnType<typeof actionForKey>>, input: "keyboard" | "pad" = "keyboard") => {
      if (action.type === "move") {
        setSelected((cell) => moveSelection(cell ?? 0, action.direction));
        return;
      }
      if (selected === null) return;
      if (action.type === "place")
        dispatch({ type: "place", cell: selected, digit: action.digit, input });
      else dispatch({ type: "erase", cell: selected });
    },
    [selected, dispatch],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, dialog")) return;
      const action = actionForKey(e);
      if (!action) return;
      e.preventDefault();
      act(action);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act]);

  // Keep keyboard focus on the selected cell so screen readers follow the selection.
  useEffect(() => {
    if (selected === null) return;
    const el = document.querySelector<HTMLButtonElement>(`[data-cell="${selected}"]`);
    if (el && document.activeElement?.closest(".board")) el.focus();
  }, [selected]);

  const onSelect = setSelected;
  const onDigit = useCallback((digit: Digit) => act({ type: "place", digit }, "pad"), [act]);
  const onErase = useCallback(() => act({ type: "erase" }), [act]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Sudoku</h1>
        <ThemeToggle />
      </header>
      <main className="play">
        <Board
          givens={givens}
          board={board}
          selected={selected}
          conflicts={conflicts}
          onSelect={onSelect}
        />
        <Pad board={board} onDigit={onDigit} onErase={onErase} />
      </main>
    </div>
  );
}
