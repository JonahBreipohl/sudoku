import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fromGrid } from "./candidates";
import { generateUnique } from "./generate";
import { grade, type Graded } from "./grade";
import { emptyGrid, parseGrid, serializeGrid } from "./grid";
import { solveLogically } from "./human/driver";
import { createRegistry } from "./human/registry";
import { LEVELS, TECHNIQUES, applyStep, techniqueInfo, type Level, type TechniqueId } from "./step";

interface Reference {
  puzzle: string;
  solution: string;
  level: Level;
  hardest: TechniqueId;
}

// Found by grading generateUnique(seed) for seeds 1..6000; the seed is noted for each. Hard is
// rare from unbiased generation (about 1 in 2000), which is why its seeds are large.
const REFERENCE: Reference[] = [
  // seed 1
  { level: "easy", hardest: "hidden-single",
    puzzle: "3....41..8.19......5.....3...42.9...62.4.3.18...7.89...3.....9......25.4..61....3",
    solution: "367524189841937625952681437784219356629453718513768942435876291178392564296145873" },
  // seed 7
  { level: "easy", hardest: "hidden-single",
    puzzle: ".1.....5.....2..4..6...57.9.78..43......5......32..46.2.71...8..3..7.....4.....9.",
    solution: "719463852385729146462815739178694325624351978953287461297146583536978214841532697" },
  // seed 2
  { level: "medium", hardest: "pointing",
    puzzle: ".5.4..8......6....6....5.42..9..1.85...2.4...71.6..9..82.7....1....8......7..3.2.",
    solution: "351427869274869513698135742469371285583294176712658934825746391136982457947513628" },
  // seed 5
  { level: "medium", hardest: "hidden-pair",
    puzzle: "........3.427...8...5.8.1...98.376..6.......7..759.81...6.1.7...7...529.5........",
    solution: "781259463342761589965384172198437625654128937237596814426913758873645291519872346" },
  // seed 1070
  { level: "hard", hardest: "hidden-triple",
    puzzle: ".69.8..1......17....1.72....82...96..9.....4..73...85....32.5....76......2..4.69.",
    solution: "769483215234561789851972436182754963596238147473196852618329574947615328325847691" },
  // seed 1088
  { level: "hard", hardest: "naked-triple",
    puzzle: "...8..59.3.......7..8.67.2...92....6....4....1....54...5.61.8..9.......5.42..3...",
    solution: "617824593324159687598367124479281356235746918186935472753612849961478235842593761" },
  // seed 49
  { level: "expert", hardest: "simple-coloring",
    puzzle: ".........3.48......5..2.74...7..6.54..81.52..59.4..6...79.4..1......15.6.........",
    solution: "786954123324817965951623748217396854468175239593482671679548312842731596135269487" },
  // seed 73
  { level: "expert", hardest: "xy-wing",
    puzzle: "..3.49...4.1......6.8.1...5...5..941...1.7...152..8...2...7.8.9......3.4...23.5..",
    solution: "523749186491856732678312495867523941349167258152498673235674819716985324984231567" },
  // seed 19
  { level: "master", hardest: "unique-rectangle",
    puzzle: "3.5..68...8...5....12.4.3.....2......23...76......4.....1.3.59....4...7...91..2.8",
    solution: "375916842684325917912748356196273485423581769857694123761832594238459671549167238" },
  // seed 21
  { level: "master", hardest: "xy-chain",
    puzzle: "2..6...7...9...86.....25..95.1.4..2...........2..6.7.33..15.....68...5...9...3..6",
    solution: "283694175459317862617825349531749628976238451824561793342156987168972534795483216" },
];

const levelRank = (level: Level): number => LEVELS.indexOf(level);

