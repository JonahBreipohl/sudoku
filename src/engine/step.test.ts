import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fromGrid } from "./candidates";
import { UNITS, digitBit, parseGrid, type Digit } from "./grid";
import { SAMPLE_EASY } from "./samples";
import { LEVELS, TECHNIQUES, applyStep, cellName, formatDigits, techniqueInfo, unitName, type Step } from "./step";

describe("TECHNIQUES", () => {
  it("matches the architecture tier table", () => {
    expect(TECHNIQUES.map((t) => [t.id, t.name, t.level, t.weight])).toEqual([
      ["naked-single", "Naked Single", "easy", 1],
      ["hidden-single", "Hidden Single", "easy", 1.5],
      ["pointing", "Pointing", "medium", 4],
      ["claiming", "Claiming", "medium", 4],
      ["naked-pair", "Naked Pair", "medium", 6],
      ["hidden-pair", "Hidden Pair", "medium", 8],
      ["naked-triple", "Naked Triple", "hard", 12],
      ["hidden-triple", "Hidden Triple", "hard", 16],
      ["naked-quad", "Naked Quad", "hard", 20],
      ["hidden-quad", "Hidden Quad", "hard", 25],
      ["x-wing", "X-Wing", "expert", 30],
      ["swordfish", "Swordfish", "expert", 45],
      ["xy-wing", "XY-Wing", "expert", 40],
      ["xyz-wing", "XYZ-Wing", "expert", 50],
      ["simple-coloring", "Simple Coloring", "expert", 45],
      ["x-chain", "X-Chain", "master", 60],
      ["xy-chain", "XY-Chain", "master", 70],
      ["w-wing", "W-Wing", "master", 55],
      ["unique-rectangle", "Unique Rectangle", "master", 50],
    ]);
  });
  it("has unique ids, levels in tier order, and lookup", () => {
    expect(new Set(TECHNIQUES.map((t) => t.id)).size).toBe(TECHNIQUES.length);
    const idx = TECHNIQUES.map((t) => LEVELS.indexOf(t.level));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(techniqueInfo("x-wing").weight).toBe(30);
  });
});

describe("naming helpers", () => {
  it("names cells 1-based", () => {
    expect(cellName(0)).toBe("r1c1");
    expect(cellName(22)).toBe("r3c5");
    expect(cellName(80)).toBe("r9c9");
  });
  it("names rows, columns and boxes", () => {
    expect(unitName(2)).toBe("row 3");
    expect(unitName(13)).toBe("column 5");
    expect(unitName(18)).toBe("box 1");
    expect(unitName(19)).toBe("box 2");
    expect(unitName(26)).toBe("box 9");
    expect(() => unitName(27)).toThrow(RangeError);
    expect(() => unitName(-1)).toThrow(RangeError);
  });
  it("names box 2 as the top-middle box", () => {
    expect(UNITS[19]).toContain(4);
    expect(unitName(19)).toBe("box 2");
  });
  it("formats digit lists", () => {
    expect(formatDigits([])).toBe("");
    expect(formatDigits([7])).toBe("7");
    expect(formatDigits([5, 3])).toBe("3 and 5");
    expect(formatDigits([7, 3, 5])).toBe("3, 5 and 7");
    expect(formatDigits([1, 2, 3, 4])).toBe("1, 2, 3 and 4");
    expect(formatDigits([3, 3, 5])).toBe("3 and 5");
  });
});

describe("applyStep", () => {
  const state = fromGrid(parseGrid(SAMPLE_EASY.puzzle));
  const solution = parseGrid(SAMPLE_EASY.solution);
  const empty = state.values.indexOf(0);
  const base: Step = {
    technique: "naked-single",
    placements: [],
    eliminations: [],
    cells: [empty],
    digits: [],
    explanation: "",
  };

  it("applies a placement via place()", () => {
    const d = solution[empty] as Digit;
    const next = applyStep(state, { ...base, placements: [{ cell: empty, digit: d }] });
    expect(next.values[empty]).toBe(d);
    expect(next.candidates[empty]).toBe(0);
  });
  it("applies eliminations and does not mutate the input", () => {
    const wrong = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as Digit[]).find((d) => d !== solution[empty] && state.candidates[empty]! & digitBit(d))!;
    const before = JSON.stringify(state);
    const next = applyStep(state, { ...base, eliminations: [{ cell: empty, digit: wrong }] });
    expect(next.candidates[empty]! & digitBit(wrong)).toBe(0);
    expect(JSON.stringify(state)).toBe(before);
  });
  it("property: a correct placement keeps solution digits in all empty cells", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 80 }), (i) => {
        const cell = state.values.findIndex((v, c) => v === 0 && c >= i);
        const c = cell === -1 ? empty : cell;
        const next = applyStep(state, { ...base, placements: [{ cell: c, digit: solution[c] as Digit }] });
        return next.values.every((v, k) => v !== 0 || (next.candidates[k]! & digitBit(solution[k] as Digit)) !== 0);
      }),
    );
  });
});
