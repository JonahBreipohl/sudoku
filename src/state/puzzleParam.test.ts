import { describe, expect, it } from "vitest";
import { SAMPLE_EASY } from "../engine/samples";
import { recordFromSearch } from "./puzzleParam";

describe("recordFromSearch", () => {
  it("loads the given grid with its solution", () => {
    const r = recordFromSearch(`?test=1&puzzle=${SAMPLE_EASY.puzzle}`, 5);
    expect(r?.puzzle).toBe(SAMPLE_EASY.puzzle);
    expect(r?.solution).toBe(SAMPLE_EASY.solution);
    expect(r?.level).toBe("easy");
    expect(r?.source).toBe("import");
  });
  it("accepts zeros for blanks and a level", () => {
    const r = recordFromSearch(`?puzzle=${SAMPLE_EASY.puzzle.replace(/\./g, "0")}&level=hard`, 5);
    expect(r?.puzzle).toBe(SAMPLE_EASY.puzzle);
    expect(r?.level).toBe("hard");
  });
  it("returns null when absent or unplayable", () => {
    expect(recordFromSearch("?test=1", 0)).toBeNull();
    expect(recordFromSearch("?puzzle=123", 0)).toBeNull();
    expect(recordFromSearch(`?puzzle=${"1".repeat(81)}`, 0)).toBeNull();
  });
  it("ignores an unknown level", () => {
    expect(recordFromSearch(`?puzzle=${SAMPLE_EASY.puzzle}&level=zzz`, 0)?.level).toBe("easy");
  });
});
