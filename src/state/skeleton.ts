// Walking-skeleton game state: a plain reducer over the current board.
// M4 replaces this with the event-sourced store described in docs/ARCHITECTURE.md;
// keep the action names so the UI wiring carries over.

import { type CellValue, type Digit, type Grid } from "../engine";

export interface SkeletonState {
  givens: Grid;
  board: CellValue[];
  selected: number | null;
}

export type Direction = "up" | "down" | "left" | "right";

export type SkeletonAction =
  | { type: "select"; cell: number }
  | { type: "move"; direction: Direction }
  | { type: "place"; digit: Digit }
  | { type: "erase" };

export function initSkeleton(givens: Grid): SkeletonState {
  return { givens, board: [...givens], selected: null };
}

function moveFrom(cell: number, direction: Direction): number {
  const row = Math.floor(cell / 9);
  const col = cell % 9;
  switch (direction) {
    case "up":
      return ((row + 8) % 9) * 9 + col;
    case "down":
      return ((row + 1) % 9) * 9 + col;
    case "left":
      return row * 9 + ((col + 8) % 9);
    case "right":
      return row * 9 + ((col + 1) % 9);
  }
}

export function skeletonReducer(state: SkeletonState, action: SkeletonAction): SkeletonState {
  switch (action.type) {
    case "select":
      return { ...state, selected: action.cell };
    case "move":
      return { ...state, selected: moveFrom(state.selected ?? 0, action.direction) };
    case "place":
    case "erase": {
      const cell = state.selected;
      if (cell === null || state.givens[cell] !== 0) return state;
      const value: CellValue = action.type === "place" ? action.digit : 0;
      if (state.board[cell] === value) return state;
      const board = [...state.board];
      board[cell] = value;
      return { ...state, board };
    }
  }
}
