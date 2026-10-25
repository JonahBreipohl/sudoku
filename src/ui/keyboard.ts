import type { Digit } from "../engine";
import type { Direction } from "./selection";

export type KeyAction =
  | { type: "move"; direction: Direction }
  | { type: "place"; digit: Digit }
  | { type: "erase" }
  | { type: "note"; digit: Digit }
  | { type: "toggle-notes" };

const MOVES: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  k: "up",
  j: "down",
  h: "left",
  l: "right",
};

/** Maps a key press to a game action, or null when the key is not a game key. */
export function actionForKey(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey"> & { shiftKey?: boolean; code?: string },
): KeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  // Shift turns digit keys into symbols ("!"), so the physical key code identifies the digit.
  const shiftDigit = e.shiftKey ? /^(?:Digit|Numpad)([1-9])$/.exec(e.code ?? "") : null;
  if (shiftDigit) return { type: "note", digit: Number(shiftDigit[1]) as Digit };
  if (e.key === "n" || e.key === "N") return { type: "toggle-notes" };
  const direction = MOVES[e.key] ?? MOVES[e.key.toLowerCase()];
  if (direction) return { type: "move", direction };
  if (e.key >= "1" && e.key <= "9" && e.key.length === 1) return { type: "place", digit: Number(e.key) as Digit };
  if (e.key === "0" || e.key === "Backspace" || e.key === "Delete") return { type: "erase" };
  return null;
}
