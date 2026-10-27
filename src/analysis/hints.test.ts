import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { cellName, digitBit, parseGrid, type Digit, type Level } from "../engine";
import { SAMPLE_EASY } from "../engine/samples";
import type { GameRecord, HintTier } from "../state/events";
import { append, type NewBoardEvent, type Tree } from "../state/tree";
import { condenseExplanation, hint, MAX_REVEAL_TEXT } from "./hints";

const TIERS: readonly HintTier[] = ["nudge", "technique", "reveal"];
const T0 = 1_700_000_000_000;

// From src/engine/grade.test.ts (seed 2): Medium, hardest technique pointing.
const MEDIUM = {
  puzzle: ".5.4..8......6....6....5.42..9..1.85...2.4...71.6..9..82.7....1....8......7..3.2.",
  solution: "351427869274869513698135742469371285583294176712658934825746391136982457947513628",
};

type Move =
  | { type: "place"; cell: number; digit: number }
  | { type: "erase"; cell: number }
  | { type: "note"; cell: number; digit: number; on: boolean };

function record(puzzle: { puzzle: string; solution: string }, moves: readonly Move[], level: Level = "easy"): GameRecord {
  let tree: Tree = { nodes: [], cursor: -1 };
  moves.forEach((m, i) => {
    const at = T0 + i * 5000;
    const event = (m.type === "place" ? { ...m, input: "keyboard" } : m) as NewBoardEvent;
    tree = append(tree, { ...event, at, elapsed: i * 5000 } as NewBoardEvent);
  });
  return {
    version: 1,
    id: "hint-test",
    puzzle: puzzle.puzzle,
    solution: puzzle.solution,
    level,
    score: 0,
    source: "import",
    createdAt: T0,
    nodes: [...tree.nodes],
    cursor: tree.cursor,
    log: [{ type: "start", at: T0 }],
    status: "playing",
  };
}

// From src/engine/grade.test.ts: one puzzle per upper tier.
const HARD = {
  puzzle: ".69.8..1......17....1.72....82...96..9.....4..73...85....32.5....76......2..4.69.",
  solution: "769483215234561789851972436182754963596238147473196852618329574947615328325847691",
};
const EXPERT = {
  puzzle: "..3.49...4.1......6.8.1...5...5..941...1.7...152..8...2...7.8.9......3.4...23.5..",
  solution: "523749186491856732678312495867523941349167258152498673235674819716985324984231567",
};
const MASTER = {
  puzzle: "2..6...7...9...86.....25..95.1.4..2...........2..6.7.33..15.....68...5...9...3..6",
  solution: "283694175459317862617825349531749628976238451824561793342156987168972534795483216",
};

const emptyCells = (puzzle: string) => [...puzzle].flatMap((ch, i) => (ch === "." ? [i] : []));
const truthAt = (solution: string, cell: number) => Number(solution[cell]) as Digit;
/** A digit that is not the solution of `cell`. */
const wrongAt = (solution: string, cell: number) => (truthAt(solution, cell) % 9) + 1;

describe("hint on a correct board", () => {
  const fresh = record(SAMPLE_EASY, []);

  it("escalates from a place to the technique to the full step", () => {
    const [nudge, technique, reveal] = TIERS.map((t) => hint(fresh, t));
    expect(nudge!.kind).toBe("step");
    expect(nudge!.text).toMatch(/^Look at (r\dc\d|row \d|column \d|box \d)\.$/);
    expect(nudge!.technique).toBeNull();
    expect(nudge!.step).toBeNull();
    expect(nudge!.placement).toBeNull();

    expect(technique!.technique).toBe(reveal!.step!.technique);
    expect(technique!.text).toMatch(/^(Naked|Hidden) Single in /);
    expect(technique!.step).toBeNull();

    const step = reveal!.step!;
    expect(reveal!.text).toBe(`${condenseExplanation(step.explanation)}.`);
    expect(reveal!.cells).toEqual(step.cells);
    expect(reveal!.placement).toEqual(step.placements[0]);
    expect(reveal!.logId).toBe(step.technique);
    // The nudge's place is the technique tier's place too.
    expect(technique!.text.endsWith(nudge!.text.slice("Look at ".length))).toBe(true);
  });

  it("returns the same hint at the same tier for the same state", () => {
    expect(hint(fresh, "reveal")).toEqual(hint(fresh, "reveal"));
  });

  it("reports a complete, correct board as solved", () => {
    const moves = emptyCells(SAMPLE_EASY.puzzle).map((cell) => ({ type: "place" as const, cell, digit: truthAt(SAMPLE_EASY.solution, cell) }));
    const h = hint(record(SAMPLE_EASY, moves), "nudge");
    expect(h.kind).toBe("solved");
    expect(h.logId).toBe("solved");
  });

  it("does not modify the record", () => {
    const r = record(MEDIUM, [{ type: "note", cell: 0, digit: 3, on: true }], "medium");
    const copy = structuredClone(r);
    for (const t of TIERS) hint(r, t);
    expect(r).toEqual(copy);
  });
});

