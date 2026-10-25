# Architecture

Browser Sudoku is a static single-page app: React UI, a pure TypeScript engine, an event-sourced
game store, and a Web Worker for generation and analysis. No backend.

## Modules and layering

```
src/engine/     pure TS: grid, validation, PRNG, fast solver, human-style solver + techniques,
                grader, generator, puzzle codec. Imports nothing outside src/engine/.
src/analysis/   pure TS: replays game records against the solution (mistake analysis, solve
                analysis, hints). Imports engine and state *types* only.
src/state/      event-sourced game store: event types, reducer, event tree + cursor, timer
                derivation, settings, persistence adapter. Imports engine. Never imports ui.
src/workers/    engine.worker.ts (runs generator, grader, analysis, hints) + typed client.
src/ui/         React components, layouts, Display mode, theme. Imports everything above.
scripts/        generate-bank.ts (puzzle bank), usage.mjs and statusline-snapshot.sh (director).
public/puzzles/ pre-generated bank: <level>.json.
```

ESLint enforces the engine and state import rules (eslint.config.js). Add a rule for
src/analysis/ when it is created (no ui, no react).

## Data flow

```
 user input ──> ui dispatch(BoardEvent | MetaEvent) ──> GameStore.append()
                                                          │
          ┌───────────────────────────────────────────────┤
          ▼                                               ▼
  reducer(path root→cursor)                     persistence.save(record)  (after every event)
  → board, notes, conflicts                     
  timer(log) → active ms                         
          │
          ▼
  React (useSyncExternalStore) re-renders changed cells

 New game / hint / check / submit / watch ──> worker client ──> engine.worker.ts ──> engine/analysis
```

The skeleton in src/state/skeleton.ts is a plain reducer standing in for this store until M4.

## Engine

### Grid

- 81 cells, row-major (index = row * 9 + col), value 0 = empty. Coordinates in text are r1c1..r9c9.
- Candidates are 9-bit masks (bit d-1 = digit d). `UNITS` (27: rows, columns, boxes) and `PEERS`
  (20 per cell) are precomputed.
- Serialization: 81 characters, '.' for blanks on output, '.' or '0' accepted on input.

### Seeded PRNG

`random.ts`: a small, fast, well-distributed generator (sfc32 or similar) seeded from a 32-bit
integer or a string hash. All randomness in the engine goes through it so generation and tests
are reproducible.

### Fast solver

Bitmask backtracking: maintain row/column/box used-digit masks, pick the empty cell with the
fewest candidates (most-constrained first), try its candidates in order (or PRNG order when
generating). `countSolutions(grid, limit = 2)` stops at the limit; uniqueness = count of 1.

### Human-style solver

Works on a `CandidateState` (values + candidate masks). A technique is a function
`find(state) => Step | null` returning the first instance it finds, in a deterministic order.

```ts
interface Step {
  technique: TechniqueId;          // e.g. "hidden-single", "x-wing"
  placements: { cell: number; digit: Digit }[];
  eliminations: { cell: number; digit: Digit }[];
  cells: number[];                 // cells that justify the step (highlight these)
  digits: Digit[];                 // digits involved
  units?: number[];                // unit indices involved, when relevant
  groups?: number[][];             // disjoint cell groups shown in distinct styles (coloring's two colors)
  explanation: string;             // one line, e.g. "Only r3c5 in row 3 can hold 7"
}
```

The driver tries techniques from the cheapest tier up and applies the first step found, until
solved or stuck. `nextStep(state, maxTier)` is shared by the grader, hints, analysis, and the
Display-mode watch puzzle.

### Technique tiers

| Level | Adds techniques | Weight per step |
|---|---|---|
| Easy | naked single, hidden single | 1 (naked), 1.5 (hidden) |
| Medium | locked candidates: pointing, claiming; naked pair, hidden pair | 4, 4; 6, 8 |
| Hard | naked triple, hidden triple, naked quad, hidden quad | 12, 16, 20, 25 |
| Expert | X-Wing, Swordfish, XY-Wing, XYZ-Wing, simple coloring | 30, 45, 40, 50, 45 |
| Master | X-chain, XY-chain, W-Wing, unique rectangles | 60, 70, 55, 50 |

