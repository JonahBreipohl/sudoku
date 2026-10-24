import { CELL_COUNT, parseGrid, serializeGrid, type CellValue, type Grid } from "./grid";
import { findConflicts } from "./validate";
import { countSolutions } from "./solver";

export type PuzzleParseFailure = "wrong-length" | "invalid-characters" | "rule-conflict" | "no-solution" | "multiple-solutions";

export type PuzzleParseResult = { ok: true; grid: CellValue[] } | { ok: false; reason: PuzzleParseFailure };

const PUZZLE_PARAM = /[?&]puzzle=([^&#\s]*)/;

function extractCells(text: string): string {
  const match = PUZZLE_PARAM.exec(text);
  if (match?.[1] !== undefined) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  return text;
}

/**
 * Accepts an 81-char string ('.' or '0' for blanks), nine lines, or a URL carrying `?puzzle=`.
 * Only playable puzzles pass: no rule conflicts and exactly one solution. Checks run cheapest
 * first so the reason names the earliest thing wrong.
 */
export function parsePuzzleInput(text: string): PuzzleParseResult {
  const chars = extractCells(text).replace(/\s+/g, "");
  if (chars.length !== CELL_COUNT) return { ok: false, reason: "wrong-length" };
  if (!/^[0-9.]+$/.test(chars)) return { ok: false, reason: "invalid-characters" };
  const grid = parseGrid(chars);
  if (findConflicts(grid).size > 0) return { ok: false, reason: "rule-conflict" };
  const solutions = countSolutions(grid, 2);
  if (solutions === 0) return { ok: false, reason: "no-solution" };
  if (solutions > 1) return { ok: false, reason: "multiple-solutions" };
  return { ok: true, grid };
}

/** Share URL for a puzzle: `base` with any fragment and earlier puzzle param replaced. */
export function puzzleUrl(grid: Grid, base: string): string {
  const [beforeHash = ""] = base.split("#");
  const [path = "", query = ""] = beforeHash.split("?");
  const kept = query.split("&").filter((p) => p !== "" && !p.startsWith("puzzle="));
  kept.push(`puzzle=${serializeGrid(grid)}`);
  return `${path}?${kept.join("&")}`;
}