describe("hint with a mistake on the board", () => {
  const [a, b] = emptyCells(SAMPLE_EASY.puzzle) as [number, number];
  const s = SAMPLE_EASY.solution;

  it("points at the wrong cell before any deduction", () => {
    const r = record(SAMPLE_EASY, [{ type: "place", cell: a, digit: wrongAt(s, a) }]);
    const [nudge, technique, reveal] = TIERS.map((t) => hint(r, t));
    for (const h of [nudge!, technique!, reveal!]) {
      expect(h.kind).toBe("mistake");
      expect(h.cells[0]).toBe(a);
      expect(h.technique).toBeNull();
      expect(h.logId).toBe("mistake");
    }
    expect(nudge!.text).toBe(`Check ${cellName(a)}.`);
    expect(nudge!.placement).toBeNull();
    expect(reveal!.text).toBe(`${cellName(a)} is ${truthAt(s, a)}, not ${wrongAt(s, a)}.`);
    expect(reveal!.placement).toEqual({ cell: a, digit: truthAt(s, a) });
  });

  it("names a visible clash at the technique tier", () => {
    // r1c1 is empty in the sample; put a digit there that already sits in row 1.
    const grid = parseGrid(SAMPLE_EASY.puzzle);
    const rowGiven = [1, 2, 3, 4, 5, 6, 7, 8].find((c) => grid[c] !== 0)!;
    const cell = emptyCells(SAMPLE_EASY.puzzle).find((c) => c < 9)!;
    const digit = grid[rowGiven]!;
    const h = hint(record(SAMPLE_EASY, [{ type: "place", cell, digit }]), "technique");
    expect(h.text).toBe(`The ${digit} in ${cellName(cell)} clashes with the ${digit} in ${cellName(rowGiven)}.`);
    expect(h.cells).toEqual([cell, rowGiven]);
  });

  it("picks the earliest-placed wrong value", () => {
    const moves: Move[] = [
      { type: "place", cell: b, digit: wrongAt(s, b) },
      { type: "place", cell: a, digit: wrongAt(s, a) },
    ];
    expect(hint(record(SAMPLE_EASY, moves), "nudge").cells).toEqual([b]);
  });

  it("forgets a mistake once it is erased or corrected", () => {
    const erased = record(SAMPLE_EASY, [{ type: "place", cell: a, digit: wrongAt(s, a) }, { type: "erase", cell: a }]);
    const fixed = record(SAMPLE_EASY, [{ type: "place", cell: a, digit: wrongAt(s, a) }, { type: "place", cell: a, digit: truthAt(s, a) }]);
    expect(hint(erased, "nudge").kind).toBe("step");
    expect(hint(fixed, "nudge").kind).toBe("step");
  });

  it("treats notes that leave out the solution digit as a mistake", () => {
    const r = record(SAMPLE_EASY, [{ type: "note", cell: a, digit: wrongAt(s, a), on: true }]);
    const nudge = hint(r, "nudge");
    expect(nudge.kind).toBe("mistake");
    expect(nudge.text).toBe(`Check the notes in ${cellName(a)}.`);
    expect(hint(r, "reveal").placement).toEqual({ cell: a, digit: truthAt(s, a) });
  });
});

/** A random partial board: some empty cells filled correctly, others noted with sound notes. */
const partialMoves = (puzzle: { puzzle: string; solution: string }) => {
  const cells = emptyCells(puzzle.puzzle);
  return fc
    .tuple(
      fc.array(fc.boolean(), { minLength: cells.length, maxLength: cells.length }),
      fc.array(fc.integer({ min: 0, max: 0x1ff }), { minLength: cells.length, maxLength: cells.length }),
    )
    .map(([filled, noteMasks]) => {
      const moves: Move[] = [];
      cells.forEach((cell, i) => {
        const truth = truthAt(puzzle.solution, cell);
        // Keep the board unsolved: leave the first empty cell open.
        if (filled[i] && i > 0) moves.push({ type: "place", cell, digit: truth });
        else if (noteMasks[i]! % 3 === 0) {
          // Sound notes always include the true digit, plus a random handful of others.
          const mask = noteMasks[i]! | digitBit(truth);
          for (let d = 1; d <= 9; d++) if (mask & (1 << (d - 1))) moves.push({ type: "note", cell, digit: d, on: true });
        }
      });
      return moves;
    });
};

