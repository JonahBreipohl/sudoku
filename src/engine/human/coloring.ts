import type { CandidateState } from "../candidates";
import { CELL_COUNT, DIGITS, PEERS, UNITS, digitBit, type Digit } from "../grid";
import { cellName, type Step } from "../step";
import { registerTechnique } from "./registry";

const SEES: readonly ReadonlySet<number>[] = PEERS.map((peers) => new Set(peers));
const sees = (a: number, b: number): boolean => SEES[a]!.has(b);

const hasDigit = (state: CandidateState, cell: number, bit: number): boolean =>
  state.values[cell] === 0 && ((state.candidates[cell] ?? 0) & bit) !== 0;

const names = (cells: readonly number[]): string => cells.map(cellName).join(", ");

/**
 * Connected components of the digit's conjugate-pair graph (an edge joins the only two cells of
 * a unit that can hold the digit), each two-coloured by BFS from its lowest cell. Along a
 * conjugate pair exactly one end is the digit, so in any solution one whole colour is the digit
 * and the other is not. A component that cannot be two-coloured means the state has no
 * solution, so it is dropped rather than reasoned from.
 */
function coloredChains(state: CandidateState, digit: Digit): [number[], number[]][] {
  const bit = digitBit(digit);
  const links = new Map<number, Set<number>>();
  for (const unit of UNITS) {
    const holders = unit.filter((c) => hasDigit(state, c, bit));
    if (holders.length !== 2) continue;
    const [a, b] = holders as [number, number];
    if (!links.has(a)) links.set(a, new Set());
    if (!links.has(b)) links.set(b, new Set());
    links.get(a)!.add(b);
    links.get(b)!.add(a);
  }
  const color = new Map<number, 0 | 1>();
  const chains: [number[], number[]][] = [];
  for (let start = 0; start < CELL_COUNT; start++) {
    if (!links.has(start) || color.has(start)) continue;
    const groups: [number[], number[]] = [[], []];
    let consistent = true;
    color.set(start, 0);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const cell = queue[i]!;
      const c = color.get(cell)!;
      groups[c].push(cell);
      for (const next of [...links.get(cell)!].sort((x, y) => x - y)) {
        const nc = color.get(next);
        if (nc === undefined) {
          color.set(next, c === 0 ? 1 : 0);
          queue.push(next);
        } else if (nc === c) {
          consistent = false;
        }
      }
    }
    if (!consistent) continue;
    groups[0].sort((x, y) => x - y);
    groups[1].sort((x, y) => x - y);
    chains.push(groups);
  }
  return chains;
}

/** The first pair of same-coloured cells that share a unit, or null. */
function clash(group: readonly number[]): [number, number] | null {
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      if (sees(group[i]!, group[j]!)) return [group[i]!, group[j]!];
    }
  }
  return null;
}

/**
 * Simple coloring on one digit. Digits are tried 1-9 and chains in order of their lowest cell;
 * for each chain the color wrap is checked before the color trap, and the first chain with an
 * elimination wins.
 *
 * - Color wrap: two cells of one color see each other, so that color cannot be the digit and the
 *   digit goes from every cell of that color (the other color is then the digit).
 * - Color trap: a cell off the chain sees a cell of each color; one of them must be the digit,
 *   so it cannot be.
 *
 * groups holds the two colors (the color containing the chain's lowest cell first); cells is
 * their sorted union.
 */
export function findSimpleColoring(state: CandidateState): Step | null {
  for (const digit of DIGITS) {
    const bit = digitBit(digit);
    for (const groups of coloredChains(state, digit)) {
      const [a, b] = groups;
      const cells = [...a, ...b].sort((x, y) => x - y);
      const base = { technique: "simple-coloring" as const, placements: [], cells, digits: [digit], groups: [[...a], [...b]] };
      const chain = `Simple Coloring on ${digit}: conjugate pairs color ${names(a)} one way and ${names(b)} the other`;

      const wrapA = clash(a);
      const wrapB = clash(b);
      // Both colors clashing means the state has no solution; reason from neither.
      if (wrapA && wrapB) continue;
      const wrap = wrapA ? { pair: wrapA, group: a } : wrapB ? { pair: wrapB, group: b } : null;
      if (wrap) {
        const [x, y] = wrap.pair;
        return {
          ...base,
          eliminations: wrap.group.map((cell) => ({ cell, digit })),
          explanation:
            `${chain}; ${cellName(x)} and ${cellName(y)} share a color and see each other (color wrap), ` +
            `so remove ${digit} from ${names(wrap.group)}`,
        };
      }

      const eliminations: { cell: number; digit: Digit }[] = [];
      for (let cell = 0; cell < CELL_COUNT; cell++) {
        if (!hasDigit(state, cell, bit) || cells.includes(cell)) continue;
        if (a.some((x) => sees(cell, x)) && b.some((y) => sees(cell, y))) eliminations.push({ cell, digit });
      }
      if (eliminations.length === 0) continue;
      return {
        ...base,
        eliminations,
        explanation: `${chain}; one color must be ${digit} (color trap), so remove ${digit} from cells that see both colors`,
      };
    }
  }
  return null;
}

// Level and weight come from TECHNIQUES in step.ts (Expert: Simple Coloring 45).
registerTechnique("simple-coloring", findSimpleColoring);