A puzzle's **level** is the tier of the hardest technique the driver needs. Its **score** is the
sum of step weights along the driver's solve path; puzzles within a level are ordered by score.
Puzzles the driver cannot finish with Master techniques are rejected (Master never requires
guessing). The weights are a starting point; M2-13 may tune them and must update this table.

### Generator

1. Random full grid: fast solver with PRNG candidate order on an empty grid.
2. Clue removal: visit cell pairs in PRNG order under 180-degree rotational symmetry; remove a
   pair if the puzzle stays unique (countSolutions = 1).
3. Grade; accept if the level matches the requested band, otherwise retry with a new seed,
   bounded by an attempt limit. Return `{puzzle, solution, level, score, seed}`.

Generation is slow for Expert and Master, so `scripts/generate-bank.ts` pre-generates a bank;
the runtime generator (in the worker) only tops up when the bank for a level is exhausted.

### Puzzle bank

`public/puzzles/<level>.json`:

```json
{ "version": 1, "level": "hard", "generated": "2026-10-22", "puzzles": [
  { "id": "h-000123", "puzzle": "81 chars", "solution": "81 chars", "score": 212, "hardest": "naked-triple" }
] }
```

Sorted by score. The daily puzzle picks from the bank by a date seed (local date, YYYY-MM-DD,
hashed), with the level rotating by weekday: Mon Easy, Tue Medium, Wed Medium, Thu Hard, Fri Hard,
Sat Expert, Sun Master.

## Game state (event-sourced)

### Game record

```ts
interface GameRecord {
  version: 1;
  id: string;
  puzzle: string;          // 81 chars
  solution: string;        // 81 chars
  level: Level;
  score: number;
  source: "bank" | "generated" | "daily" | "import";
  createdAt: number;       // epoch ms
  nodes: BoardEvent[];     // append-only tree of board events
  cursor: number;          // id of the current node, -1 = the starting position
  log: MetaEvent[];        // append-only linear log of everything else
  status: "playing" | "submitted";
}
```

### Board events (undoable; nodes of a tree)

Every board event has `id` (its index in `nodes`), `parent` (node id or -1), `at` (epoch ms), and
`elapsed` (active play ms when it happened).

| type | fields | effect |
|---|---|---|
| `place` | cell, digit, input: "keyboard" \| "pad" \| "digit-first", key? | sets value; removes digit from peers' notes |
| `erase` | cell | clears value |
| `note` | cell, digit, on | sets or clears one note |
| `auto-notes` | (none) | fills every empty cell's notes with its candidates (assist) |
| `reset` | (none) | clears all non-given values and notes (undoable) |
| `hint-reveal` | cell, digit, step | places the hinted digit (assist) |

The path is the chain from the root to `cursor`. The reducer replays the path to derive board,
notes, and conflicts; snapshots every 64 nodes keep replay fast.

- **Append** adds a child of `cursor` and moves `cursor` to it.
- **Undo** moves `cursor` to its parent. **Redo** moves to its most recently added child.
- **Rewind** (from analysis) moves `cursor` to any node. Nothing is ever deleted, so history is
  preserved and new moves start a new branch.

### Meta events (not undoable; linear log)

`start`, `pause`, `resume`, `hidden`, `visible`, `undo`, `redo`, each with `at` and no other fields.
The rest carry:

- `rewind` (to): a node id the cursor moved to; -1 is the starting position. Must be below the node count.
- `check` (mistakes): the running mistake count, a non-negative integer.
- `hint` (tier, step): tier is `nudge` | `technique` | `reveal`; step is a technique id string.
- `settings-assist` (autoCandidates): boolean, the auto-candidates setting after the change.
- `submit` (result): `solved` | `incorrect`.

### Timer

Active time is derived from the log: the clock runs from `start` and `resume`/`visible`, stops at
`pause`/`hidden`/`submit`. The current value is `elapsed at last event + (now - last running start)`.
Pause hides the grid. The UI ticks once per second with a timeout aligned to the next second.

