import type { CandidateState } from "../candidates";
import { UNITS, boxOf, cellIndex, colOf, digitBit, maskDigits, PEERS, popcount, rowOf, type CandidateMask, type Digit } from "../grid";
import { cellName, unitName, type Step } from "../step";
import { registerTechnique } from "./registry";

/*
 * Unique rectangles (types 1, 2 and 4).
 *
 * ONLY VALID FOR PUZZLES WITH A UNIQUE SOLUTION. Every puzzle the app serves has one, which is
 * why these techniques sit in the default registry. The argument: four unsolved cells on two
 * rows, two columns and exactly two boxes cannot all end up holding just a and b (the "deadly
 * pattern"), because swapping a and b in those four cells would give a second solution: none
 * of them is a given, and each of their rows, columns and boxes still holds one a and one b.
 * So at least one corner must take a digit other than a and b. On a puzzle with several
 * solutions this reasoning is unsound and can remove a solution digit, so never use it for
 * checking user-entered puzzles or for counting solutions.
 */

const SEES: readonly ReadonlySet<number>[] = PEERS.map((peers) => new Set(peers));
const sees = (a: number, b: number): boolean => SEES[a]!.has(b);

const maskOf = (state: CandidateState, cell: number): CandidateMask =>
  state.values[cell] === 0 ? (state.candidates[cell] ?? 0) : 0;

interface Rectangle {
  /** Corners in reading order: r1c1, r1c2, r2c1, r2c2. */
  corners: [number, number, number, number];
  a: Digit;
  b: Digit;
}

/**
 * Every rectangle of unsolved cells spanning exactly two boxes whose corners all keep both
 * digits of some pair a < b, in a fixed order: top row, bottom row, left column, right column,
 * then a, then b.
 */
function* rectangles(state: CandidateState): Generator<Rectangle> {
  for (let r1 = 0; r1 < 9; r1++) {
    for (let r2 = r1 + 1; r2 < 9; r2++) {
      for (let c1 = 0; c1 < 9; c1++) {
        for (let c2 = c1 + 1; c2 < 9; c2++) {
          const corners: [number, number, number, number] = [
            cellIndex(r1, c1),
            cellIndex(r1, c2),
            cellIndex(r2, c1),
            cellIndex(r2, c2),
          ];
          // Four boxes leave no swap-invariant pattern; one box is impossible with two rows and columns.
          if (new Set(corners.map(boxOf)).size !== 2) continue;
          const common = corners.reduce((m, c) => m & maskOf(state, c), 0x1ff);
          if (popcount(common) < 2) continue;
          const digits = maskDigits(common);
          for (let i = 0; i < digits.length; i++) {
            for (let j = i + 1; j < digits.length; j++) {
              yield { corners, a: digits[i]!, b: digits[j]! };
            }
          }
        }
      }
    }
  }
}

const cornerList = (corners: readonly number[]): string => corners.map(cellName).join(", ");

/** Type 1: three corners are exactly {a,b}, so the fourth cannot be a or b. */
function type1(state: CandidateState, { corners, a, b }: Rectangle): Step | null {
  const pair = digitBit(a) | digitBit(b);
  const extra = corners.filter((c) => maskOf(state, c) !== pair);
  if (extra.length !== 1) return null;
  const target = extra[0]!;
  return {
    technique: "unique-rectangle",
    placements: [],
    eliminations: [
      { cell: target, digit: a },
      { cell: target, digit: b },
    ],
    cells: [...corners],
    digits: [a, b],
    explanation:
      `Unique rectangle type 1: ${cornerList(corners)} would form a deadly ${a}/${b} pattern, ` +
      `so ${cellName(target)} cannot be ${a} or ${b}`,
  };
}

