// Selection is UI state, not game state: it is never logged, replayed or persisted.

export type Direction = "up" | "down" | "left" | "right";

/** Next selected cell after an arrow-style move; wraps at the board edges. */
export function moveSelection(cell: number, direction: Direction): number {
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
