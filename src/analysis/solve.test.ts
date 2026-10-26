import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { LEVELS, fromGrid, nextStep, parseGrid, solveLogically, techniqueInfo, type Level } from "../engine";
import { SAMPLE_EASY } from "../engine/samples";
import type { GameRecord, MetaEvent } from "../state/events";
import { activeMs } from "../state/timer";
import { append, undo, type NewBoardEvent, type Tree } from "../state/tree";
import { STALL_COUNT, analyzeSolve } from "./solve";

type Body = NewBoardEvent extends infer E ? (E extends unknown ? Omit<E, "at" | "elapsed"> : never) : never;
type Meta = MetaEvent extends infer E ? (E extends unknown ? Omit<E, "at"> : never) : never;

const T0 = 1_700_000_000_000;

/**
 * A scripted game on a fake clock. Board events get `elapsed` from the real timer, so the record
 * looks exactly like one the store would write.
 */
class Script {
  now = T0;
  tree: Tree = { nodes: [], cursor: -1 };
  log: MetaEvent[] = [];
  constructor(
    readonly puzzle: string,
    readonly solution: string,
    readonly level: Level,
  ) {
    this.meta({ type: "start" });
  }
  wait(ms: number): this {
    this.now += ms;
    return this;
  }
  meta(e: Meta): this {
    this.log.push({ ...e, at: this.now } as MetaEvent);
    return this;
  }
  board(body: Body): this {
    const elapsed = activeMs({ log: this.log }, this.now);
    this.tree = append(this.tree, { ...body, at: this.now, elapsed } as NewBoardEvent);
    return this;
  }
  place(cell: number, digit: number): this {
    return this.board({ type: "place", cell, digit, input: "keyboard" });
  }
  undo(): this {
    this.tree = undo(this.tree);
    return this.meta({ type: "undo" });
  }
  record(): GameRecord {
    return {
      version: 1,
      id: "solve-test",
      puzzle: this.puzzle,
      solution: this.solution,
      level: this.level,
      score: 0,
      source: "import",
      createdAt: T0,
      nodes: [...this.tree.nodes],
      cursor: this.tree.cursor,
      log: [...this.log],
      status: this.log.some((e) => e.type === "submit") ? "submitted" : "playing",
    };
  }
}

const easy = () => new Script(SAMPLE_EASY.puzzle, SAMPLE_EASY.solution, "easy");
const EASY_SOLUTION = parseGrid(SAMPLE_EASY.solution);
const EASY_EMPTY = [...parseGrid(SAMPLE_EASY.puzzle).keys()].filter((c) => SAMPLE_EASY.puzzle[c] === ".");

// From src/engine/grade.test.ts (seed 2): Medium, hardest technique pointing.
const MEDIUM = {
  puzzle: ".5.4..8......6....6....5.42..9..1.85...2.4...71.6..9..82.7....1....8......7..3.2.",
  solution: "351427869274869513698135742469371285583294176712658934825746391136982457947513628",
};

/** Cells in the order the driver places them, from the givens. */
function driverOrder(puzzle: string): number[] {
  return solveLogically(fromGrid(parseGrid(puzzle)), "master").steps.flatMap((s) => s.placements.map((p) => p.cell));
}

describe("analyzeSolve: time breakdown", () => {
  it("splits active, paused and per-third time on a scripted solve", () => {
    const s = easy();
    // 51 placements, 10 s apart; a 60 s pause after the 10th and a 30 s hidden tab after the 30th.
    EASY_EMPTY.forEach((cell, i) => {
      s.wait(10_000).place(cell, EASY_SOLUTION[cell]!);
      if (i === 9) s.meta({ type: "pause" }).wait(60_000).meta({ type: "resume" });
      if (i === 29) s.meta({ type: "hidden" }).wait(30_000).meta({ type: "visible" });
    });
    s.wait(2_000).meta({ type: "submit", result: "solved" });
    const r = analyzeSolve(s.record());

    expect(r.solved).toBe(true);
    expect(r.time.activeMs).toBe(51 * 10_000 + 2_000);
    expect(r.time.activeMs).toBe(activeMs(s.record(), s.now + 999_999));
    expect(r.time.pausedMs).toBe(90_000);
    expect(r.time.phasePlacements).toEqual([17, 17, 17]);
    expect(r.time.phases).toEqual([170_000, 170_000, 172_000]);
  });

  it("counts paused time only after the first start and stops at submit", () => {
    const s = easy();
    s.wait(5_000).meta({ type: "pause" }).wait(20_000).meta({ type: "resume" });
    s.wait(1_000).place(EASY_EMPTY[0]!, EASY_SOLUTION[EASY_EMPTY[0]!]!);
    s.wait(1_000).meta({ type: "submit", result: "incorrect" }).wait(50_000).meta({ type: "pause" });
    const r = analyzeSolve(s.record());
    expect(r.solved).toBe(false);
    expect(r.time.activeMs).toBe(7_000);
    expect(r.time.pausedMs).toBe(20_000);
    expect(r.time.phasePlacements).toEqual([1, 0, 0]);
    expect(r.time.phases).toEqual([6_000, 0, 1_000]);
  });

  it("puts all time in the last phase when nothing was placed", () => {
    const r = analyzeSolve(easy().wait(4_000).meta({ type: "submit", result: "incorrect" }).record());
    expect(r.time).toMatchObject({ activeMs: 4_000, pausedMs: 0, phases: [0, 0, 4_000], phasePlacements: [0, 0, 0] });
    expect(r.stalls).toEqual([]);
    expect(r.hardest).toBeNull();
  });
});

