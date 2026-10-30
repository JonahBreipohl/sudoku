import type { PuzzleParseFailure } from "../engine";
import { importErrors } from "./strings";

export type ImportFailure = PuzzleParseFailure | "ungradable" | "worker";

/** Wording lives in strings.ts; re-exported here for the import flow. */
export const IMPORT_ERRORS: Record<ImportFailure, string> = importErrors as Record<ImportFailure, string>;

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
