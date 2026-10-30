import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { SAMPLE_EASY } from "../engine/samples";
import type { CellValue } from "../engine";

type Grid = CellValue[];
import { unitsCompletedBy, unitLabel } from "./unitComplete";

const solution = [...SAMPLE_EASY.solution].map(Number) as CellValue[];
const none = new Set<number>();
const without = (cells: number[]): Grid => solution.map((v, i) => (cells.includes(i) ? 0 : v));
const kinds = (g: Grid, prev: Grid, cell: number, conflicts = none) =>
  unitsCompletedBy(prev, g, conflicts, cell).map((u) => `${u.kind}${u.index}`).sort();

describe("unitsCompletedBy", () => {
  const place = (empty: number[], cell: number, conflicts = none) => {
    const p = without(empty);
    const next = [...p] as Grid;
    next[cell] = solution[cell]!;
    return kinds(next, p, cell, conflicts);
  };
  it("detects a row", () => {
    expect(place([4, 13, 22], 4)).toEqual(["row0"]);
  });
  it("detects a column", () => {
    expect(place([36, 44, 28], 36)).toEqual(["column0"]);
  });
  it("detects a box", () => {
    expect(place([10, 17, 64], 10)).toEqual(["box0"]);
  });
  it("reports several units at once", () => {
    expect(place([0], 0)).toEqual(["box0", "column0", "row0"]);
  });
  it("is blocked by conflicts", () => {
    expect(place([0], 0, new Set([1]))).toEqual(["column0"]);
  });
  it("ignores overwriting a digit in an already valid full unit", () => {
    const p = [...solution] as Grid;
    const next = [...p] as Grid;
    next[0] = ((solution[0]! % 9) + 1) as CellValue;
    expect(unitsCompletedBy(p, next, none, 0)).toEqual([]);
  });
  it("does not fire on erase or a no-op", () => {
    const p = [...solution] as Grid;
    const next = [...p] as Grid;
    next[0] = 0;
    expect(unitsCompletedBy(p, next, none, 0)).toEqual([]);
    expect(unitsCompletedBy(p, p, none, 0)).toEqual([]);
  });
  it("never fires while any cell of the unit is empty", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 80 }), fc.integer({ min: 0, max: 80 }), (a, b) => {
        fc.pre(a !== b);
        const p = without([a, b]);
        const next = [...p] as Grid;
        next[a] = solution[a]!;
        const done = unitsCompletedBy(p, next, none, a);
        for (const u of done) expect(u.cells.includes(b)).toBe(false);
      }),
    );
  });
  it("labels units 1-based", () => {
    expect(unitLabel({ kind: "row", index: 2, cells: [] })).toBe("Row 3 complete");
  });
});
