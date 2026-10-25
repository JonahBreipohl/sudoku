import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { eliminate, fromGrid, place, type CandidateState } from "../candidates";
import { DIGITS, PEERS, UNITS, boxOf, cellIndex, colOf, digitBit, emptyGrid, maskDigits, parseGrid, rowOf, type CellValue, type Digit } from "../grid";
import { createRng } from "../random";
import { SAMPLE_EASY } from "../samples";
import { solve } from "../solver";
import { applyStep, cellName, type Step } from "../step";
import { nextStep, solveLogically } from "./driver";
import { createRegistry, defaultRegistry } from "./registry";
import { findUniqueRectangle } from "./unique";
import "./techniques";

const cell = (r: number, c: number) => cellIndex(r - 1, c - 1);
const sees = (a: number, b: number) => PEERS[a]!.includes(b);
const maskAt = (state: CandidateState, c: number) => (state.values[c] === 0 ? (state.candidates[c] ?? 0) : 0);
const has = (state: CandidateState, c: number, digit: Digit) => (maskAt(state, c) & digitBit(digit)) !== 0;

/** Empty-grid candidates with the listed cells cut down to exactly the given digits. */
function withMarks(marks: [number, Digit[]][]): CandidateState {
  let state: CandidateState = fromGrid(emptyGrid());
  for (const [c, keep] of marks) for (const d of DIGITS) if (!keep.includes(d)) state = eliminate(state, c, d);
  return state;
}

/** Removes a digit from every cell of a unit except the listed ones. */
function onlyIn(state: CandidateState, unit: number, digit: Digit, keep: number[]): CandidateState {
  let s = state;
  for (const c of UNITS[unit]!) if (!keep.includes(c) && has(s, c, digit)) s = eliminate(s, c, digit);
  return s;
}

function registryWithout(...ids: string[]) {
  const registry = createRegistry();
  for (const t of defaultRegistry.list()) if (!ids.includes(t.id)) registry.register(t.id, t.find);
  return registry;
}

const typeOf = (step: Step): number => Number(/^Unique rectangle type (\d):/.exec(step.explanation)?.[1]);

/** Checks the shape every UR step shares, plus the per-type conditions, against the state. */
function expectURWellFormed(state: CandidateState, step: Step): void {
  expect(step.technique).toBe("unique-rectangle");
  expect(step.placements).toEqual([]);
  expect(step.eliminations.length).toBeGreaterThan(0);
  expect(step.cells).toHaveLength(4);
  const [tl, tr, bl, br] = step.cells as [number, number, number, number];
  expect(rowOf(tl)).toBe(rowOf(tr));
  expect(rowOf(bl)).toBe(rowOf(br));
  expect(colOf(tl)).toBe(colOf(bl));
  expect(colOf(tr)).toBe(colOf(br));
  expect(new Set(step.cells.map(boxOf)).size).toBe(2);
  const [a, b] = step.digits as [Digit, Digit];
  expect(a).toBeLessThan(b);
  const pair = digitBit(a) | digitBit(b);
  for (const c of step.cells) {
    expect(state.values[c]).toBe(0);
    expect(maskAt(state, c) & pair).toBe(pair);
  }
  for (const { cell: c, digit } of step.eliminations) expect(has(state, c, digit)).toBe(true);
  // The acceptance criteria: the explanation names the four corners and the pattern digits.
  for (const c of step.cells) expect(step.explanation).toContain(cellName(c));
  expect(step.explanation).toContain(`deadly ${a}/${b} pattern`);
  expect(step.explanation).not.toMatch(/\n/);

  const exact = step.cells.filter((c) => maskAt(state, c) === pair);
  const type = typeOf(step);
  if (type === 1) {
    expect(exact).toHaveLength(3);
    const target = step.cells.find((c) => !exact.includes(c))!;
    expect(step.eliminations).toEqual([
      { cell: target, digit: a },
      { cell: target, digit: b },
    ]);
    return;
  }
  expect(exact).toHaveLength(2);
  const [floor, roof] = step.groups as [number[], [number, number]];
  expect(floor).toEqual(exact);
  const [p, q] = roof;
  expect(rowOf(p) === rowOf(q) || colOf(p) === colOf(q)).toBe(true);
  if (type === 2) {
    expect(step.digits).toHaveLength(3);
    const x = step.digits[2]!;
    expect(maskAt(state, p)).toBe(pair | digitBit(x));
    expect(maskAt(state, q)).toBe(pair | digitBit(x));
    for (const { cell: c, digit } of step.eliminations) {
      expect(digit).toBe(x);
      expect(c === p || c === q).toBe(false);
      expect(sees(c, p) && sees(c, q)).toBe(true);
    }
    return;
  }
  expect(type).toBe(4);
  expect(step.units).toHaveLength(1);
  const unit = UNITS[step.units![0]!]!;
  expect(unit.includes(p) && unit.includes(q)).toBe(true);
  const removed = step.eliminations[0]!.digit;
  const locked = removed === a ? b : a;
  expect(unit.filter((c) => has(state, c, locked)).sort((m, n) => m - n)).toEqual([p, q].sort((m, n) => m - n));
  expect(step.eliminations).toEqual([
    { cell: p, digit: removed },
    { cell: q, digit: removed },
  ]);
}

