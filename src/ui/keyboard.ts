import type { Digit } from "../engine";
import type { Direction } from "./selection";

export type KeyAction =
  | { type: "move"; direction: Direction }
  | { type: "place"; digit: Digit }
  | { type: "erase" }
  | { type: "note"; digit: Digit }
  | { type: "toggle-notes" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "hint" }
  | { type: "pause" }
  | { type: "help" };

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

type KeyEventLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey"> & { shiftKey?: boolean; code?: string };

interface Binding {
  /** Lowercased `key` values. */
  keys: string[];
  /** Case-sensitive keys, checked before `keys`. */
  exactKeys?: string[];
  /** Ctrl or Cmd must be held (and nothing else but, optionally, Shift where `shift` says so). */
  mod?: boolean;
  /** For mod bindings: true requires Shift, false forbids it. */
  shift?: boolean;
  action: KeyAction;
}

// First match wins, so the case-sensitive H (hint) is listed before the h (move left) entry.
const BINDINGS: Binding[] = [
  { keys: ["z"], mod: true, shift: false, action: { type: "undo" } },
  { keys: ["z"], mod: true, shift: true, action: { type: "redo" } },
  { keys: ["y"], mod: true, shift: false, action: { type: "redo" } },
  // Plain h moves left (hjkl); capital H, i.e. Shift+H, is the hint key.
  { keys: [], exactKeys: ["H"], action: { type: "hint" } },
  { keys: ["p"], action: { type: "pause" } },
  { keys: ["?"], action: { type: "help" } },
  { keys: ["n"], action: { type: "toggle-notes" } },
  { keys: ["0", "backspace", "delete"], action: { type: "erase" } },
  ...(Object.entries(MOVES).map(([key, direction]) => ({
    keys: [key.toLowerCase()],
    action: { type: "move", direction } as KeyAction,
  })) satisfies Binding[]),
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as Digit[]).map((digit) => ({
    keys: [String(digit)],
    action: { type: "place", digit } as KeyAction,
  })),
];

/** Maps a key press to a game action, or null when the key is not a game key. */
export function actionForKey(e: KeyEventLike): KeyAction | null {
  if (e.altKey) return null;
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) {
    // Shift turns digit keys into symbols ("!"), so the physical key code identifies the digit.
    const shiftDigit = e.shiftKey ? /^(?:Digit|Numpad)([1-9])$/.exec(e.code ?? "") : null;
    if (shiftDigit) return { type: "note", digit: Number(shiftDigit[1]) as Digit };
  }
  const lower = e.key.toLowerCase();
  const hit = BINDINGS.find((b) => {
    if (Boolean(b.mod) !== mod) return false;
    if (mod && Boolean(e.shiftKey) !== b.shift) return false;
    return b.exactKeys?.includes(e.key) || b.keys.includes(lower);
  });
  return hit ? hit.action : null;
}

/** What the shortcuts dialog lists; keep in step with BINDINGS. */
export const SHORTCUT_GROUPS: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: "Move",
    items: [
      { keys: ["Arrows", "W A S D", "H J K L"], label: "Move the selection" },
    ],
  },
  {
    title: "Enter",
    items: [
      { keys: ["1-9"], label: "Place a digit (or toggle a note in notes mode)" },
      { keys: ["Shift+1-9"], label: "Toggle a note" },
      { keys: ["0", "Backspace", "Delete"], label: "Erase the cell" },
      { keys: ["N"], label: "Toggle notes mode" },
    ],
  },
  {
    title: "Game",
    items: [
      { keys: ["Ctrl/Cmd+Z"], label: "Undo" },
      { keys: ["Ctrl/Cmd+Shift+Z", "Ctrl+Y"], label: "Redo" },
      { keys: ["Shift+H"], label: "Hint (capital H; plain h moves left)" },
      { keys: ["P"], label: "Pause or resume" },
      { keys: ["?"], label: "Show this list" },
      { keys: ["Esc"], label: "Close a dialog" },
    ],
  },
];
