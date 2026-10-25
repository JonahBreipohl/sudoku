import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { emptyBank, extendBank, serializeBank, validateBank, type Bank, type ExtendOptions } from "./bank";
import { generate } from "./generate";
import { grade } from "./grade";
import { LEVELS } from "./step";

const g = generate({ level: "easy", seed: "bank-test" });
const graded = grade(g.puzzle);
const good = (): Bank => ({
  version: 1,
  level: "easy",
  generated: "2026-10-25",
  puzzles: [
    {
      id: "e-000000",
      puzzle: g.puzzle.join(""),
      solution: g.solution.join(""),
      score: g.score,
      hardest: graded.level === null ? null : graded.hardest,
    },
  ],
});
const errorsOf = (json: unknown, deep = false): string[] => {
  const r = validateBank(json, { deep });
  return r.ok ? [] : r.errors;
};

describe("validateBank", () => {
  it("accepts a good bank, also deeply", () => {
    expect(validateBank(good())).toEqual({ ok: true });
    expect(validateBank(good(), { deep: true })).toEqual({ ok: true });
  });

  it("rejects non-objects and bad headers", () => {
    expect(validateBank(null).ok).toBe(false);
    expect(errorsOf({ ...good(), version: 2 })).toHaveLength(1);
    expect(errorsOf({ ...good(), level: "godlike" }).join()).toMatch(/unknown level/);
    expect(errorsOf({ ...good(), generated: "yesterday" })).toHaveLength(1);
    expect(errorsOf({ ...good(), puzzles: {} }).join()).toMatch(/array/);
  });

  it("rejects malformed entries", () => {
    const b = good();
    const p = b.puzzles[0]!;
    expect(errorsOf({ ...b, puzzles: [{ ...p, puzzle: "123" }] }).join()).toMatch(/81 digits/);
    expect(errorsOf({ ...b, puzzles: [{ ...p, solution: p.puzzle }] }).join()).toMatch(/solution/);
    expect(errorsOf({ ...b, puzzles: [{ ...p, score: -1 }] }).join()).toMatch(/score/);
    expect(errorsOf({ ...b, puzzles: [{ ...p, hardest: "magic" }] }).join()).toMatch(/technique/);
    expect(errorsOf({ ...b, puzzles: [{ ...p, id: "h-000000" }] }).join()).toMatch(/does not match level/);
    expect(errorsOf({ ...b, puzzles: [{ ...p, id: "nope" }] }).join()).toMatch(/malformed/);
  });

  it("rejects a solution that disagrees with the givens", () => {
    const b = good();
    const p = b.puzzles[0]!;
    const i = p.puzzle.split("").findIndex((c) => c !== "0");
    const swapped = p.solution.split("");
    const other = swapped.findIndex((c, k) => c !== swapped[i] && p.puzzle[k] === "0");
    [swapped[i], swapped[other]] = [swapped[other]!, swapped[i]!];
    expect(errorsOf({ ...b, puzzles: [{ ...p, solution: swapped.join("") }] }).length).toBeGreaterThan(0);
  });

  it("rejects duplicate ids and duplicate puzzles", () => {
    const b = good();
    const p = b.puzzles[0]!;
    expect(errorsOf({ ...b, puzzles: [p, { ...p }] }).join()).toMatch(/duplicate/);
    expect(errorsOf({ ...b, puzzles: [p, { ...p, id: "e-000001" }] }).join()).toMatch(/puzzle is a duplicate/);
  });

  it("rejects puzzles out of score order", () => {
    const b = good();
    const p = b.puzzles[0]!;
    const h = generate({ level: "easy", seed: "other" });
    const q = { ...p, id: "e-000001", puzzle: h.puzzle.join(""), solution: h.solution.join(""), score: p.score - 1 };
    expect(errorsOf({ ...b, puzzles: [p, q] }).join()).toMatch(/score order/);
  });

  it("deep mode catches a wrong level label and a wrong score", () => {
    const b = good();
    expect(errorsOf({ ...b, level: "medium", puzzles: [{ ...b.puzzles[0]!, id: "m-000000" }] }, true).join()).toMatch(/grades as easy/);
    expect(errorsOf({ ...b, puzzles: [{ ...b.puzzles[0]!, score: b.puzzles[0]!.score + 5 }] }, true).join()).toMatch(/disagree/);
  });
});

// A stand-in generator: distinct, deterministic, instant.
const fake: NonNullable<ExtendOptions["make"]> = (_level, seed) => {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { puzzle: String(h).padStart(81, "0"), solution: "1".repeat(81), score: h % 100, hardest: null };
};

describe("extendBank", () => {
  const start = emptyBank("hard", "2026-10-25");

  it("is deterministic for a seed and sorted by score", () => {
    const a = extendBank(start, { level: "hard", seed: 1, count: 20, make: fake });
    const b = extendBank(start, { level: "hard", seed: 1, count: 20, make: fake });
    expect(a).toEqual(b);
    expect(a.puzzles).toHaveLength(20);
    expect(a.puzzles.map((p) => p.score)).toEqual(a.puzzles.map((p) => p.score).sort((x, y) => x - y));
    expect(extendBank(start, { level: "hard", seed: 2, count: 20, make: fake })).not.toEqual(a);
  });

  it("resumes without duplicates or id reuse", () => {
    const first = extendBank(start, { level: "hard", seed: 1, count: 10, make: fake });
    const more = extendBank(first, { level: "hard", seed: 1, count: 25, make: fake });
    expect(more.puzzles).toHaveLength(25);
    expect(new Set(more.puzzles.map((p) => p.puzzle)).size).toBe(25);
    expect(new Set(more.puzzles.map((p) => p.id)).size).toBe(25);
    for (const p of first.puzzles) expect(more.puzzles).toContainEqual(p);
    expect(extendBank(more, { level: "hard", seed: 1, count: 25, make: fake })).toEqual(more);
  });

  it("skips a candidate that duplicates an existing puzzle", () => {
    let calls = 0;
    const dup: NonNullable<ExtendOptions["make"]> = (l, s) => (calls++ < 2 ? fake(l, "same") : fake(l, s));
    const out = extendBank(start, { level: "hard", seed: 1, count: 3, make: dup });
    expect(out.puzzles).toHaveLength(3);
    expect(new Set(out.puzzles.map((p) => p.puzzle)).size).toBe(3);
  });

  it("stops at the deadline", () => {
    let t = 0;
    const out = extendBank(start, { level: "hard", seed: 1, count: 100, deadline: 5, now: () => t++, make: fake });
    expect(out.puzzles.length).toBeLessThan(100);
  });

  it("produces output that validates and serializes to parseable JSON", () => {
    const out = extendBank(emptyBank("easy", "2026-10-25"), { level: "easy", seed: 3, count: 3 });
    expect(validateBank(out, { deep: true })).toEqual({ ok: true });
    expect(JSON.parse(serializeBank(out))).toEqual(out);
  });
});

describe("committed bank", () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "puzzles");
  it("has all five levels, valid, under 400 KB in total", () => {
    let bytes = 0;
    for (const level of LEVELS) {
      const text = readFileSync(join(dir, `${level}.json`), "utf8");
      bytes += Buffer.byteLength(text);
      const json = JSON.parse(text) as Bank;
      expect(json.level).toBe(level);
      expect(validateBank(json)).toEqual({ ok: true });
    }
    expect(bytes).toBeLessThan(400 * 1024);
  });
});
