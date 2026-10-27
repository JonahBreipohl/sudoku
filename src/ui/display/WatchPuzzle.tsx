import { useEffect, useRef, useState } from "react";
import { applyStep, fromGrid, parseGrid, techniqueInfo, type CandidateState, type Level, type Step } from "../../engine";
import { validateBank } from "../../engine/bank";
import type { BankPuzzle } from "../../engine/bank";
import { getEngineClient } from "../../workers/client";
import { BoardView } from "./DisplayBoard";
import { pickWatchPuzzle } from "./watch";

interface Props {
  stepMs: number;
  seed: string | null;
  /** Timers stop while the page is hidden. */
  active: boolean;
}

interface Shown {
  state: CandidateState;
  givens: number[];
  caption: { title: string; text: string } | null;
  marked: ReadonlySet<number>;
  /** Changes with every caption so CSS restarts its fade. */
  tick: number;
}

const banks = new Map<Level, Promise<BankPuzzle[]>>();
function loadBank(level: Level): Promise<BankPuzzle[]> {
  let p = banks.get(level);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}puzzles/${level}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => (validateBank(j).ok ? (j as { puzzles: BankPuzzle[] }).puzzles : []))
      .catch(() => []);
    banks.set(level, p);
  }
  return p;
}

async function puzzleFor(seed: string, n: number): Promise<string> {
  const sizes = new Map<Level, number>();
  for (const l of ["easy", "medium", "hard"] as const) sizes.set(l, (await loadBank(l)).length);
  const { level, index } = pickWatchPuzzle(seed, n, (l) => sizes.get(l) ?? 0);
  const bank = await loadBank(level);
  const hit = bank[index];
  if (hit) return hit.puzzle;
  return (await getEngineClient().generate(level, `${seed}:${n}`)).puzzle;
}

const toNotes = (s: CandidateState) => s.candidates.map((c, i) => (s.values[i] === 0 ? c : 0));

/**
 * A bank puzzle solved by the worker's nextStep, one step per interval, with the technique as a
 * caption. Chained timeouts (no animation loop); the caption fade is pure CSS.
 */
export function WatchPuzzle({ stepMs, seed, active }: Props) {
  const [shown, setShown] = useState<Shown | null>(null);
  const run = useRef<{ n: number; state: CandidateState | null; givens: number[]; tick: number }>({
    n: 0,
    state: null,
    givens: [],
    tick: 0,
  });
  // Without ?seed= each session still gets a stable seed, so a hide/show does not reshuffle.
  const [fallbackSeed] = useState(() => `watch-${Date.now()}`);
  const sessionSeed = seed ?? fallbackSeed;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      });
    const r = run.current;
    const show = (state: CandidateState, step: Step | null, note?: string) => {
      r.tick += 1;
      setShown({
        state,
        givens: r.givens,
        caption: step ? { title: techniqueInfo(step.technique).name, text: step.explanation } : note ? { title: note, text: "" } : null,
        marked: new Set(step?.cells ?? []),
        tick: r.tick,
      });
    };

    (async () => {
      while (!cancelled) {
        if (!r.state) {
          const puzzle = await puzzleFor(sessionSeed, r.n);
          if (cancelled) return;
          const grid = parseGrid(puzzle);
          r.givens = [...grid];
          r.state = fromGrid(grid);
          show(r.state, null);
        }
        await wait(stepMs);
        if (cancelled) return;
        const step = await getEngineClient().nextStep(r.state, "master");
        if (cancelled) return;
        if (!step) {
          // Solved (or stuck): linger on the result, then move on to the next puzzle.
          const done = r.state.values.every((v) => v !== 0);
          show(r.state, null, done ? "Solved" : "No further step");
          r.state = null;
          r.n += 1;
          await wait(stepMs * 2);
          continue;
        }
        r.state = applyStep(r.state, step);
        show(r.state, step);
      }
    })().catch(() => {
      /* worker cancelled or unavailable: leave the last frame up */
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, stepMs, sessionSeed]);

  if (!shown) return <div className="watch" aria-busy="true" />;
  return (
    <div className="watch">
      <BoardView
        label="Watch puzzle, solving itself"
        board={shown.state.values}
        givens={shown.givens}
        notes={toNotes(shown.state)}
        marked={shown.marked}
      />
      <p className="watch-caption" role="status" key={shown.tick}>
        {shown.caption ? (
          <>
            <strong>{shown.caption.title}</strong> {shown.caption.text}
          </>
        ) : (
          "New puzzle"
        )}
      </p>
    </div>
  );
}
