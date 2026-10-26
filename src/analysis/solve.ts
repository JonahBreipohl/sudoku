// Analysis of a correct solve (docs/ARCHITECTURE.md, "Solve analysis"): time breakdown, the
// longest stalls with the step available at each, the hardest technique the placements needed,
// and the assists used. Like MistakeReport, the result crosses the worker boundary, so it holds
// only JSON-safe values.

import {
  LEVELS,
  applyStep,
  defaultRegistry,
  fromGrid,
  nextStep,
  techniqueInfo,
  type CellValue,
  type Digit,
  type Level,
  type Step,
  type TechniqueId,
  type TechniqueRegistry,
} from "../engine";
import type { GameRecord, HintTier, MetaEvent } from "../state/events";
import { replayRecord } from "./replay";

export const STALL_COUNT = 3;

export interface TimeBreakdown {
  /** Active play ms: the clock as the timer shows it at the end of play. */
  activeMs: number;
  /** Ms between the first start and the end of play while the clock was stopped (paused or hidden). */
  pausedMs: number;
  /**
   * Active ms in each third of the placements on the path. The first phase runs from 0 to the
   * placement that ends the first third, the last one to the end of play, so they sum to activeMs.
   */
  phases: [number, number, number];
  /** Placements (place and hint-reveal events on the path) in each phase. */
  phasePlacements: [number, number, number];
}

export interface Stall {
  /** Node id of the board event the gap starts after; -1 for the gap before the first move. */
  afterId: number;
  /** Node id of the board event that ended the gap. */
  beforeId: number;
  /** Active ms at the start of the gap. */
  startMs: number;
  durationMs: number;
  /** What the solver found at the start of the gap (correct values only, at the puzzle's level). */
  available: Step | null;
}

export interface PlacementNeed {
  /** Node id of the place event. */
  eventId: number;
  cell: number;
  digit: Digit;
  /** The hardest technique on the solver's chain from the state before it to this cell. */
  technique: TechniqueId;
  /** Steps on that chain, the placing step included. */
  chainLength: number;
}

export interface AssistCounts {
  checks: number;
  hints: Record<HintTier, number>;
  autoNotes: number;
  /** Hinted digits actually placed (hint-reveal board events). */
  reveals: number;
  /** The auto-candidates setting was switched on during play. */
  autoCandidates: boolean;
}

export interface SolveReport {
  recordId: string;
  cursor: number;
  level: Level;
  /** The board at the cursor equals the solution. */
  solved: boolean;
  time: TimeBreakdown;
  /** Up to STALL_COUNT longest gaps, longest first; ties keep play order. */
  stalls: Stall[];
  /** Hardest technique over all placements, or null when no placement could be attributed. */
  hardest: PlacementNeed | null;
  /** Every correct player placement on the path with the technique it needed, in play order. */
  needs: PlacementNeed[];
  assists: AssistCounts;
}

const levelRank = (level: Level): number => LEVELS.indexOf(level);

/** Tier first, then weight, the same order grade() uses for its hardest technique. */
function harder(a: TechniqueId, b: TechniqueId): boolean {
  const x = techniqueInfo(a);
  const y = techniqueInfo(b);
  return levelRank(x.level) > levelRank(y.level) || (x.level === y.level && x.weight > y.weight);
}

/**
 * Active ms and the clock's stopped stretches, restated from src/state/timer.ts (analysis may
 * not import state code); solve.test.ts cross-checks the two.
 */
function foldTime(log: readonly MetaEvent[], endAt: number): { activeMs: number; firstStart: number | null } {
  let activeMs = 0;
  let since: number | null = null;
  let firstStart: number | null = null;
  let started = false;
  let paused = false;
  let hidden = false;
  let done = false;
  for (const e of log) {
    switch (e.type) {
      case "start":
        started = true;
        firstStart ??= e.at;
        break;
      case "pause":
        paused = true;
        break;
      case "resume":
        paused = false;
        break;
      case "hidden":
        hidden = true;
        break;
      case "visible":
        hidden = false;
        break;
      case "submit":
        done = true;
        break;
      default:
        continue;
    }
    const run = started && !paused && !hidden && !done;
    if (run && since === null) since = e.at;
    else if (!run && since !== null) {
      activeMs += Math.max(0, e.at - since);
      since = null;
    }
  }
  if (since !== null) activeMs += Math.max(0, endAt - since);
  return { activeMs, firstStart };
}

/** End of play: the submit, or else the latest event of either kind. */
function endOfPlay(record: GameRecord): number {
  const submit = record.log.find((e) => e.type === "submit");
  if (submit) return submit.at;
  let end = record.createdAt;
  for (const e of record.log) end = Math.max(end, e.at);
  for (const e of record.nodes) end = Math.max(end, e.at);
  return end;
}

