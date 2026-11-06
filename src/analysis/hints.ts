// Tiered hints at the record's current state (docs/ARCHITECTURE.md, "Hints"): a nudge (the unit
// or cell to look at), the technique name, then the full step. A mistake on the board outranks
// any deduction, because every step found past a wrong value would build on a falsehood.
// The result crosses the worker boundary, so it holds only JSON-safe values.

import {
  cellName,
  defaultRegistry,
  digitBit,
  fromGridAndNotes,
  nextStep,
  PEERS,
  techniqueInfo,
  unitName,
  type CandidateMask,
  type CellValue,
  type Digit,
  type Level,
  type Step,
  type TechniqueId,
  type TechniqueRegistry,
} from "../engine";
import type { GameRecord, HintTier } from "../state/events";
import { replayRecord, type Replay } from "./replay";

export type HintKind =
  /** A wrong value, or notes that rule out the solution digit, is on the board now. */
  | "mistake"
  /** A deduction from the current state. */
  | "step"
  /** No technique applies (only possible for puzzles that need more than Master). */
  | "stuck"
  /** Every cell is filled and correct. */
  | "solved";

export interface Hint {
  tier: HintTier;
  kind: HintKind;
  /** One short line for the hint panel. */
  text: string;
  /** Cells to highlight at this tier. */
  cells: number[];
  /** Units to highlight at this tier (0-8 rows, 9-17 columns, 18-26 boxes). */
  units: number[];
  /** The technique behind a step hint, from the technique tier on; null otherwise. */
  technique: TechniqueId | null;
  /** The full step, at the reveal tier of a step hint only. */
  step: Step | null;
  /**
   * The value a reveal puts on the board (a hint-reveal event), when it places one: the step's
   * first placement, or the solution digit of a mistaken cell. Null at lower tiers.
   */
  placement: { cell: number; digit: Digit } | null;
  /** The `step` string for the logged hint assist: a technique id, or the kind otherwise. */
  logId: string;
}

/** A mistaken cell: its wrong value (0 for a note mistake) and its solution digit. */
interface Mistaken {
  cell: number;
  value: CellValue;
  truth: Digit;
}

interface Found {
  kind: HintKind;
  mistake?: Mistaken;
  step?: Step;
}

/**
 * Wrong cells on the current board, earliest-placed first: a later wrong value is often a
 * consequence of an earlier one, so the oldest is the one worth fixing first.
 */
function currentMistake(replay: Replay): Mistaken | null {
  const { givens, solution, path, states } = replay;
  const { board, notes } = states[states.length - 1]!;
  const placedAt = new Map<number, number>();
  path.forEach((e, i) => {
    if (e.type === "place" || e.type === "hint-reveal") placedAt.set(e.cell, i);
  });
  const wrong: { cell: number; order: number }[] = [];
  for (let cell = 0; cell < 81; cell++) {
    if (givens[cell] !== 0 || board[cell] === 0 || board[cell] === solution[cell]) continue;
    wrong.push({ cell, order: placedAt.get(cell) ?? -1 });
  }
  wrong.sort((a, b) => a.order - b.order || a.cell - b.cell);
  const first = wrong[0];
  if (first) return { cell: first.cell, value: board[first.cell]!, truth: solution[first.cell] as Digit };
  // A note set without the true digit is a mistake too: the player's candidates would mislead
  // them, and the step search below reads those notes.
  for (let cell = 0; cell < 81; cell++) {
    const truth = solution[cell] as Digit;
    const note: CandidateMask = notes[cell]!;
    if (board[cell] === 0 && note !== 0 && (note & digitBit(truth)) === 0) return { cell, value: 0, truth };
  }
  return null;
}

function find(record: GameRecord, replay: Replay, registry: TechniqueRegistry): Found {
  const mistake = currentMistake(replay);
  if (mistake) return { kind: "mistake", mistake };
  const { board, notes } = replay.states[replay.states.length - 1]!;
  if (board.every((v) => v !== 0)) return { kind: "solved" };
  // No mistake means every value is true and every note set holds its true digit, so the
  // player's notes are a sound starting point and the hint skips eliminations they already made.
  const state = fromGridAndNotes(board, notes);
  // The puzzle's level always suffices from the givens, but an imported puzzle may be mislabeled,
  // so fall back to the full set before giving up.
  const levels: Level[] = record.level === "master" ? ["master"] : [record.level, "master"];
  for (const level of levels) {
    const step = nextStep(state, level, registry);
    if (step) return { kind: "step", step };
  }
  return { kind: "stuck" };
}