describe("analyzeSolve: stalls", () => {
  it("reports the three longest active gaps, with the step available at each", () => {
    const s = easy();
    const gaps = new Map([
      [0, 45_000], // opening gap, before the first move
      [7, 120_000],
      [20, 90_000],
      [33, 30_000],
    ]);
    EASY_EMPTY.forEach((cell, i) => {
      if (i === 33) {
        // 30 s active plus a 200 s pause: paused time does not make a stall.
        s.wait(10_000).meta({ type: "pause" }).wait(200_000).meta({ type: "resume" }).wait(20_000);
      } else s.wait(gaps.get(i) ?? 5_000);
      s.place(cell, EASY_SOLUTION[cell]!);
    });
    const record = s.record();
    const r = analyzeSolve(record);

    expect(r.stalls).toHaveLength(STALL_COUNT);
    expect(r.stalls.map((x) => x.durationMs)).toEqual([120_000, 90_000, 45_000]);
    const [first, second, third] = r.stalls;
    expect(first).toMatchObject({ afterId: 6, beforeId: 7 });
    expect(second).toMatchObject({ afterId: 19, beforeId: 20 });
    expect(third).toMatchObject({ afterId: -1, beforeId: 0, startMs: 0 });
    expect(first!.startMs).toBe(record.nodes[6]!.elapsed);

    // The step available is nextStep on the board after the event that opened the gap.
    const board = parseGrid(SAMPLE_EASY.puzzle);
    for (const cell of EASY_EMPTY.slice(0, 7)) board[cell] = EASY_SOLUTION[cell]!;
    expect(first!.available).toEqual(nextStep(fromGrid(board), "easy"));
    expect(third!.available).toEqual(nextStep(fromGrid(parseGrid(SAMPLE_EASY.puzzle)), "easy"));
  });

  it("ignores wrong values when finding the step available", () => {
    const cell = EASY_EMPTY[0]!;
    const wrong = (EASY_SOLUTION[cell]! % 9) + 1;
    const s = easy().wait(1_000).place(cell, wrong).wait(60_000).place(cell, EASY_SOLUTION[cell]!);
    const r = analyzeSolve(s.record());
    expect(r.stalls[0]).toMatchObject({ afterId: 0, beforeId: 1, durationMs: 60_000 });
    expect(r.stalls[0]!.available).toEqual(nextStep(fromGrid(parseGrid(SAMPLE_EASY.puzzle)), "easy"));
  });
});

describe("analyzeSolve: hardest technique", () => {
  it("finds the medium technique when the last cell the driver places is placed first", () => {
    const order = driverOrder(MEDIUM.puzzle);
    const solution = parseGrid(MEDIUM.solution);
    const s = new Script(MEDIUM.puzzle, MEDIUM.solution, "medium");
    for (const cell of [...order].reverse()) s.wait(3_000).place(cell, solution[cell]!);
    const r = analyzeSolve(s.record());
    expect(r.solved).toBe(true);
    expect(r.hardest).toMatchObject({ eventId: 0, cell: order[order.length - 1], technique: "pointing" });
    expect(r.hardest!.chainLength).toBeGreaterThan(1);
    expect(r.needs).toHaveLength(order.length);
  });

  it("still attributes pointing when the medium puzzle is solved in the driver's order", () => {
    // The grid alone does not carry a pointing step's eliminations, so the placement after it
    // re-derives them and needs pointing again.
    const order = driverOrder(MEDIUM.puzzle);
    const solution = parseGrid(MEDIUM.solution);
    const s = new Script(MEDIUM.puzzle, MEDIUM.solution, "medium");
    for (const cell of order) s.wait(3_000).place(cell, solution[cell]!);
    const r = analyzeSolve(s.record());
    const levels = r.needs.map((n) => techniqueInfo(n.technique).level);
    expect(levels.every((l) => l === "easy" || l === "medium")).toBe(true);
    expect(r.hardest!.technique).toBe("pointing");
  });

  it("leaves out wrong placements, givens and hint reveals", () => {
    const [a, b, c] = EASY_EMPTY as [number, number, number];
    const given = [...SAMPLE_EASY.puzzle].findIndex((ch) => ch !== ".");
    const s = easy()
      .wait(1_000)
      .place(a, (EASY_SOLUTION[a]! % 9) + 1)
      .wait(1_000)
      .place(a, EASY_SOLUTION[a]!)
      .wait(1_000)
      .place(given, EASY_SOLUTION[given]!)
      .wait(1_000)
      .board({ type: "hint-reveal", cell: b, digit: EASY_SOLUTION[b]!, step: "naked-single" })
      .wait(1_000)
      .place(c, EASY_SOLUTION[c]!);
    const r = analyzeSolve(s.record());
    expect(r.needs.map((n) => n.eventId)).toEqual([1, 4]);
    for (const n of r.needs) expect(techniqueInfo(n.technique).level).toBe("easy");
  });
});

