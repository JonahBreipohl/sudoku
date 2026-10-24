import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parsePuzzleInput, puzzleUrl } from "./codec";
import { parseGrid } from "./grid";
import { SAMPLE_EASY } from "./samples";

const { puzzle, solution } = SAMPLE_EASY;

describe("parsePuzzleInput", () => {
  it("accepts an 81-char string", () => {
    expect(parsePuzzleInput(puzzle)).toEqual({ ok: true, grid: parseGrid(puzzle) });
  });
  it("accepts zeros and nine lines", () => {
    const lines = puzzle.replace(/\./g, "0").match(/.{9}/g)!.join("\n");
    expect(parsePuzzleInput(lines)).toEqual({ ok: true, grid: parseGrid(puzzle) });
  });
  it("accepts a URL with ?puzzle=", () => {
    expect(parsePuzzleInput(`https://x.test/play?a=1&puzzle=${puzzle}#top`)).toEqual({ ok: true, grid: parseGrid(puzzle) });
  });
  it("reports wrong length", () => {
    expect(parsePuzzleInput(puzzle.slice(1))).toEqual({ ok: false, reason: "wrong-length" });
    expect(parsePuzzleInput("")).toEqual({ ok: false, reason: "wrong-length" });
  });
  it("reports invalid characters", () => {
    expect(parsePuzzleInput("x" + puzzle.slice(1))).toEqual({ ok: false, reason: "invalid-characters" });
  });
  it("reports rule conflicts", () => {
    expect(parsePuzzleInput("55" + puzzle.slice(2))).toEqual({ ok: false, reason: "rule-conflict" });
  });
  it("reports no solution", () => {
    // r1c1 has no candidate left (1-8 in its row/col/box peers, 9 in its row) yet no placed pair clashes.
    const g = ".".repeat(81).split("");
    "12345678".split("").forEach((d, i) => {
      const cell = [1, 2, 9, 10, 11, 18, 19, 20][i]!; // box peers first
      g[cell] = d;
    });
    // Box already holds 1-8 in its peers; put 9 in the row outside the box.
    g[3] = "9";
    const r = parsePuzzleInput(g.join(""));
    expect(r).toEqual({ ok: false, reason: "no-solution" });
  });
  it("reports multiple solutions", () => {
    expect(parsePuzzleInput(".".repeat(81))).toEqual({ ok: false, reason: "multiple-solutions" });
  });
});

describe("puzzleUrl", () => {
  it("replaces an existing puzzle param and fragment", () => {
    const g = parseGrid(puzzle);
    expect(puzzleUrl(g, "https://x.test/?puzzle=old&a=1#h")).toBe(`https://x.test/?a=1&puzzle=${puzzle}`);
  });
  it("round-trips through parsePuzzleInput (property)", () => {
    const sol = parseGrid(solution);
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 81, maxLength: 81 }), fc.constantFrom("https://a.test/", "/play", "https://a.test/p?x=1"), (keep, base) => {
        const grid = sol.map((v, i) => (keep[i] ? v : 0));
        const result = parsePuzzleInput(puzzleUrl(grid, base));
        if (result.ok) expect(result.grid).toEqual(grid);
        else expect(result.reason).toBe("multiple-solutions");
      }),
      { numRuns: 100 },
    );
  });
  it("round-trips the sample puzzle", () => {
    const g = parseGrid(puzzle);
    expect(parsePuzzleInput(puzzleUrl(g, "https://a.test/"))).toEqual({ ok: true, grid: g });
  });
});