// Floor r1c1 and r1c4 (boxes 1 and 2); the roof r2c1 and r2c4 varies per type.
const FLOOR: [number, Digit[]][] = [
  [cell(1, 1), [1, 2]],
  [cell(1, 4), [1, 2]],
];

describe("unique rectangle type 1", () => {
  it("removes the pattern digits from the only corner with extras", () => {
    const state = withMarks([...FLOOR, [cell(2, 1), [1, 2]]]);
    const step = findUniqueRectangle(state)!;
    expectURWellFormed(state, step);
    expect(step.cells).toEqual([cell(1, 1), cell(1, 4), cell(2, 1), cell(2, 4)]);
    expect(step.digits).toEqual([1, 2]);
    expect(step.eliminations).toEqual([
      { cell: cell(2, 4), digit: 1 },
      { cell: cell(2, 4), digit: 2 },
    ]);
    expect(step.explanation).toBe(
      "Unique rectangle type 1: r1c1, r1c4, r2c1, r2c4 would form a deadly 1/2 pattern, so r2c4 cannot be 1 or 2",
    );
  });

  it("ignores rectangles over four boxes, with a solved corner, or already resolved", () => {
    // r1c1, r1c4, r4c1, r4c4 touch boxes 1, 2, 4 and 5: no swap keeps the boxes valid.
    expect(findUniqueRectangle(withMarks([...FLOOR, [cell(4, 1), [1, 2]]]))).toBeNull();
    const state = withMarks([...FLOOR, [cell(2, 1), [1, 2]]]);
    expect(findUniqueRectangle(place(state, cell(2, 4), 3))).toBeNull();
    let resolved = eliminate(eliminate(state, cell(2, 4), 1), cell(2, 4), 2);
    expect(findUniqueRectangle(resolved)).toBeNull();
    resolved = withMarks([...FLOOR, [cell(2, 1), [1, 2]], [cell(2, 4), [1, 3]]]);
    expect(findUniqueRectangle(resolved)).toBeNull();
  });
});

describe("unique rectangle type 2", () => {
  it("removes the shared extra digit from cells that see both roof cells", () => {
    const state = withMarks([...FLOOR, [cell(2, 1), [1, 2, 3]], [cell(2, 4), [1, 2, 3]]]);
    const step = findUniqueRectangle(state)!;
    expectURWellFormed(state, step);
    expect(step.cells).toEqual([cell(1, 1), cell(1, 4), cell(2, 1), cell(2, 4)]);
    expect(step.digits).toEqual([1, 2, 3]);
    expect(step.groups).toEqual([
      [cell(1, 1), cell(1, 4)],
      [cell(2, 1), cell(2, 4)],
    ]);
    expect(step.eliminations).toEqual([2, 3, 5, 6, 7, 8, 9].map((c) => ({ cell: cell(2, c), digit: 3 })));
    expect(step.explanation).toBe(
      "Unique rectangle type 2: r1c1, r1c4, r2c1, r2c4 would form a deadly 1/2 pattern, " +
        "so r2c1 or r2c4 is 3; remove 3 from cells that see both",
    );
  });

  it("needs the same single extra digit in both roof cells", () => {
    expect(findUniqueRectangle(withMarks([...FLOOR, [cell(2, 1), [1, 2, 3]], [cell(2, 4), [1, 2, 4]]]))).toBeNull();
    expect(findUniqueRectangle(withMarks([...FLOOR, [cell(2, 1), [1, 2, 3, 4]], [cell(2, 4), [1, 2, 3, 4]]]))).toBeNull();
    // A diagonal roof: the only cells that see both are the floor.
    const diagonal = withMarks([
      [cell(1, 1), [1, 2]],
      [cell(2, 4), [1, 2]],
      [cell(1, 4), [1, 2, 3]],
      [cell(2, 1), [1, 2, 3]],
    ]);
    expect(findUniqueRectangle(diagonal)).toBeNull();
  });
});

