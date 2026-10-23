import type { Digit } from "../engine";
import type { Direction, SkeletonAction } from "../state/skeleton";

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
export function actionForKey(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">): SkeletonAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const direction = MOVES[e.key] ?? MOVES[e.key.toLowerCase()];
  if (direction) return { type: "move", direction };
  if (e.key >= "1" && e.key <= "9" && e.key.length === 1) return { type: "place", digit: Number(e.key) as Digit };
  if (e.key === "0" || e.key === "Backspace" || e.key === "Delete") return { type: "erase" };
  return null;
}
