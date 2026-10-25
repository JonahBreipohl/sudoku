// Puzzle bank format (docs/ARCHITECTURE.md, "Puzzle bank"): schema validator plus the pure
// extend/serialize logic behind scripts/generate-bank.ts, kept here so tests can reach it.

import { grade } from "./grade";
import { parseGrid } from "./grid";
import { generate } from "./generate";
import { hasUniqueSolution } from "./solver";
import { LEVELS, TECHNIQUES, type Level } from "./step";
import { isSolved, respectsGivens } from "./validate";

export interface BankPuzzle {
  id: string;
  puzzle: string;
  solution: string;
  score: number;
  hardest: string | null;
}

export interface Bank {
  version: 1;
  level: Level;
  generated: string;
  puzzles: BankPuzzle[];
}

export interface ValidateOptions {
  /** Also check what needs solving: unique solution, and the grader agrees with level, score and hardest. */
  deep?: boolean;
}

export type BankValidation = { ok: true } | { ok: false; errors: string[] };

const LEVEL_PREFIX: Readonly<Record<Level, string>> = { easy: "e", medium: "m", hard: "h", expert: "x", master: "s" };
const TECHNIQUE_IDS: ReadonlySet<string> = new Set(TECHNIQUES.map((t) => t.id));
const ID_PATTERN = /^[a-z]-\d{6}$/;
const MAX_ERRORS = 20;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Checks schema, uniqueness of ids and puzzles, level labels and score order. Never throws. */
export function validateBank(json: unknown, { deep = false }: ValidateOptions = {}): BankValidation {
  const errors: string[] = [];
  const fail = (msg: string): void => {
    if (errors.length < MAX_ERRORS) errors.push(msg);
  };
  if (!isRecord(json)) return { ok: false, errors: ["bank is not an object"] };
  if (json.version !== 1) fail(`version must be 1, got ${String(json.version)}`);
  const level = json.level;
  const knownLevel = typeof level === "string" && (LEVELS as readonly string[]).includes(level);
  if (!knownLevel) fail(`unknown level ${String(level)}`);
  if (typeof json.generated !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(json.generated)) fail("generated must be YYYY-MM-DD");
  if (!Array.isArray(json.puzzles)) return { ok: false, errors: [...errors, "puzzles must be an array"] };

  const ids = new Set<string>();
  const puzzles = new Set<string>();
  let prevScore = -Infinity;
  json.puzzles.forEach((entry: unknown, i: number) => {
    const at = `puzzles[${i}]`;
    if (!isRecord(entry)) return fail(`${at} is not an object`);
    const { id, puzzle, solution, score, hardest } = entry;
    if (typeof id !== "string" || !ID_PATTERN.test(id)) fail(`${at}.id malformed`);
    else {
      if (knownLevel && id[0] !== LEVEL_PREFIX[level as Level]) fail(`${at}.id ${id} does not match level ${String(level)}`);
      if (ids.has(id)) fail(`${at}.id ${id} is duplicated`);
      ids.add(id);
    }
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0) fail(`${at}.score must be a non-negative number`);
    else {
      if (score < prevScore) fail(`${at} is out of score order`);
      prevScore = score;
    }
    if (hardest !== null && (typeof hardest !== "string" || !TECHNIQUE_IDS.has(hardest))) fail(`${at}.hardest is not a technique id`);
    if (typeof puzzle !== "string" || !/^[0-9]{81}$/.test(puzzle)) return fail(`${at}.puzzle must be 81 digits`);
    if (typeof solution !== "string" || !/^[1-9]{81}$/.test(solution)) return fail(`${at}.solution must be 81 digits 1-9`);
    if (puzzles.has(puzzle)) fail(`${at}.puzzle is a duplicate`);
    puzzles.add(puzzle);
    const sol = parseGrid(solution);
    const grid = parseGrid(puzzle);
    if (!isSolved(sol)) return fail(`${at}.solution breaks a rule`);
    if (!respectsGivens(sol, grid)) return fail(`${at}.solution does not match the puzzle's givens`);
    if (!deep || !knownLevel) return;
    if (!hasUniqueSolution(grid)) return fail(`${at} does not have exactly one solution`);
    const graded = grade(grid);
    if (graded.level !== level) fail(`${at} grades as ${String(graded.level)}, labelled ${String(level)}`);
    else if (graded.score !== score || graded.hardest !== hardest) fail(`${at} score/hardest disagree with the grader`);
  });
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function emptyBank(level: Level, generated: string): Bank {
  return { version: 1, level, generated, puzzles: [] };
}

/** One puzzle per line keeps diffs readable and the file compact. */
export function serializeBank(bank: Bank): string {
  const head = JSON.stringify({ version: bank.version, level: bank.level, generated: bank.generated });
  const lines = bank.puzzles.map((p) => "  " + JSON.stringify(p));
  return `${head.slice(0, -1)},"puzzles":[\n${lines.join(",\n")}\n]}\n`;
}

export interface ExtendOptions {
  level: Level;
  seed: number | string;
  /** Target total puzzles in the bank; a bank already that big is left alone. */
  count: number;
  /** Stop early at this wall-clock time (ms epoch); the bank so far is still returned. */
  deadline?: number;
  now?: () => number;
  onPuzzle?: (bank: Bank, added: BankPuzzle) => void;
  /** Injectable for tests; defaults to the engine's leveled generator. */
  make?: (level: Level, seed: string) => { puzzle: string; solution: string; score: number; hardest: string | null };
}

function makeWithEngine(level: Level, seed: string): { puzzle: string; solution: string; score: number; hardest: string | null } {
  const p = generate({ level, seed });
  const graded = grade(p.puzzle);
  return {
    puzzle: p.puzzle.join(""),
    solution: p.solution.join(""),
    score: p.score,
    hardest: graded.level === null ? null : graded.hardest,
  };
}

/**
 * Appends puzzles until the bank holds `count`. Candidate n is generated from the seed
 * `<seed>:<level>:<n>` with n continuing after the bank's current size, so an empty bank and a
 * seed always give the same result, and a resumed run adds new puzzles instead of redoing old
 * ones. Duplicates of existing puzzles are skipped. Returns a new bank sorted by score.
 */
export function extendBank(bank: Bank, opts: ExtendOptions): Bank {
  const { level, seed, count, deadline, now = Date.now, onPuzzle, make = makeWithEngine } = opts;
  const out: Bank = { ...bank, puzzles: bank.puzzles.slice() };
  const seen = new Set(out.puzzles.map((p) => p.puzzle));
  let nextId = out.puzzles.reduce((m, p) => Math.max(m, Number(p.id.slice(2))), -1) + 1;
  let n = out.puzzles.length;
  const prefix = LEVEL_PREFIX[level];
  while (out.puzzles.length < count) {
    if (deadline !== undefined && now() >= deadline) break;
    const made = make(level, `${String(seed)}:${level}:${n++}`);
    if (seen.has(made.puzzle)) continue;
    seen.add(made.puzzle);
    const entry: BankPuzzle = { id: `${prefix}-${String(nextId++).padStart(6, "0")}`, ...made };
    out.puzzles.push(entry);
    onPuzzle?.(out, entry);
  }
  out.puzzles.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  return out;
}
