// The ?puzzle=<81 chars> testing hook (docs/ARCHITECTURE.md, "Testing hooks"). Never imports ui.

import { LEVELS, parsePuzzleInput, serializeGrid, solve, type Level } from "../engine";
import { newGameRecord } from "./store";
import type { GameRecord } from "./events";

/**
 * A fresh record for the puzzle named by `?puzzle=`, or null when absent or not playable.
 * `&level=` picks the grading level the analysis is run at (default easy).
 */
export function recordFromSearch(search: string, createdAt: number): GameRecord | null {
  const params = new URLSearchParams(search);
  const raw = params.get("puzzle");
  if (raw === null) return null;
  const parsed = parsePuzzleInput(raw);
  if (!parsed.ok) return null;
  const solution = solve(parsed.grid);
  if (!solution) return null;
  const asked = params.get("level");
  const level: Level = LEVELS.find((l) => l === asked) ?? "easy";
  return newGameRecord({
    id: `url-${createdAt}`,
    puzzle: serializeGrid(parsed.grid),
    solution: serializeGrid(solution),
    level,
    source: "import",
    createdAt,
  });
}