/** Where a step is: a naked single's cell, else its first unit, else the cell it changes. */
function stepFocus(step: Step): { cells: number[]; units: number[]; where: string } {
  const target = step.placements[0]?.cell ?? step.eliminations[0]?.cell ?? step.cells[0]!;
  const unit = step.units?.[0];
  if (step.technique !== "naked-single" && unit !== undefined) return { cells: [], units: [unit], where: unitName(unit) };
  return { cells: [target], units: [], where: plainCell(target) };
}

/** One plain sentence on what each technique means, shown with its name at the technique tier. */
export const TECHNIQUE_TIPS: Record<TechniqueId, string> = {
  "naked-single": "Rule out every digit already in its row, column and box: only one is left.",
  "hidden-single": "One digit has just one place left in this area.",
  pointing: "In this box, a digit can only go in one row or column, so it can't go elsewhere along that line.",
  claiming: "In this line, a digit can only go in one box, so it can't go elsewhere in that box.",
  "naked-pair": "Two cells here can only hold the same two digits, so no other cell here can hold them.",
  "hidden-pair": "Two digits fit only in the same two cells here, so those cells hold nothing else.",
  "naked-triple": "Three cells here can only hold three digits between them, so no other cell here can hold them.",
  "hidden-triple": "Three digits fit only in the same three cells here, so those cells hold nothing else.",
  "naked-quad": "Four cells here can only hold four digits between them, so no other cell here can hold them.",
  "hidden-quad": "Four digits fit only in the same four cells here, so those cells hold nothing else.",
  "x-wing": "A digit has two spots in each of two lines, and they line up, so it can't go elsewhere in the crossing lines.",
  swordfish: "Like an X-Wing over three lines: a digit's spots line up, so it can't go elsewhere in the crossing lines.",
  "xy-wing": "A two-digit cell and two partners force a digit into one of two cells, so any cell seeing both loses it.",
  "xyz-wing": "Like an XY-Wing where the middle cell also holds the shared digit, so cells seeing all three lose it.",
  "simple-coloring": "Follow a digit's either-or pairs; one side would contradict itself, so its cells lose the digit.",
  "x-chain": "A chain of either-or links for one digit: cells that see both ends can't hold it.",
  "xy-chain": "A chain of two-digit cells: cells that see both ends can't hold the digit at the ends.",
  "w-wing": "Two matching two-digit cells joined by a link, so cells seeing both lose the other digit.",
  "unique-rectangle": "A puzzle has one solution, so a pattern that would allow two can't happen: one digit is ruled out.",
};

/** "row 5, column 3": hints are read by players, so they avoid the r5c3 shorthand. */
const plainCell = (cell: number) => cellName(cell).replace(/^r(\d)c(\d)$/, "row $1, column $2");
/** Rewrites r5c3 references in engine explanations the same way. */
export const plainText = (text: string) => text.replace(/\br(\d)c(\d)\b/g, "row $1, column $2");