/** Every invariant a successful grade must satisfy against its own puzzle and solution. */
function expectConsistent(puzzle: string, solution: string, g: Graded): void {
  // Score is exactly the summed weights of the path.
  const sum = g.steps.reduce((s, step) => s + techniqueInfo(step.technique).weight, 0);
  expect(g.score).toBe(sum);
  // Level is the hardest tier on the path, and hardest is a technique of that tier.
  const top = Math.max(...g.steps.map((s) => levelRank(techniqueInfo(s.technique).level)));
  expect(levelRank(g.level)).toBe(top);
  expect(g.hardest).not.toBeNull();
  expect(techniqueInfo(g.hardest!).level).toBe(g.level);
  // The path replays to the solution.
  const end = g.steps.reduce(applyStep, fromGrid(parseGrid(puzzle)));
  expect(serializeGrid(end.values)).toBe(serializeGrid(parseGrid(solution)));
  // The level is tight: the driver finishes at it and gets stuck one tier below.
  const state = fromGrid(parseGrid(puzzle));
  expect(solveLogically(state, g.level).solved).toBe(true);
  const below = LEVELS[levelRank(g.level) - 1];
  if (below) expect(solveLogically(state, below).solved).toBe(false);
}

describe("grade", () => {
  it("has two reference puzzles per level", () => {
    for (const level of LEVELS) expect(REFERENCE.filter((r) => r.level === level)).toHaveLength(2);
  });

  it.each(REFERENCE.map((r) => [r.level, r.hardest, r] as const))("grades a reference %s puzzle (%s)", (_l, _h, ref) => {
    const g = grade(parseGrid(ref.puzzle));
    expect(g.level).toBe(ref.level);
    if (g.level === null) return;
    expect(g.hardest).toBe(ref.hardest);
    expect(g.score).toBeGreaterThan(0);
    expectConsistent(ref.puzzle, ref.solution, g);
  });

  it("returns level null for a unique puzzle Master techniques cannot finish", () => {
    // generateUnique(4): unique, but needs more than the Master technique set.
    const g = grade(parseGrid("6.21.....8.....54..53.7.......53.4.....6.4.....1.27.......6.31..76.....9.....26.5"));
    expect(g).toMatchObject({ level: null });
    expect(Object.keys(g).sort()).toEqual(["level", "steps"]);
  });

  it("returns level null for Easter Monster and for an empty grid", () => {
    expect(grade(parseGrid("1.......2.9.4...5...6...7...5.9.3.......7.......85..4.7.....6...3...9.8...2.....1")).level).toBeNull();
    expect(grade(emptyGrid()).level).toBeNull();
  });

  it("grades a full grid as easy with score 0", () => {
    expect(grade(parseGrid(REFERENCE[0]!.solution))).toEqual({ level: "easy", score: 0, hardest: null, steps: [] });
  });

  it("does not mutate its input", () => {
    const grid = parseGrid(REFERENCE[4]!.puzzle);
    const copy = grid.slice();
    grade(grid);
    expect(grid).toEqual(copy);
  });

  it("picks the heavier technique within the top tier and honours a custom registry", () => {
    const easy = grade(parseGrid(REFERENCE[0]!.puzzle));
    if (easy.level === null) throw new Error("reference easy puzzle failed to grade");
    // Both singles appear on this path; hidden-single (1.5) outweighs naked-single (1).
    expect(new Set(easy.steps.map((s) => s.technique))).toEqual(new Set(["naked-single", "hidden-single"]));
    expect(easy.hardest).toBe("hidden-single");
    // An empty registry finds nothing, so even an easy puzzle is rejected.
    expect(grade(parseGrid(REFERENCE[0]!.puzzle), createRegistry()).level).toBeNull();
  });

  it("keeps the documented weights in TECHNIQUES ascending by tier", () => {
    // A level's cheapest technique must outweigh the previous level's cheapest, so scores
    // grow with difficulty on average. Guards accidental edits to the weight table.
    const minByLevel = LEVELS.map((l) => Math.min(...TECHNIQUES.filter((t) => t.level === l).map((t) => t.weight)));
    for (let i = 1; i < minByLevel.length; i++) expect(minByLevel[i]!).toBeGreaterThan(minByLevel[i - 1]!);
  });

  it("property: generated puzzles grade consistently or are rejected", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (seed) => {
        const { puzzle, solution } = generateUnique(seed);
        const g = grade(puzzle);
        if (g.level === null) {
          // Rejected puzzles really are beyond Master: the driver is stuck short of a solution.
          expect(solveLogically(fromGrid(puzzle), "master").solved).toBe(false);
          return;
        }
        expectConsistent(serializeGrid(puzzle), serializeGrid(solution), g);
      }),
      { numRuns: 40 },
    );
  });
});
