import type { CandidateState } from "../candidates";
import { CELL_COUNT, PEERS, maskDigits, popcount, type CandidateMask, type Digit } from "../grid";
import { cellName, type Step } from "../step";
import { registerTechnique } from "./registry";

/** sees[a] is the set of a's peers, for O(1) "do these cells share a unit" checks. */
const SEES: readonly ReadonlySet<number>[] = PEERS.map((peers) => new Set(peers));
const sees = (a: number, b: number): boolean => SEES[a]!.has(b);

const maskOf = (state: CandidateState, cell: number): CandidateMask =>
  state.values[cell] === 0 ? (state.candidates[cell] ?? 0) : 0;

/** "4/7" for a candidate mask, the usual way to name a cell's pencil marks. */
const marks = (mask: CandidateMask): string => maskDigits(mask).join("/");

/** The single digit of a one-bit mask. */
const onlyDigit = (mask: CandidateMask): Digit => maskDigits(mask)[0]!;

/**
 * Shared search for both wings. The pivot has `pivotSize` candidates (2 for XY, 3 for XYZ); each
 * pincer is a bivalue peer of the pivot. For pincers A = {x,z} and B = {y,z}, whichever value
 * the pivot takes forces one pincer to z (for XYZ the pivot may also be z itself), so z can go
 * from every cell that sees all the cells that might end up holding z: both pincers, plus the
 * pivot for XYZ. Pivots are tried in cell order, then pincer pairs in cell order, and the first
 * wing with an elimination wins. cells is [pivot, pincer, pincer], pivot first so the UI and
 * explanation can tell them apart.
 */
function findWing(state: CandidateState, pivotSize: 2 | 3): Step | null {
  for (let pivot = 0; pivot < CELL_COUNT; pivot++) {
    const pm = maskOf(state, pivot);
    if (popcount(pm) !== pivotSize) continue;
    // Bivalue peers that share a digit with the pivot and (for XYZ) lie inside it.
    const pincers = PEERS[pivot]!.filter((c) => {
      const m = maskOf(state, c);
      if (popcount(m) !== 2) return false;
      return pivotSize === 2 ? popcount(m & pm) === 1 : (m & ~pm) === 0;
    }).sort((a, b) => a - b);
    for (let i = 0; i < pincers.length; i++) {
      for (let j = i + 1; j < pincers.length; j++) {
        const a = pincers[i]!;
        const b = pincers[j]!;
        const am = maskOf(state, a);
        const bm = maskOf(state, b);
        if (am === bm) continue;
        let zMask: CandidateMask;
        if (pivotSize === 2) {
          // Each pincer shares one digit with the pivot {x,y}, so if they share exactly one digit
          // and the pivot lacks it, they are {x,z} and {y,z}.
          zMask = am & bm;
          if (popcount(zMask) !== 1 || (zMask & pm) !== 0) continue;
        } else {
          // Two different pairs inside a three-digit pivot always share exactly one digit, z.
          zMask = am & bm;
        }
        const z = onlyDigit(zMask);
        const sources = pivotSize === 2 ? [a, b] : [pivot, a, b];
        const eliminations: { cell: number; digit: Digit }[] = [];
        for (let c = 0; c < CELL_COUNT; c++) {
          if (c === pivot || c === a || c === b) continue;
          if ((maskOf(state, c) & zMask) === 0) continue;
          if (sources.every((s) => sees(c, s))) eliminations.push({ cell: c, digit: z });
        }
        if (eliminations.length === 0) continue;
        const name = pivotSize === 2 ? "XY-Wing" : "XYZ-Wing";
        const seen = pivotSize === 2 ? "both pincers" : "the pivot and both pincers";
        const forced = pivotSize === 2 ? `one pincer must be ${z}` : `one of the three must be ${z}`;
        return {
          technique: pivotSize === 2 ? "xy-wing" : "xyz-wing",
          placements: [],
          eliminations,
          cells: [pivot, a, b],
          digits: maskDigits(pm | zMask),
          explanation:
            `${name}: pivot ${cellName(pivot)} (${marks(pm)}) with pincers ${cellName(a)} (${marks(am)}) ` +
            `and ${cellName(b)} (${marks(bm)}), so ${forced}; remove ${z} from cells that see ${seen}`,
        };
      }
    }
  }
  return null;
}

export const findXYWing = (state: CandidateState): Step | null => findWing(state, 2);
export const findXYZWing = (state: CandidateState): Step | null => findWing(state, 3);

// Level and weight come from TECHNIQUES in step.ts (Expert: XY-Wing 40, XYZ-Wing 50).
registerTechnique("xy-wing", findXYWing);
registerTechnique("xyz-wing", findXYZWing);