function correctOnly(board: readonly CellValue[], solution: readonly CellValue[]): CellValue[] {
  return board.map((v, i) => (v !== 0 && v === solution[i] ? v : 0));
}

/**
 * The hardest technique on the solver's chain from `board` until `cell` is placed, or null when
 * the solver stalls first. `board` must hold correct values only, with `cell` empty.
 */
function chainHardest(
  board: readonly CellValue[],
  cell: number,
  registry: TechniqueRegistry,
): { technique: TechniqueId; chainLength: number } | null {
  let state = fromGrid(board);
  let hardest: TechniqueId | null = null;
  for (let n = 1; ; n++) {
    // Master, not the puzzle's level: nextStep tries the cheapest tier first, so this only differs
    // from a level-limited solve where that one would stall and leave the placement unexplained.
    const step = nextStep(state, "master", registry);
    if (!step) return null;
    if (!hardest || harder(step.technique, hardest)) hardest = step.technique;
    state = applyStep(state, step);
    if (state.values[cell] !== 0) return { technique: hardest, chainLength: n };
  }
}

/** Analyses the path ending at the record's cursor. Does not modify the record. */
export function analyzeSolve(record: GameRecord, registry: TechniqueRegistry = defaultRegistry): SolveReport {
  const { givens, solution, path, states } = replayRecord(record);
  const final = states[states.length - 1]!.board;

  // Time breakdown.
  const endAt = endOfPlay(record);
  const { activeMs, firstStart } = foldTime(record.log, endAt);
  const pausedMs = firstStart === null ? 0 : Math.max(0, endAt - firstStart - activeMs);
  const placements = path.filter((e) => e.type === "place" || e.type === "hint-reveal");
  const p = placements.length;
  const cut1 = Math.ceil(p / 3);
  const cut2 = Math.ceil((2 * p) / 3);
  // Clamped, since a placement's elapsed can trail a timer that already counted past it.
  const at = (n: number): number => (n === 0 ? 0 : Math.min(activeMs, placements[n - 1]!.elapsed));
  const b1 = at(cut1);
  const b2 = Math.max(b1, at(cut2));
  const time: TimeBreakdown = {
    activeMs,
    pausedMs,
    phases: [b1, b2 - b1, Math.max(0, activeMs - b2)],
    phasePlacements: [cut1, cut2 - cut1, p - cut2],
  };

  // Stalls: gaps in active time between consecutive board events, the opening one included.
  const gaps: Omit<Stall, "available">[] = path.map((e, i) => {
    const prev = path[i - 1];
    const startMs = prev ? prev.elapsed : 0;
    return { afterId: prev ? prev.id : -1, beforeId: e.id, startMs, durationMs: Math.max(0, e.elapsed - startMs) };
  });
  const longest = gaps
    .map((g, i) => ({ g, i }))
    .sort((a, b) => b.g.durationMs - a.g.durationMs || a.i - b.i)
    .slice(0, STALL_COUNT);
  const stalls: Stall[] = longest.map(({ g, i }) => {
    const known = correctOnly(states[i]!.board, solution);
    return {
      afterId: g.afterId,
      beforeId: g.beforeId,
      startMs: g.startMs,
      durationMs: g.durationMs,
      available: nextStep(fromGrid(known), record.level, registry),
    };
  });

  // Hardest technique: per placement, solve from the state before it until its cell is placed.
  // Hint reveals are left out: the hint, not the player, found those.
  const needs: PlacementNeed[] = [];
  path.forEach((e, i) => {
    if (e.type !== "place" || givens[e.cell] !== 0 || e.digit !== solution[e.cell]) return;
    const known = correctOnly(states[i]!.board, solution);
    known[e.cell] = 0;
    const chain = chainHardest(known, e.cell, registry);
    if (chain) needs.push({ eventId: e.id, cell: e.cell, digit: e.digit as Digit, ...chain });
  });
  let hardest: PlacementNeed | null = null;
  for (const need of needs) if (!hardest || harder(need.technique, hardest.technique)) hardest = need;

  // Assists count every node, not just the path: an assist that was later undone was still used.
  const assists: AssistCounts = {
    checks: 0,
    hints: { nudge: 0, technique: 0, reveal: 0 },
    autoNotes: 0,
    reveals: 0,
    autoCandidates: false,
  };
  for (const e of record.log) {
    if (e.type === "check") assists.checks++;
    else if (e.type === "hint") assists.hints[e.tier]++;
    else if (e.type === "settings-assist" && e.autoCandidates) assists.autoCandidates = true;
  }
  for (const e of record.nodes) {
    if (e.type === "auto-notes") assists.autoNotes++;
    else if (e.type === "hint-reveal") assists.reveals++;
  }

  return {
    recordId: record.id,
    cursor: record.cursor,
    level: record.level,
    solved: final.every((v, i) => v === solution[i]),
    time,
    stalls,
    hardest,
    needs,
    assists,
  };
}
