import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { eliminate, fromGrid, fromGridAndNotes, place } from "./candidates";
import { PEERS, digitBit, parseGrid, type Digit } from "./grid";
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
      else expect(s.candidates[c]! & digitBit(solution[c] as Digit)).not.toBe(0);
    });
  });
  it("computes known candidates for r1c3 of the classic puzzle", () => {
    expect(fromGrid(grid).candidates[2]).toBe(digitBit(1) | digitBit(2) | digitBit(4));
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
    for (const p of PEERS[firstEmpty]!) expect(n.candidates[p]! & digitBit(4)).toBe(0);
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

describe("properties", () => {
  const solved = solve(grid)!;
  it("placing solution digits never removes a peer's solution digit; filled cells stay 0", () => {
    const empties = grid.flatMap((v, c) => (v === 0 ? [c] : []));
    fc.assert(
      fc.property(fc.shuffledSubarray(empties), (order) => {
        let s = fromGrid(grid);
        for (const c of order) {
          s = place(s, c, solved[c] as Digit);
          s.values.forEach((v, i) => {
            if (v !== 0) expect(s.candidates[i]).toBe(0);
            else expect(s.candidates[i]! & digitBit(solved[i] as Digit)).not.toBe(0);
          });
        }
      }),
    );
  });
});
