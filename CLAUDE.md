# Browser Sudoku

A single-page Sudoku game that runs entirely in the browser: generated puzzles with graded
difficulty, notes, undo/redo, hints, and saved progress. No backend. Product plan: docs/PLAN.md.

Work is coordinated by an unattended Director (see director/README.md). Most sessions are a
subagent working one task from director/tasks.json on a branch `task/<id>`.

## Stack and commands

Vite + TypeScript (strict) + Vitest. No UI framework: plain DOM modules.

- `npm install` once; `npm run dev` to play locally.
- `npm run check`: typecheck and unit tests (and lint once T002 lands). Must pass before you report.
- `npm run build`: production build to dist/. Must pass before you report.
- `npm run e2e`: Playwright end-to-end tests, once T001 lands.
- Keep output quiet when running checks; read failures, not passing output.

## Layout

- `src/engine/`: pure Sudoku logic (board, validation, solver, grader, generator, hints).
  No DOM, no state, no randomness except through the seedable PRNG. Every export has unit tests.
- `src/state/`: game state as a pure reducer plus a tiny store; persistence, history, timer.
  May import engine, never ui.
- `src/ui/`: DOM rendering and input. May import state and engine.
- `e2e/`: Playwright specs.
- `director/`, `scripts/usage.mjs`, `.claude/agents/`: automation. Task agents do not edit these
  unless the task says so.

## Conventions

- Unit tests sit next to the code as `*.test.ts`.
- Grids are 81-element arrays, index = row * 9 + col, 0 = empty.
- Prefer small pure functions; no new runtime dependencies without saying why in the report.
- Colors are CSS custom properties on `:root`; layout must work at 360px width.
- Match the style of surrounding code. Comments explain why, not what.

## Definition of done (for a task)

1. Every acceptance criterion in the task is met, and you can point to the code or test for each.
2. `npm run check` and `npm run build` pass, plus `npm run e2e` when the task touches e2e/ or
   changes UI behavior after e2e exists.
3. Work is committed on the task branch `task/<id>` with clear messages. Do not merge, push to
   main, or rewrite history.
4. Nothing outside the task's scope: if you find something else worth doing, report it as a
   follow-up instead of doing it.
5. You finish with the closing report below.

## Closing report

End your final message with exactly one fenced JSON block:

```json
{
  "task_id": "T012",
  "outcome": "pass | partial | fail",
  "branch": "task/T012",
  "commits": ["<sha> <subject>"],
  "acceptance": [{"criterion": "...", "met": true, "evidence": "file:line or test name"}],
  "checks": {"check": "pass|fail", "build": "pass|fail", "e2e": "pass|fail|not-run"},
  "handoff": "for partial: what is done, what remains, where to start. Otherwise empty.",
  "followups": [{"title": "...", "why": "...", "files": ["..."]}],
  "notes": "decisions made, risks, new dependencies"
}
```

`partial` means you stopped at a clean, committed point with a handoff; `fail` means the approach
did not work, with the reason in notes.