### Persistence

A `PersistenceAdapter` interface (load, save, list, remove) with a localStorage implementation:
the current game record under a versioned key, completed records in a capped archive for stats,
and settings separately. Saves after every event (synchronously, it is small). Loading validates
version and shape; corrupt data is moved aside, never thrown.

## Analysis

All analysis runs in the worker on a `GameRecord` and the path ending at its cursor.

### Mistake analysis

1. **Replay** the path, keeping the state before each event (S0, S1, ...).
2. **Mistakes**: an event is a mistake if it places a digit that differs from the solution, or if
   it is a `note` that turns off the solution digit in an empty cell. The **root mistake** is the
   first one.
3. **Diagnosis** of a mistake e at cell c with digit d, using the state S before it, in order:
   1. *Consequence of an earlier mistake*: S already contains a wrong value W in a peer of c, and
      W holds the solution digit of c (so the truth was hidden by an earlier error).
   2. *Rule conflict already visible*: d is already placed in a peer of c.
   3. *Likely typo*: e came less than 1.5 s after the previous board event and d is adjacent to the
      solution digit on the pad's 3x3 layout or the number row of the keyboard (`input` and `key`
      are recorded on the event).
   4. *Guess*: the human solver limited to the puzzle's level finds no step at S.
   5. *Ruled out by a deduction*: run the human solver from S (level-limited) until the candidate
      (c, d) is eliminated or c is placed; report that step's technique, cells, and explanation.
4. **What was available instead**: the first step `nextStep(S, level)` returns.
5. **Cascade**: walk later events keeping a set of wrong cells (starting with the root). A later
   mistake belongs to the cascade if its diagnosis is "consequence"; a later placement belongs if
   any wrong cell is among its peers and holds the solution digit of its cell.
6. **Actions**: highlight the root cell and its justification cells; a timeline that previews the
   board at any node of the path; rewind to the root's parent and keep playing.

### Solve analysis (correct solve)

- **Time breakdown**: active time, paused time, and time per phase (thirds of placements).
- **Longest stalls**: the three largest active-time gaps between consecutive board events, with the
  step that was available at the start of each gap.
- **Hardest technique used**: for each placement, solve from the state before it until that cell
  is placed; the hardest technique on that chain is the technique that placement needed. Report
  the maximum over all placements.
- **Assists used**: counts of checks, hints by tier, auto-notes, and reveals, from the log.

### Hints

Tiered from `nextStep` at the current state: nudge (the unit or cell to look at), technique name,
reveal (the full step with cells highlighted, and the option to apply it). If the board already
contains a mistake, the nudge points to it first. Every tier is logged as an assist.

## Display mode

A separate top-level view sharing the store: a large clock and date, the current game rendered
read-only (or the watch puzzle: a bank puzzle solved by `nextStep` one step every few seconds with
the technique as a caption), and today's stats. Low CPU: no requestAnimationFrame loops; the clock
ticks with an aligned timeout; drift is a CSS transform changed every few minutes with a slow
transition; night dimming lowers brightness between 22:00 and 07:00 local time. Fullscreen and
Screen Wake Lock toggles; idle play switches to Display mode after N minutes and pauses the game.

## Layout

Container queries on the app root decide the layout: phone portrait (grid on top, pad at the
bottom in the thumb zone), phone landscape (grid plus side pad), tablet, desktop (grid plus a side
panel with timer, wall clock, controls, and move history), and Display mode for landscape and
portrait monitors. A left-handed setting mirrors the side pad and panel. The page never scrolls
horizontally. Colors are CSS custom properties on `:root` with Light, Dark, and System themes.

## Testing hooks

- `?puzzle=<81 chars>` starts that puzzle (also the share/import format).
- `?seed=<n>` makes generation and the watch puzzle deterministic.
- `?test=1` exposes `window.__sudoku` with a controllable clock (`advance(ms)`) for e2e; it is
  ignored unless the build is a test build or the flag is present.
