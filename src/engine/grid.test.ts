import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ALL_CANDIDATES,
  PEERS,
  UNITS,
  boxOf,
  cellIndex,
  colOf,
  computeCandidates,
  digitBit,
  maskDigits,
  parseGrid,
  popcount,
  rowOf,
  serializeGrid,
  type CellValue,
} from "./grid";
import { SAMPLE_EASY } from "./samples";

const arbGrid = fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 81, maxLength: 81 }) as fc.Arbitrary<
  CellValue[]
>;

describe("coordinates", () => {
  it("round-trips cell index through row and column", () => {
    for (let cell = 0; cell < 81; cell++) expect(cellIndex(rowOf(cell), colOf(cell))).toBe(cell);
  });

  it("assigns boxes in reading order", () => {
    expect(boxOf(0)).toBe(0);
    expect(boxOf(cellIndex(4, 4))).toBe(4);
    expect(boxOf(80)).toBe(8);
  });
});

describe("units and peers", () => {
  it("has 27 units of 9 distinct cells, each cell in exactly 3 units", () => {
    expect(UNITS).toHaveLength(27);
    const count = new Array(81).fill(0);
    for (const unit of UNITS) {
      expect(new Set(unit).size).toBe(9);
      for (const cell of unit) count[cell]++;
    }
    expect(count.every((n) => n === 3)).toBe(true);
  });

  it("gives every cell 20 peers, symmetric and excluding itself", () => {
    PEERS.forEach((peers, cell) => {
      expect(peers).toHaveLength(20);
      expect(peers).not.toContain(cell);
      for (const p of peers) expect(PEERS[p]).toContain(cell);
    });
  });
});

describe("parse and serialize", () => {
  it("round-trips any grid", () => {
    fc.assert(
      fc.property(arbGrid, (grid) => {
        expect(parseGrid(serializeGrid(grid))).toEqual(grid);
      }),
    );
  });

  it("accepts '0' blanks and whitespace", () => {
    const text = SAMPLE_EASY.puzzle.replace(/\./g, "0").replace(/(.{9})/g, "$1\n");
    expect(serializeGrid(parseGrid(text))).toBe(SAMPLE_EASY.puzzle);
  });

  it("rejects wrong lengths and characters", () => {
    expect(() => parseGrid("123")).toThrow(/81 cells/);
    expect(() => parseGrid("x".repeat(81))).toThrow(/Invalid character 'x' at cell 0/);
  });
});

describe("candidates", () => {
  it("bit helpers agree", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: ALL_CANDIDATES }), (mask) => {
        const digits = maskDigits(mask);
        expect(digits.length).toBe(popcount(mask));
        expect(digits.reduce((m, d) => m | digitBit(d), 0)).toBe(mask);
      }),
    );
  });

  it("never offers a digit already placed in a peer", () => {
    fc.assert(
      fc.property(arbGrid, (grid) => {
        const cands = computeCandidates(grid);
        grid.forEach((v, cell) => {
          if (v !== 0) {
            expect(cands[cell]).toBe(0);
            return;
          }
          for (const p of PEERS[cell]!) {
            const pv = grid[p]!;
            if (pv) expect(cands[cell]! & digitBit(pv)).toBe(0);
          }
        });
      }),
    );
  });

  it("keeps the solution digit as a candidate in a valid puzzle", () => {
    const grid = parseGrid(SAMPLE_EASY.puzzle);
    const solution = parseGrid(SAMPLE_EASY.solution);
    const cands = computeCandidates(grid);
    grid.forEach((v, cell) => {
      if (v === 0) expect(cands[cell]! & digitBit(solution[cell] as 1)).not.toBe(0);
    });
  });
});