describe("analyzeSolve: assists", () => {
  it("counts checks, hints by tier, auto-notes, reveals and auto-candidates", () => {
    const [a] = EASY_EMPTY as [number];
    const s = easy()
      .wait(1_000)
      .meta({ type: "check", mistakes: 0 })
      .board({ type: "auto-notes" })
      .wait(1_000)
      .undo() // an undone assist still counts
      .meta({ type: "settings-assist", autoCandidates: true })
      .board({ type: "auto-notes" })
      .meta({ type: "hint", tier: "nudge", step: "hidden-single" })
      .meta({ type: "hint", tier: "technique", step: "hidden-single" })
      .meta({ type: "hint", tier: "reveal", step: "hidden-single" })
      .board({ type: "hint-reveal", cell: a, digit: EASY_SOLUTION[a]!, step: "hidden-single" })
      .meta({ type: "hint", tier: "nudge", step: "naked-single" })
      .meta({ type: "check", mistakes: 0 })
      .meta({ type: "settings-assist", autoCandidates: false });
    expect(analyzeSolve(s.record()).assists).toEqual({
      checks: 2,
      hints: { nudge: 2, technique: 1, reveal: 1 },
      autoNotes: 2,
      reveals: 1,
      autoCandidates: true,
    });
  });

  it("is all zero for an unassisted game", () => {
    expect(analyzeSolve(easy().record()).assists).toEqual({
      checks: 0,
      hints: { nudge: 0, technique: 0, reveal: 0 },
      autoNotes: 0,
      reveals: 0,
      autoCandidates: false,
    });
  });
});

describe("analyzeSolve: properties", () => {
  const order = fc.shuffledSubarray(EASY_EMPTY, { minLength: EASY_EMPTY.length });
  const metaKind = fc.constantFrom<Meta["type"]>("pause", "resume", "hidden", "visible");

  it("phases sum to active time, stalls are the longest gaps, and singles suffice for the easy sample", () => {
    fc.assert(
      fc.property(
        order,
        fc.array(fc.integer({ min: 0, max: 120_000 }), { minLength: 51, maxLength: 51 }),
        fc.array(fc.option(metaKind, { freq: 4 }), { minLength: 51, maxLength: 51 }),
        (cells, waits, metas) => {
          const s = easy();
          cells.forEach((cell, i) => {
            const m = metas[i];
            if (m) s.meta({ type: m } as Meta);
            s.wait(waits[i]!).place(cell, EASY_SOLUTION[cell]!);
          });
          s.wait(1_000).meta({ type: "submit", result: "solved" });
          const record = s.record();
          const before = JSON.stringify(record);
          const r = analyzeSolve(record);
          expect(JSON.stringify(record)).toBe(before);

          expect(r.solved).toBe(true);
          const [p1, p2, p3] = r.time.phases;
          expect(p1 + p2 + p3).toBe(r.time.activeMs);
          expect(Math.min(p1, p2, p3)).toBeGreaterThanOrEqual(0);
          expect(r.time.activeMs).toBe(activeMs(record, s.now));
          expect(r.time.activeMs + r.time.pausedMs).toBe(s.now - T0);

          const gaps = record.nodes.map((n, i) => n.elapsed - (i === 0 ? 0 : record.nodes[i - 1]!.elapsed));
          const top = [...gaps].sort((x, y) => y - x).slice(0, STALL_COUNT);
          expect(r.stalls.map((x) => x.durationMs)).toEqual(top);

          expect(r.needs).toHaveLength(51);
          for (const n of r.needs) expect(techniqueInfo(n.technique).level).toBe("easy");
          expect(JSON.parse(JSON.stringify(r))).toEqual(r);
        },
      ),
      { numRuns: 20 },
    );
  });

  // Extra correct values are not proven to keep medium techniques sufficient (unlike singles), so
  // the seed is fixed: this guards attribution of every placement, not a theorem about tiers.
  it("attributes every placement and stays within the puzzle's graded level", () => {
    const solution = parseGrid(MEDIUM.solution);
    const empty = [...MEDIUM.puzzle].flatMap((ch, i) => (ch === "." ? [i] : []));
    fc.assert(
      fc.property(fc.shuffledSubarray(empty, { minLength: empty.length }), (cells) => {
        const s = new Script(MEDIUM.puzzle, MEDIUM.solution, "medium");
        for (const cell of cells) s.wait(1_000).place(cell, solution[cell]!);
        const r = analyzeSolve(s.record());
        expect(r.needs).toHaveLength(empty.length);
        expect(LEVELS.indexOf(techniqueInfo(r.hardest!.technique).level)).toBeLessThanOrEqual(LEVELS.indexOf("medium"));
      }),
      { numRuns: 10, seed: 7 },
    );
  });
});