describe("condenseExplanation", () => {
  it("passes short explanations through", () => {
    expect(condenseExplanation("Naked Single: r1c1 must be 5")).toBe("Naked Single: r1c1 must be 5");
  });

  it("keeps a long chain's end nodes and counts its links", () => {
    const nodes = Array.from({ length: 20 }, (_, i) => `r${(i % 9) + 1}c${((i * 2) % 9) + 1}`);
    const chain = nodes.map((n, i) => (i ? `${i % 2 ? "=" : "-"} ${n}` : n)).join(" ");
    const long = `X-Chain on 1: ${chain}; one of ${nodes[0]} and ${nodes[19]} must be 1, so remove 1 from r2c2, r3c2`;
    const out = condenseExplanation(long);
    expect(out.length).toBeLessThanOrEqual(MAX_REVEAL_TEXT - 1);
    expect(out).toContain(`${nodes[0]} ... ${nodes[19]} (19 links)`);
    expect(out.endsWith("so remove 1 from r2c2, r3c2")).toBe(true);
  });

  it("cuts a long elimination list with a count", () => {
    const cells = Array.from({ length: 30 }, (_, i) => `r${(i % 9) + 1}c${(i % 7) + 1}`).join(", ");
    const out = condenseExplanation(`XY-Chain on 2: r1c1 (2=3) - r1c2 (3=2); one of r1c1 and r1c2 must be 2, so remove 2 from ${cells}`);
    expect(out.length).toBeLessThanOrEqual(MAX_REVEAL_TEXT - 1);
    expect(out).toMatch(/ and \d+ more$/);
  });
});

describe("hint properties", () => {
  for (const [name, puzzle, level] of [
    ["easy", SAMPLE_EASY, "easy"],
    ["medium", MEDIUM, "medium"],
  ] as const) {
    it(`never contradicts the solution on partial correct ${name} boards`, () => {
      const solution = parseGrid(puzzle.solution);
      fc.assert(
        fc.property(partialMoves(puzzle), (moves) => {
          const r = record(puzzle, moves, level);
          const [nudge, technique, reveal] = TIERS.map((t) => hint(r, t));
          const step = reveal!.step!;
          expect(reveal!.kind).toBe("step");
          for (const p of step.placements) expect(p.digit).toBe(solution[p.cell]);
          for (const e of step.eliminations) expect(e.digit).not.toBe(solution[e.cell]);
          if (reveal!.placement) expect(reveal!.placement.digit).toBe(solution[reveal!.placement.cell]);
          // The lower tiers describe the same step and say no more than their tier allows.
          expect(technique!.technique).toBe(step.technique);
          expect(nudge!.technique).toBeNull();
          expect(nudge!.cells.length + nudge!.units.length).toBe(1);
          for (const h of [nudge!, technique!, reveal!]) {
            expect(h.text.length).toBeGreaterThan(0);
            expect(h.text.length).toBeLessThanOrEqual(nudge === h ? 24 : technique === h ? 48 : 160);
          }
        }),
        { numRuns: 40 },
      );
    });
  }

  for (const [name, puzzle, level] of [
    ["hard", HARD, "hard"],
    ["expert", EXPERT, "expert"],
    ["master", MASTER, "master"],
  ] as const) {
    it(`stays sound and within length limits on ${name} boards`, () => {
      const solution = parseGrid(puzzle.solution);
      fc.assert(
        fc.property(partialMoves(puzzle), (moves) => {
          const r = record(puzzle, moves, level);
          const [nudge, technique, reveal] = TIERS.map((t) => hint(r, t));
          const step = reveal!.step!;
          expect(reveal!.kind).toBe("step");
          for (const p of step.placements) expect(p.digit).toBe(solution[p.cell]);
          for (const e of step.eliminations) expect(e.digit).not.toBe(solution[e.cell]);
          expect(technique!.technique).toBe(step.technique);
          expect(nudge!.text.length).toBeLessThanOrEqual(24);
          expect(technique!.text.length).toBeLessThanOrEqual(48);
          expect(reveal!.text.length).toBeLessThanOrEqual(MAX_REVEAL_TEXT);
          expect(reveal!.text).not.toMatch(/\n/);
        }),
        { numRuns: 15 },
      );
    });
  }

  it("falls back to the full technique set for a mislabeled puzzle", () => {
    const r = record(MASTER, [], "easy");
    const h = hint(r, "reveal");
    expect(h.kind).toBe("step");
    expect(h.text.length).toBeLessThanOrEqual(MAX_REVEAL_TEXT);
  });

  it("puts a wrong value ahead of every deduction", () => {
    const cells = emptyCells(SAMPLE_EASY.puzzle);
    fc.assert(
      fc.property(partialMoves(SAMPLE_EASY), fc.nat(cells.length - 1), fc.integer({ min: 1, max: 8 }), (moves, pick, shift) => {
        const cell = cells[pick]!;
        const truth = truthAt(SAMPLE_EASY.solution, cell);
        const digit = ((truth - 1 + shift) % 9) + 1;
        const r = record(SAMPLE_EASY, [...moves, { type: "place", cell, digit }]);
        for (const t of TIERS) {
          const h = hint(r, t);
          expect(h.kind).toBe("mistake");
          expect(h.cells[0]).toBe(cell);
          expect(h.step).toBeNull();
        }
        expect(hint(r, "reveal").placement).toEqual({ cell, digit: truth });
      }),
      { numRuns: 40 },
    );
  });
});
