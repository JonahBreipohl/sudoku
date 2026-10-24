import type { CandidateState } from "../candidates";
import { CELL_COUNT, PEERS, UNITS, digitBit, maskDigits, popcount, type CandidateMask, type Digit } from "../grid";
import { cellName, unitName, type Step } from "../step";
import { registerTechnique } from "./registry";

const SEES: readonly ReadonlySet<number>[] = PEERS.map((peers) => new Set(peers));
const sees = (a: number, b: number): boolean => SEES[a]!.has(b);

const maskOf = (state: CandidateState, cell: number): CandidateMask =>
  state.values[cell] === 0 ? (state.candidates[cell] ?? 0) : 0;

/**
 * W-Wing: two cells A and B with the same pair {x,y} that do not see each other, plus a unit
 * where x fits only in P and Q, with P seeing A and Q seeing B. If neither A nor B were y, both
 * would be x, which would rule x out of P and Q and leave the unit without an x. So one of A, B
 * is y, and y can go from every cell that sees both.
 *
 * Search order: A in cell order, then B after A, then x as the lower and then the higher digit
 * of the pair, then units in UNITS order; the first wing with an elimination wins. cells is
 * [A, B, P, Q] with P the link end that sees A, and units is the strong link's unit.
 */
export function findWWing(state: CandidateState): Step | null {
  const bivalue: number[] = [];
  for (let c = 0; c < CELL_COUNT; c++) if (popcount(maskOf(state, c)) === 2) bivalue.push(c);

  for (let i = 0; i < bivalue.length; i++) {
    const a = bivalue[i]!;
    const pair = maskOf(state, a);
    for (let j = i + 1; j < bivalue.length; j++) {
      const b = bivalue[j]!;
      // Seeing each other makes it a naked pair, which a cheaper technique already handles.
      if (maskOf(state, b) !== pair || sees(a, b)) continue;
      const [d1, d2] = maskDigits(pair) as [Digit, Digit];

      for (const [x, y] of [
        [d1, d2],
        [d2, d1],
      ] as const) {
        const yBit = digitBit(y);
        const eliminations: { cell: number; digit: Digit }[] = [];
        for (let c = 0; c < CELL_COUNT; c++) {
          if (c !== a && c !== b && (maskOf(state, c) & yBit) !== 0 && sees(c, a) && sees(c, b)) {
            eliminations.push({ cell: c, digit: y });
          }
        }
        if (eliminations.length === 0) continue;

        const xBit = digitBit(x);
        for (let u = 0; u < UNITS.length; u++) {
          const holders = UNITS[u]!.filter((c) => (maskOf(state, c) & xBit) !== 0);
          if (holders.length !== 2) continue;
          const [h1, h2] = holders as [number, number];
          if (h1 === a || h1 === b || h2 === a || h2 === b) continue;
          let link: [number, number] | null = null;
          if (sees(h1, a) && sees(h2, b)) link = [h1, h2];
          else if (sees(h2, a) && sees(h1, b)) link = [h2, h1];
          if (!link) continue;
          const [p, q] = link;
          return {
            technique: "w-wing",
            placements: [],
            eliminations,
            cells: [a, b, p, q],
            digits: [x, y],
            units: [u],
            explanation:
              `W-Wing: ${cellName(a)} and ${cellName(b)} are both ${d1}/${d2}, and ${x} in ${unitName(u)} ` +
              `must be in ${cellName(p)} or ${cellName(q)}, so one of them is ${y}; ` +
              `remove ${y} from cells that see both`,
          };
        }
      }
    }
  }
  return null;
}

// Level and weight come from TECHNIQUES in step.ts (Master: W-Wing 55).
registerTechnique("w-wing", findWWing);
