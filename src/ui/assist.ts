// What each assistance level shows while playing (the Easy / Medium / Hard switch).
// Check is the player's own request, so it works at every level.

import type { Assist } from "../state/settings";

export interface AssistView {
  /** The Hint button (and Shift+H) is offered. */
  hints: boolean;
  /** Entries that differ from the solution are marked as soon as they are placed. */
  liveWrong: boolean;
  /** Digits that repeat in a row, column or box are marked. */
  conflicts: boolean;
}

const VIEWS: Record<Assist, AssistView> = {
  easy: { hints: true, liveWrong: true, conflicts: true },
  medium: { hints: false, liveWrong: true, conflicts: true },
  hard: { hints: false, liveWrong: false, conflicts: false },
};

export function assistView(assist: Assist): AssistView {
  return VIEWS[assist];
}
