import type { Digit } from "../engine";
import type { EntryMode } from "../state/settings";

/** UI-only entry state: which mode is active and, in digit-first, which digit is locked. */
export interface InputModeState {
  mode: EntryMode;
  locked: Digit | null;
}

export type InputModeAction =
  | { type: "set-mode"; mode: EntryMode }
  | { type: "toggle-mode" }
  | { type: "digit"; digit: Digit }
  | { type: "unlock" };

export function initialInputMode(mode: EntryMode = "cell-first"): InputModeState {
  return { mode, locked: null };
}

export function inputModeReducer(state: InputModeState, action: InputModeAction): InputModeState {
  switch (action.type) {
    case "set-mode":
      // The lock only means something in digit-first, so leaving the mode drops it.
      return action.mode === state.mode ? state : { mode: action.mode, locked: null };
    case "toggle-mode":
      return { mode: state.mode === "digit-first" ? "cell-first" : "digit-first", locked: null };
    case "digit":
      if (state.mode !== "digit-first") return state;
      // Pressing the locked digit again releases it.
      return { ...state, locked: state.locked === action.digit ? null : action.digit };
    case "unlock":
      return state.locked === null ? state : { ...state, locked: null };
  }
}

export type CellTap = { type: "place"; digit: Digit } | { type: "erase" } | null;

/** What tapping a cell does while a digit is locked: place it, or erase it if it is already there. */
export function tapForLockedDigit(state: InputModeState, value: number, given: boolean): CellTap {
  if (state.mode !== "digit-first" || state.locked === null || given) return null;
  return value === state.locked ? { type: "erase" } : { type: "place", digit: state.locked };
}
