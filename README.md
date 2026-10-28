# Browser Sudoku

A Sudoku app that runs entirely in the browser. It is a static site: no backend, no accounts,
no sync. Games and settings are saved in the browser, so a reload resumes where you left off.

The app has two modes:

- **Play** is for solving. Every puzzle has exactly one solution and comes in five levels (Easy,
  Medium, Hard, Expert, Master), each defined by the hardest technique a human solver needs.
  Input is built for keyboard and touch. When something goes wrong, mistake analysis finds the
  first move that diverged from the solution, explains what was available instead, and lets you
  rewind to just before it and keep playing.
- **Display** is for a side monitor. It shows a large clock and date, a rendered puzzle (the
  current game, or a slow self-solving "watch" puzzle with technique captions), and today's
  stats. It is calm and low-CPU: the clock ticks once a second and there are no constant
  animations.

Product context and milestones are in [docs/PLAN.md](docs/PLAN.md). Modules, data flow and the
analysis algorithm are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Playing

Select a cell, then enter a digit. Two entry modes are available:

- **Cell-first**: select a cell, then press a digit.
- **Digit-first**: lock a digit, then tap or click cells to place it. The number pad shows how
  many of each digit remain and dims finished digits.

Notes toggle with the Notes button, the N key, or Shift+digit. Placing a digit removes it from
the notes of peers in the same row, column and box. The selected cell's row, column and box are
highlighted, every cell with the same digit is marked, and conflicts are flagged. Highlights
never rely on color alone.

Check gives a non-final "on track?" with an error count. Submit is final and reports the grade
and the mistake analysis. A correct full grid is submitted automatically.

### Keyboard shortcuts

Press `?` in the app for the same list in a dialog.

| Keys | Action |
|---|---|
| Arrows, W A S D, H J K L | Move the selection |
| 1-9 | Place a digit (toggles a note in notes mode; locks the digit in digit-first mode) |
| Shift+1-9 | Toggle a note |
| 0, Backspace, Delete | Erase the cell |
| N | Toggle notes mode |
| Esc | Unlock the digit in digit-first mode, or close a dialog |
| Ctrl/Cmd+Z | Undo |
| Ctrl/Cmd+Shift+Z, Ctrl+Y | Redo |
| Shift+H | Hint (capital H; plain h moves left) |
| P | Pause or resume |
| ? | Show the shortcuts list |

Undo and redo have no limit. Reset restarts the puzzle after a confirmation, and it can itself be
undone.

### Display mode

Display is meant for a second screen or a wall display. It shows the clock, the puzzle and
today's stats, drifts slowly to avoid burn-in, and dims at night. Fullscreen and keep-screen-awake
toggles are part of the Display spec in docs/PLAN.md.

## Develop, test and build

Requires Node 22 or newer.

```sh
npm install                        # install dependencies
npx playwright install chromium    # one-time browser install for e2e tests
npm run dev                        # dev server
npm run check                      # lint (ESLint), typecheck (tsc), unit tests (Vitest)
npm run build                      # production build to dist/
npm run e2e                        # Playwright at 390x844 (touch) and 1440x900, with axe checks
npm run gen:bank                   # regenerate the puzzle bank in public/puzzles/
npm run test:slow                  # slow generator suite (Hard headroom check); run as its own CI job
```

`npm run e2e` builds and serves the app itself, so you do not need to run `build` or `dev` first.

### Layout of the code

```
src/engine/      pure Sudoku logic (solver, candidates, grading, puzzle codec)
src/analysis/    pure replay analysis: mistakes, solve stats, hints
src/state/       event-sourced game store, timer, settings, persistence
src/workers/     engine worker and its typed client
src/ui/          React app: components, layouts, Display mode, theme, styles.css
e2e/             Playwright specs
scripts/         puzzle bank generator and other tooling
public/puzzles/  generated puzzle bank
```

Grids are 81-element arrays, indexed `row * 9 + col`, with `0` for an empty cell. Engine logic
has no DOM, React or storage dependencies, and its randomness comes only from the seeded PRNG,
so tests are reproducible. Unit tests sit next to the code as `*.test.ts(x)`, and engine
invariants are covered by fast-check property tests.

Colors are defined only as custom properties in `src/ui/styles.css`, with light and dark
values. Layouts use container queries, and the app never scrolls horizontally.

## Automation

Parts of this repository are maintained by an automated Director that dispatches backlog tasks
to subagents. See [director/README.md](director/README.md) for how that works.
