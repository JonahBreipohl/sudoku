import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PEERS, emptyGrid, parseGrid, type CellValue, type Digit } from "./grid";
import { SAMPLE_EASY } from "./samples";
import { cellsWrongVsSolution, findConflicts, isFilled, isSolved, respectsGivens } from "./validate";

const solution = parseGrid(SAMPLE_EASY.solution);
const puzzle = parseGrid(SAMPLE_EASY.puzzle);

describe("findConflicts", () => {
  it("finds none in the empty grid, the puzzle, or its solution", () => {
    expect(findConflicts(emptyGrid()).size).toBe(0);
    expect(findConflicts(puzzle).size).toBe(0);
    expect(findConflicts(solution).size).toBe(0);
  });

  it("marks both cells when a digit repeats in a peer", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 80 }),
        fc.integer({ min: 0, max: 19 }),
        fc.integer({ min: 1, max: 9 }),
        (cell, peerIdx, d) => {
          const grid = emptyGrid();
          const peer = PEERS[cell]![peerIdx]!;
          grid[cell] = d as Digit;
          grid[peer] = d as Digit;
          expect([...findConflicts(grid)].sort((a, b) => a - b)).toEqual([cell, peer].sort((a, b) => a - b));
        },
      ),
    );
  });
});

describe("solved and filled", () => {
  it("accepts the solution and rejects the puzzle", () => {
    expect(isSolved(solution)).toBe(true);
    expect(isFilled(puzzle)).toBe(false);
    expect(isSolved(puzzle)).toBe(false);
  });

  it("rejects a full grid with a swapped pair in a row", () => {
    const g: CellValue[] = [...solution];
    [g[0], g[9]] = [g[9]!, g[0]!];
    expect(isFilled(g)).toBe(true);
    expect(isSolved(g)).toBe(false);
  });
});

describe("comparison with solution and givens", () => {
  it("reports wrong cells only", () => {
    const g: CellValue[] = [...puzzle];
    const blank = g.indexOf(0);
    g[blank] = solution[blank] === 9 ? 1 : (((solution[blank] as number) + 1) as Digit);
    expect(cellsWrongVsSolution(g, solution)).toEqual([blank]);
    expect(cellsWrongVsSolution(puzzle, solution)).toEqual([]);
  });

  it("checks givens are kept", () => {
    expect(respectsGivens(solution, puzzle)).toBe(true);
    const g: CellValue[] = [...solution];
    const given = puzzle.findIndex((v) => v !== 0);
    g[given] = 0;
    expect(respectsGivens(g, puzzle)).toBe(false);
  });
});
