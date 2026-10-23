# Product plan

## Goal

A fast, pleasant Sudoku that works in any modern browser on phone and desktop, with puzzles
generated on the device. No accounts, no ads, no backend.

## Player experience

- Opens straight into a puzzle (resumes the saved one if there is one).
- Four difficulties: Easy, Medium, Hard, Expert, graded by the techniques a human needs, not by
  clue count.
- Enter digits by click/tap plus keyboard or number pad; notes (pencil marks), cleared
  automatically in peers when a digit is placed.
- Highlights for the selected row/column/box and matching digits; conflicts shown immediately;
  optional "show mistakes" against the solution.
- Undo/redo, hints that explain the next logical step, a timer, and per-difficulty stats.
- Light and dark themes; fully keyboard and screen-reader operable.

## Architecture

- `engine`: pure functions. Board model; candidate-bitmask solver with solution counting;
  technique-based grader (singles, pairs/triples, pointing, box-line, X-wing); generator that
  removes clues while keeping a unique solution and targets a grade; hint engine reusing grader
  steps.
- `state`: pure reducer over a GameState, with a minimal store, undo/redo history, localStorage
  persistence (versioned, corruption-safe), timer and stats.
- `ui`: plain DOM, re-rendering only changed cells; generation off the main thread if it is slow.

## Milestones

0. Foundation: e2e harness, lint.
1. Engine.
2. State.
3. UI: playable game.
4. Polish: accessibility, full e2e coverage, README, deploy.

## Out of scope for now

Variants (Killer, X-Sudoku), daily puzzles, online leaderboards, puzzle import, PWA install.
