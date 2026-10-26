import { describe, expect, it } from "vitest";
import type { Step } from "../engine";
import { describeAlternative, describeCascade, describeDiagnosis, describeMistake, formatDuration } from "./analysisCopy";

const step: Step = {
  technique: "hidden-single",
  placements: [],
  eliminations: [],
  cells: [1],
  digits: [4],
  explanation: "Only r1c2 in row 1 can hold 4",
};
const mistake = { kind: "wrong-placement", eventId: 1, index: 0, cell: 0, digit: 5, solutionDigit: 7 } as never;
const root = (diagnosis: unknown) => ({ mistake, diagnosis }) as never;

describe("analysis copy", () => {
  it("renders every diagnosis kind", () => {
    const kinds = [
      { kind: "consequence", wrongCell: 4, wrongEventId: null },
      { kind: "conflict", conflictCells: [3, 9] },
      { kind: "typo", intended: 6, gapMs: 900, layout: "pad" },
      { kind: "guess", stepsTried: 0 },
      { kind: "guess", stepsTried: 3 },
      { kind: "deduction", step, stepsBefore: 1, outcome: "eliminated" },
      { kind: "deduction", step, stepsBefore: 1, outcome: "placed" },
    ];
    for (const k of kinds) {
      const text = describeDiagnosis(root(k));
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toMatch(/undefined|NaN|\[object/);
    }
    expect(describeDiagnosis(root(kinds[2]))).toContain("0.9 s");
    expect(describeDiagnosis(root(kinds[5]))).toContain("Hidden Single");
  });
  it("describes the mistake, alternative and cascade", () => {
    expect(describeMistake(mistake)).toContain("right answer is 7");
    expect(describeAlternative(null)).toMatch(/No step/);
    expect(describeAlternative(step)).toContain("Hidden Single");
    expect(describeCascade({ eventId: 2, index: 1, cell: 10, digit: 3, move: "placement", wrong: true, dependsOn: 0 })).toBe(
      "placed 3 in r2c2 (also wrong), hidden by r1c1",
    );
  });
  it("formats durations", () => {
    expect(formatDuration(65000)).toBe("1 min 5 s");
    expect(formatDuration(9000)).toBe("9 s");
  });
});