describe("unique rectangle type 4", () => {
  it("removes the other pattern digit from the roof when one is locked into it", () => {
    const state = onlyIn(withMarks(FLOOR), 1, 1, [cell(2, 1), cell(2, 4)]);
    const step = findUniqueRectangle(state)!;
    expectURWellFormed(state, step);
    expect(step.cells).toEqual([cell(1, 1), cell(1, 4), cell(2, 1), cell(2, 4)]);
    expect(step.digits).toEqual([1, 2]);
    expect(step.units).toEqual([1]);
    expect(step.eliminations).toEqual([
      { cell: cell(2, 1), digit: 2 },
      { cell: cell(2, 4), digit: 2 },
    ]);
    expect(step.explanation).toBe(
      "Unique rectangle type 4: r1c1, r1c4, r2c1, r2c4 would form a deadly 1/2 pattern, " +
        "and 1 in row 2 must be in r2c1 or r2c4, so neither can be 2",
    );
  });

  it("works with the higher digit locked, and with a roof sharing a box", () => {
    let state = onlyIn(withMarks(FLOOR), 1, 2, [cell(2, 1), cell(2, 4)]);
    let step = findUniqueRectangle(state)!;
    expectURWellFormed(state, step);
    expect(step.eliminations.map((e) => e.digit)).toEqual([1, 1]);

    // Vertical rectangle r1c1, r1c2, r4c1, r4c2: the roof shares row 4 and box 4; lock 2 in the box.
    state = withMarks([
      [cell(1, 1), [1, 2]],
      [cell(1, 2), [1, 2]],
    ]);
    state = onlyIn(state, 18 + 3, 2, [cell(4, 1), cell(4, 2)]);
    step = findUniqueRectangle(state)!;
    expectURWellFormed(state, step);
    expect(step.cells).toEqual([cell(1, 1), cell(1, 2), cell(4, 1), cell(4, 2)]);
    expect(step.units).toEqual([21]);
    expect(step.eliminations).toEqual([
      { cell: cell(4, 1), digit: 1 },
      { cell: cell(4, 2), digit: 1 },
    ]);
  });

  it("needs a strong link: a third holder in the unit breaks it", () => {
    expect(findUniqueRectangle(onlyIn(withMarks(FLOOR), 1, 1, [cell(2, 1), cell(2, 4), cell(2, 9)]))).toBeNull();
  });
});

// Found by searching generated (unique) puzzles: each needs a unique rectangle of the named
// type to finish at Master.
const UR_PUZZLES = [
  {
    type: 1,
    puzzle: "...34...221..9....9.4....7...178.3.9.9.....8.8.3.164...4....8.6....7..311...38...",
    solution: "768345912215897643934261578451782369692453187873916425347129856589674231126538794",
  },
  {
    type: 2,
    puzzle: "289.3...7...7.1..5.57.6.9.........91..2...5..61.........8.1.27.5..3.2...9...7.358",
    solution: "289435617463791825157268934735826491892147563614953782348519276576382149921674358",
  },
  {
    type: 4,
    puzzle: "7..9...3.2..3......8..465........12.9..8.1..5.61........576..4......2..3.7...4..8",
    solution: "746915832259387416183246597837659124924871365561423789395768241418592673672134958",
  },
];

describe("unique rectangles in known puzzles", () => {
  it.each(UR_PUZZLES)("type $type is required to solve a known puzzle", ({ type, puzzle, solution }) => {
    const state = fromGrid(parseGrid(puzzle));
    const full = solveLogically(state, "master");
    expect(full.solved).toBe(true);
    const urs = full.steps.filter((s) => s.technique === "unique-rectangle");
    expect(urs.map(typeOf)).toContain(type);
    expect(full.steps.reduce(applyStep, state).values.join("")).toBe(solution);
    expect(solveLogically(state, "master", registryWithout("unique-rectangle")).solved).toBe(false);
  });
});