function mistakeHint(tier: HintTier, board: readonly CellValue[], m: Mistaken): Hint {
  const at = plainCell(m.cell);
  const base = { tier, kind: "mistake" as const, units: [], technique: null, step: null, logId: "mistake" };
  if (m.value === 0) {
    const texts: Record<HintTier, string> = {
      nudge: `Check the notes in ${at}.`,
      technique: `The notes in ${at} rule out a digit that belongs there.`,
      reveal: `${capital(at)} is ${m.truth}; its notes leave it out.`,
    };
    return { ...base, text: texts[tier], cells: [m.cell], placement: tier === "reveal" ? { cell: m.cell, digit: m.truth } : null };
  }
  if (tier === "nudge") return { ...base, text: `Something is off in ${at}.`, cells: [m.cell], placement: null };
  if (tier === "technique") {
    // A clash the player can already see is the most specific thing to say; otherwise say only
    // that the value is wrong, keeping the true digit for the reveal.
    const clashes = PEERS[m.cell]!.filter((p) => board[p] === m.value).sort((a, b) => a - b);
    const text = clashes.length
      ? `The ${m.value} in ${at} clashes with the ${m.value} in ${clashes.map(plainCell).join("; ")}.`
      : `The ${m.value} in ${at} doesn't belong there.`;
    return { ...base, text, cells: [m.cell, ...clashes], placement: null };
  }
  return { ...base, text: `${capital(at)} is ${m.truth}, not ${m.value}.`, cells: [m.cell], placement: { cell: m.cell, digit: m.truth } };
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Longest reveal line the hint panel is meant to show; chain explanations are condensed to it. */
export const MAX_REVEAL_TEXT = 160;

/**
 * The step's explanation as one panel line within `limit`. Short ones pass through. A long chain
 * keeps its two end nodes (the reasoning hinges on them) and says how many links lie between;
 * if the elimination list is still too long it is cut with a count of what was left out.
 */
export function condenseExplanation(explanation: string, limit: number = MAX_REVEAL_TEXT): string {
  const room = limit - 1; // the trailing period added by the caller
  if (explanation.length <= room) return explanation;
  let text = explanation;
  const m = /^([^:]+: )(.+?)(; .*)$/.exec(text);
  if (m) {
    const nodes = m[2]!.split(/ [-=] /);
    if (nodes.length > 2) {
      text = `${m[1]}${nodes[0]} ... ${nodes[nodes.length - 1]} (${nodes.length - 1} links)${m[3]}`;
    }
  }
  if (text.length <= room) return text;
  const at = text.lastIndexOf(" from ");
  if (at < 0) return text.slice(0, room - 3) + "...";
  const head = text.slice(0, at + 6);
  const cells = text.slice(at + 6).split(", ");
  for (let keep = cells.length - 1; keep >= 1; keep--) {
    const out = `${head}${cells.slice(0, keep).join(", ")} and ${cells.length - keep} more`;
    if (out.length <= room) return out;
  }
  return text.slice(0, room - 3) + "...";
}

/** Longest hint line the panel shows, after cell references are spelled out. */
export const MAX_HINT_TEXT = 220;

/**
 * The step's explanation in plain words within MAX_HINT_TEXT. Spelling out cells lengthens the
 * text, so the engine wording is condensed harder until the plain version fits.
 */
export function plainReveal(explanation: string): string {
  for (let limit = MAX_REVEAL_TEXT; limit > 40; limit -= 10) {
    const text = capital(plainText(condenseExplanation(explanation, limit)));
    if (text.length < MAX_HINT_TEXT) return text;
  }
  return capital(plainText(condenseExplanation(explanation, 40))).slice(0, MAX_HINT_TEXT - 4) + "...";
}

function stepHint(tier: HintTier, step: Step): Hint {
  const name = techniqueInfo(step.technique).name;
  const focus = stepFocus(step);
  const base = { tier, kind: "step" as const, logId: step.technique };
  if (tier === "nudge") {
    return { ...base, text: `Look at ${focus.where}.`, cells: focus.cells, units: focus.units, technique: null, step: null, placement: null };
  }
  if (tier === "technique") {
    return { ...base, text: `${name} in ${focus.where}. ${TECHNIQUE_TIPS[step.technique]}`, cells: focus.cells, units: focus.units, technique: step.technique, step: null, placement: null };
  }
  return {
    ...base,
    text: `${plainReveal(step.explanation)}.`,
    cells: step.cells,
    units: step.units ?? [],
    technique: step.technique,
    step,
    placement: step.placements[0] ?? null,
  };
}

/**
 * The hint at `tier` for the record's current state. Each tier is computed from scratch, so
 * consecutive tiers agree only while the board is unchanged. Does not modify the record.
 */
export function hint(record: GameRecord, tier: HintTier, registry: TechniqueRegistry = defaultRegistry): Hint {
  const replay = replayRecord(record);
  const found = find(record, replay, registry);
  if (found.mistake) return mistakeHint(tier, replay.states[replay.states.length - 1]!.board, found.mistake);
  if (found.step) return stepHint(tier, found.step);
  const text = found.kind === "solved" ? "The board is complete." : "No logical step found from here.";
  return { tier, kind: found.kind, text, cells: [], units: [], technique: null, step: null, placement: null, logId: found.kind };
}
