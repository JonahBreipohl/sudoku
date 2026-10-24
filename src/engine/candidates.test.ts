import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { eliminate, fromGrid, fromGridAndNotes, place } from "./candidates";
import {
  PEERS,
  digitBit,
  emptyGrid,
  parseGrid,
  type CellValue,
  type Digit,
  type Grid,
} from "./grid";
import { createRng } from "./random";
import { SAMPLE_EASY } from "./samples";
import { solve } from "./solver";

const grid = parseGrid(SAMPLE_EASY.puzzle);
const solution = parseGrid(SAMPLE_EASY.solution);
const firstEmpty = grid.indexOf(0);

describe("fromGrid", () => {
  it("gives filled cells no candidates and keeps the solution digit in empty ones", () => {
    const s = fromGrid(grid);
    grid.forEach((v, c) => {
      if (v !== 0) expect(s.candidates[c]).toBe(0);
      else
        expect(s.candidates[c]! & digitBit(solution[c] as Digit)).not.toBe(0);
    });
  });
  it("computes known candidates for r1c3 of the classic puzzle", () => {
    expect(fromGrid(grid).candidates[2]).toBe(
      digitBit(1) | digitBit(2) | digitBit(4),
    );
  });
});

describe("fromGridAndNotes", () => {
  it("intersects with notes and treats empty notes as no notes", () => {
    const notes = new Array<number>(81).fill(0);
    notes[2] = digitBit(1) | digitBit(9);
    const s = fromGridAndNotes(grid, notes);
    expect(s.candidates[2]).toBe(digitBit(1));
    expect(s.candidates[3]).toBe(fromGrid(grid).candidates[3]);
  });
});

describe("place / eliminate", () => {
  it("place sets the value and strips the digit from peers without mutating input", () => {
    const s = fromGrid(grid);
    const before = JSON.stringify(s);
    const n = place(s, firstEmpty, 4);
    expect(JSON.stringify(s)).toBe(before);
    expect(n.values[firstEmpty]).toBe(4);
    expect(n.candidates[firstEmpty]).toBe(0);
    for (const p of PEERS[firstEmpty]!)
      expect(n.candidates[p]! & digitBit(4)).toBe(0);
  });
  it("eliminate removes one candidate and returns a new state", () => {
    const s = fromGrid(grid);
    const before = JSON.stringify(s);
    const n = eliminate(s, 2, 1);
    expect(n).not.toBe(s);
    expect(n.candidates[2]).toBe(digitBit(2) | digitBit(4));
    expect(JSON.stringify(s)).toBe(before);
  });
});

/** A random full solution with random cells blanked; the solution is the reference for every check. */
interface Generated {
  readonly solution: Grid;
  readonly puzzle: Grid;
}

const generatedGrid: fc.Arbitrary<Generated> = fc
  .tuple(
    fc.integer({ min: 0, max: 2 ** 31 - 1 }),
    fc.array(fc.integer({ min: 0, max: 80 }), { maxLength: 64 }),
  )
  .map(([seed, holes]) => {
    const solution = solve(emptyGrid(), createRng(seed)) as CellValue[];
    const puzzle = [...solution];
    for (const h of holes) puzzle[h] = 0;
    return { solution, puzzle };
  });

const ALL_CELLS = Array.from({ length: 81 }, (_, c) => c);

const cellNotes: fc.Arbitrary<number[]> = fc.array(
  fc.integer({ min: 0, max: 0x3ff }),
  {
    minLength: 81,
    maxLength: 81,
  },
);

describe("properties", () => {
  it("placing solution digits never removes a peer's solution digit; filled cells stay 0", () => {
    fc.assert(
      fc.property(
        generatedGrid,
        fc.shuffledSubarray(ALL_CELLS, { minLength: 81, maxLength: 81 }),
        ({ solution, puzzle }, shuffled) => {
          const order = shuffled.filter((c) => puzzle[c] === 0);
          let s = fromGrid(puzzle);
          for (const c of order) {
            s = place(s, c, solution[c] as Digit);
            s.values.forEach((v, i) => {
              if (v !== 0) expect(s.candidates[i]).toBe(0);
              else
                expect(
                  s.candidates[i]! & digitBit(solution[i] as Digit),
                ).not.toBe(0);
            });
          }
        },
      ),
    );
  });

  it("fromGridAndNotes candidates are a subset of fromGrid's; filled cells stay 0 for any notes", () => {
    fc.assert(
      fc.property(generatedGrid, cellNotes, ({ puzzle }, notes) => {
        const base = fromGrid(puzzle);
        const s = fromGridAndNotes(puzzle, notes);
        s.candidates.forEach((mask, c) => {
          expect(mask & ~base.candidates[c]!).toBe(0);
          if (puzzle[c] !== 0) expect(mask).toBe(0);
        });
      }),
    );
  });
});