/** Splits the corners into a floor of two exact {a,b} cells and a roof sharing a row or column. */
function floorAndRoof(state: CandidateState, { corners, a, b }: Rectangle): { floor: number[]; roof: [number, number] } | null {
  const pair = digitBit(a) | digitBit(b);
  const floor = corners.filter((c) => maskOf(state, c) === pair);
  if (floor.length !== 2) return null;
  const roof = corners.filter((c) => maskOf(state, c) !== pair) as [number, number];
  const [p, q] = roof;
  // A diagonal roof is a different UR type; the cells seeing both are just the floor.
  if (rowOf(p) !== rowOf(q) && colOf(p) !== colOf(q)) return null;
  return { floor, roof };
}

/** Type 2: the two roof cells are {a,b,x} with the same single extra x, so one of them is x. */
function type2(state: CandidateState, rect: Rectangle): Step | null {
  const split = floorAndRoof(state, rect);
  if (!split) return null;
  const { corners, a, b } = rect;
  const [p, q] = split.roof;
  const pair = digitBit(a) | digitBit(b);
  const extraP = maskOf(state, p) & ~pair;
  if (popcount(extraP) !== 1 || (maskOf(state, q) & ~pair) !== extraP) return null;
  const x = maskDigits(extraP)[0]!;
  const eliminations: { cell: number; digit: Digit }[] = [];
  for (let c = 0; c < 81; c++) {
    if (c !== p && c !== q && (maskOf(state, c) & extraP) !== 0 && sees(c, p) && sees(c, q)) {
      eliminations.push({ cell: c, digit: x });
    }
  }
  if (eliminations.length === 0) return null;
  return {
    technique: "unique-rectangle",
    placements: [],
    eliminations,
    cells: [...corners],
    digits: [a, b, x],
    groups: [split.floor, [p, q]],
    explanation:
      `Unique rectangle type 2: ${cornerList(corners)} would form a deadly ${a}/${b} pattern, ` +
      `so ${cellName(p)} or ${cellName(q)} is ${x}; remove ${x} from cells that see both`,
  };
}

/**
 * Type 4: in a unit holding both roof cells, one pattern digit fits only in the roof. That digit
 * is then in one roof cell, so the other pattern digit in the other roof cell would complete the
 * deadly pattern; it goes from both roof cells.
 */
function type4(state: CandidateState, rect: Rectangle): Step | null {
  const split = floorAndRoof(state, rect);
  if (!split) return null;
  const { corners, a, b } = rect;
  const [p, q] = split.roof;
  for (let u = 0; u < UNITS.length; u++) {
    const unit = UNITS[u]!;
    if (!unit.includes(p) || !unit.includes(q)) continue;
    for (const [locked, removed] of [
      [a, b],
      [b, a],
    ] as const) {
      const bit = digitBit(locked);
      if (unit.some((c) => c !== p && c !== q && (maskOf(state, c) & bit) !== 0)) continue;
      return {
        technique: "unique-rectangle",
        placements: [],
        eliminations: [
          { cell: p, digit: removed },
          { cell: q, digit: removed },
        ],
        cells: [...corners],
        digits: [a, b],
        units: [u],
        groups: [split.floor, [p, q]],
        explanation:
          `Unique rectangle type 4: ${cornerList(corners)} would form a deadly ${a}/${b} pattern, ` +
          `and ${locked} in ${unitName(u)} must be in ${cellName(p)} or ${cellName(q)}, ` +
          `so neither can be ${removed}`,
      };
    }
  }
  return null;
}

/**
 * Finds a unique rectangle of type 1, 2 or 4, trying every type 1 before any type 2 and every
 * type 2 before any type 4; within a type, rectangles come in the order of `rectangles`.
 * cells is always the four corners in reading order and digits starts with the pattern digits
 * a and b (type 2 adds its extra digit). For types 2 and 4, groups is [floor, roof].
 *
 * Only valid when the puzzle has a unique solution; see the comment at the top of this file.
 */
export function findUniqueRectangle(state: CandidateState): Step | null {
  for (const type of [type1, type2, type4]) {
    for (const rect of rectangles(state)) {
      const step = type(state, rect);
      if (step) return step;
    }
  }
  return null;
}

// Level and weight come from TECHNIQUES in step.ts (Master: unique rectangles 50).
registerTechnique("unique-rectangle", findUniqueRectangle);