describe("findUniqueRectangle", () => {
  it("returns null on an empty or solved grid and does not mutate its input", () => {
    expect(findUniqueRectangle(fromGrid(emptyGrid()))).toBeNull();
    expect(findUniqueRectangle(fromGrid(parseGrid(SAMPLE_EASY.solution)))).toBeNull();
    const state = withMarks([...FLOOR, [cell(2, 1), [1, 2]]]);
    const copy = structuredClone(state);
    findUniqueRectangle(state);
    expect(state).toEqual(copy);
  });

  it("tries type 1 before type 2 and type 2 before type 4", () => {
    // A type 1 on rows 7-8 beats a type 4 on rows 1-2, though the latter comes first in rectangle order.
    const state = onlyIn(
      withMarks([...FLOOR, [cell(7, 5), [3, 4]], [cell(7, 9), [3, 4]], [cell(8, 5), [3, 4]]]),
      1,
      1,
      [cell(2, 1), cell(2, 4)],
    );
    expect(typeOf(findUniqueRectangle(onlyIn(withMarks(FLOOR), 1, 1, [cell(2, 1), cell(2, 4)]))!)).toBe(4);
    const step = findUniqueRectangle(state)!;
    expect(typeOf(step)).toBe(1);
    expect(step.cells).toEqual([cell(7, 5), cell(7, 9), cell(8, 5), cell(8, 9)]);
  });

  it("is registered at Master with weight 50", () => {
    const ur = defaultRegistry.list("master").find((t) => t.id === "unique-rectangle");
    expect(ur).toMatchObject({ level: "master", weight: 50 });
    expect(defaultRegistry.list("expert").some((t) => t.id === "unique-rectangle")).toBe(false);
  });
});

/**
 * Completions of a candidate state, up to limit. Unique rectangles reason about the state's own
 * solution set, so the property below only uses states with exactly one completion.
 */
function countCompletions(state: CandidateState, limit = 2): number {
  const values = [...state.values];
  const masks = state.candidates.map((m, c) => (values[c] === 0 ? m : 0));
  for (let c = 0; c < 81; c++) {
    const v = values[c]!;
    if (v !== 0) for (const p of PEERS[c]!) masks[p] = masks[p]! & ~digitBit(v);
  }
  let count = 0;
  const search = (): void => {
    let best = -1;
    let bestCount = 10;
    for (let c = 0; c < 81; c++) {
      if (values[c] !== 0) continue;
      const n = maskDigits(masks[c]!).length;
      if (n < bestCount) {
        best = c;
        bestCount = n;
      }
    }
    if (best === -1) {
      count++;
      return;
    }
    for (const d of maskDigits(masks[best]!)) {
      const saved = PEERS[best]!.map((p) => masks[p]!);
      values[best] = d;
      for (const p of PEERS[best]!) masks[p] = masks[p]! & ~digitBit(d);
      search();
      values[best] = 0;
      PEERS[best]!.forEach((p, i) => (masks[p] = saved[i]!));
      if (count >= limit) return;
    }
  };
  search();
  return count;
}

/** A blanked solved grid with extra non-solution candidates removed at random, so pairs are common. */
function thinned(seed: number, holes: number, removals: number): { state: CandidateState; solution: CellValue[] } {
  const rng = createRng(`unique-${seed}`);
  const solution = solve(emptyGrid(), rng)!;
  const puzzle = [...solution];
  for (const c of rng.shuffle([...puzzle.keys()]).slice(0, holes)) puzzle[c] = 0;
  let state = fromGrid(puzzle);
  for (let i = 0; i < removals; i++) {
    const c = rng.int(81);
    const d = DIGITS[rng.int(9)]!;
    if (d !== solution[c] && has(state, c, d)) state = eliminate(state, c, d);
  }
  return { state, solution };
}

describe("properties", () => {
  it("on states with one solution, never eliminates a solution digit, at any state along a Master solve", () => {
    const fired = new Set<number>();
    let runs = 0;
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 40, max: 64 }),
        fc.integer({ min: 0, max: 300 }),
        (seed, holes, removals) => {
          const { state: start, solution } = thinned(seed, holes, removals);
          // Removing only non-solution candidates keeps a unique state unique along the solve.
          if (countCompletions(start) !== 1) return;
          runs++;
          let state = start;
          for (;;) {
            // Call the finder at every state, since cheaper steps usually win in the driver.
            const ur = findUniqueRectangle(state);
            if (ur) {
              fired.add(typeOf(ur));
              expectURWellFormed(state, ur);
              for (const { cell: c, digit } of ur.eliminations) expect(digit).not.toBe(solution[c]);
            }
            const step = nextStep(state, "master");
            if (!step) break;
            for (const { cell: c, digit } of step.eliminations) expect(digit).not.toBe(solution[c]);
            state = applyStep(state, step);
          }
        },
      ),
      { numRuns: 150 },
    );
    // Guards against a vacuous pass.
    expect(runs).toBeGreaterThan(20);
    expect(fired.size).toBeGreaterThan(0);
    // ~3s alone, which is too close to the 5s default when files run in parallel.
  }, 30_000);
});
