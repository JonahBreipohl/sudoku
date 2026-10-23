import { useCallback, useEffect, useMemo, useReducer } from "react";
import { findConflicts, parseGrid, type Digit } from "../engine";
import { SAMPLE_EASY } from "../engine/samples";
import { initSkeleton, skeletonReducer } from "../state/skeleton";
import { Board } from "./components/Board";
import { Pad } from "./components/Pad";
import { ThemeToggle } from "./components/ThemeToggle";
import { actionForKey } from "./keyboard";

const GIVENS = parseGrid(SAMPLE_EASY.puzzle);

export function App() {
  const [state, dispatch] = useReducer(skeletonReducer, GIVENS, initSkeleton);
  const conflicts = useMemo(() => findConflicts(state.board), [state.board]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, dialog")) return;
      const action = actionForKey(e);
      if (!action) return;
      e.preventDefault();
      dispatch(action);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep keyboard focus on the selected cell so screen readers follow the selection.
  useEffect(() => {
    if (state.selected === null) return;
    const el = document.querySelector<HTMLButtonElement>(`[data-cell="${state.selected}"]`);
    if (el && document.activeElement?.closest(".board")) el.focus();
  }, [state.selected]);

  const onSelect = useCallback((cell: number) => dispatch({ type: "select", cell }), []);
  const onDigit = useCallback((digit: Digit) => dispatch({ type: "place", digit }), []);
  const onErase = useCallback(() => dispatch({ type: "erase" }), []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Sudoku</h1>
        <ThemeToggle />
      </header>
      <main className="play">
        <Board
          givens={state.givens}
          board={state.board}
          selected={state.selected}
          conflicts={conflicts}
          onSelect={onSelect}
        />
        <Pad board={state.board} onDigit={onDigit} onErase={onErase} />
      </main>
    </div>
  );
}
