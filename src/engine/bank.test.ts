import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emptyBank, extendBank, isBankDate, serializeBank, startBank, validateBank, type Bank, type ExtendOptions } from "./bank";
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
    expect(errorsOf({ ...good(), generated: "2026-13-45" })).toHaveLength(1);
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

  it("resuming after a skipped duplicate equals an uninterrupted run", () => {
    // Candidate 2 repeats candidate 0's puzzle, so the bank ends up smaller than the candidate count.
    const dupAt2: NonNullable<ExtendOptions["make"]> = (l, s) => fake(l, s.endsWith(":2") ? s.replace(/:2$/, ":0") : s);
    const seeds: string[] = [];
    const spy: NonNullable<ExtendOptions["make"]> = (l, s) => (seeds.push(s), dupAt2(l, s));

    const whole = extendBank(start, { level: "hard", seed: 1, count: 8, make: spy });
    const wholeSeeds = seeds.splice(0);

    const first = extendBank(start, { level: "hard", seed: 1, count: 4, make: spy });
    const firstSeeds = seeds.splice(0);
    const resumed = extendBank(first, { level: "hard", seed: 1, count: 8, make: spy });
    const resumedSeeds = seeds.splice(0);

    expect(resumed).toEqual(whole);
    expect(serializeBank(resumed)).toBe(serializeBank(whole));
    // The resumed run carries on after the last candidate tried instead of retrying old ones.
    expect([...firstSeeds, ...resumedSeeds]).toEqual(wholeSeeds);
    expect(whole.puzzles.map((p) => p.id).sort()).toContain("h-000003");
    expect(whole.puzzles.map((p) => p.id)).not.toContain("h-000002");
  });

  it("resuming a run stopped right after a skipped duplicate still equals an uninterrupted run", () => {
    const dupAt2: NonNullable<ExtendOptions["make"]> = (l, s) => fake(l, s.endsWith(":2") ? s.replace(/:2$/, ":0") : s);
    let t = 0;
    // now() is read once per candidate, so a deadline of 3 stops just after candidate 2 is skipped.
    const stopped = extendBank(start, { level: "hard", seed: 1, count: 6, deadline: 3, now: () => t++, make: dupAt2 });
    expect(stopped.puzzles).toHaveLength(2);
    const resumed = extendBank(stopped, { level: "hard", seed: 1, count: 6, make: dupAt2 });
    expect(serializeBank(resumed)).toBe(serializeBank(extendBank(start, { level: "hard", seed: 1, count: 6, make: dupAt2 })));
  });

  it("gives the same bytes however a run is split, duplicates included", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), fc.integer({ min: 0, max: 30 }), fc.integer({ min: 0, max: 30 }), fc.integer({ min: 2, max: 5 }), (total, a, b, every) => {
        // Every `every`th candidate repeats the one before it.
        const make: NonNullable<ExtendOptions["make"]> = (l, s) => {
          const m = /^(.*:)(\d+)$/.exec(s)!;
          const n = Number(m[2]);
          return fake(l, n > 0 && n % every === 0 ? `${m[1]}${n - 1}` : s);
        };
        const [x, y] = [Math.min(a, b, total), Math.min(Math.max(a, b), total)];
        const whole = extendBank(start, { level: "hard", seed: "p", count: total, make });
        let split = start;
        for (const c of [x, y, total]) split = extendBank(split, { level: "hard", seed: "p", count: c, make });
        expect(serializeBank(split)).toBe(serializeBank(whole));
      }),
    );
  });

  it("keeps an existing bank's generated date when extending", () => {
    const old = { ...emptyBank("hard", "2020-01-02") };
    expect(extendBank(old, { level: "hard", seed: 1, count: 3, make: fake }).generated).toBe("2020-01-02");
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

describe("startBank", () => {
  it("stamps a new bank with the given date", () => {
    expect(startBank(undefined, "hard", "2026-01-31")).toEqual({ ok: true, bank: emptyBank("hard", "2026-01-31") });
  });

  it("keeps an existing bank's own date, so appending leaves the header alone", () => {
    // Real puzzles: startBank validates the schema, which the stand-in generator's solutions would fail.
    const existing = extendBank(emptyBank("easy", "2020-01-02"), { level: "easy", seed: 1, count: 2 });
    const res = startBank(JSON.parse(serializeBank(existing)), "easy", "2099-12-31");
    expect(res).toEqual({ ok: true, bank: existing });
  });

  it("refuses an invalid bank or one for another level", () => {
    expect(startBank({ version: 2 }, "hard", "2026-01-31").ok).toBe(false);
    const res = startBank(good(), "hard", "2026-01-31");
    expect(res.ok ? [] : res.errors.join()).toMatch(/expected hard/);
  });
});

describe("isBankDate", () => {
  it("accepts real calendar dates only", () => {
    for (const ok of ["2026-10-25", "2024-02-29", "1999-12-31"]) expect(isBankDate(ok)).toBe(true);
    for (const bad of ["2026-02-30", "2025-02-29", "2026-13-01", "2026-00-10", "2026-1-1", "yesterday", "2026-10-25T00:00", ""]) expect(isBankDate(bad)).toBe(false);
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
