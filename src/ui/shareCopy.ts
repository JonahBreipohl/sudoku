import type { PuzzleParseFailure } from "../engine";

export type ImportFailure = PuzzleParseFailure | "ungradable" | "worker";

/** Player-facing wording for each codec failure; each says what to fix. */
export const IMPORT_ERRORS: Record<ImportFailure, string> = {
  "wrong-length": "A puzzle needs exactly 81 cells (digits, with . or 0 for blanks).",
  "invalid-characters": "Only the digits 0-9 and . are allowed in a puzzle.",
  "rule-conflict": "Two equal digits share a row, column or box in this puzzle.",
  "no-solution": "This puzzle has no solution.",
  "multiple-solutions": "This puzzle has more than one solution, so it cannot be played.",
  ungradable: "This puzzle is valid but too hard for the built-in grader, so it cannot be rated.",
  worker: "The puzzle could not be checked. Please try again.",
};

export type CopyOutcome = "copied" | "manual";

/**
 * Copies via the async clipboard API; if that is missing or denied, selects the field and tries
 * execCommand. "manual" means the text is selected and the player must press Ctrl/Cmd+C.
 */
export async function copyText(text: string, field: HTMLInputElement | null): Promise<CopyOutcome> {
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    /* denied or unavailable: fall through */
  }
  if (field) {
    field.focus();
    field.select();
    try {
      if (document.execCommand("copy")) return "copied";
    } catch {
      /* fall through */
    }
  }
  return "manual";
}
