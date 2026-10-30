# Browser Sudoku

A browser Sudoku app with two modes: **Play** (focused solving with excellent input and honest
feedback, including mistake analysis) and **Display** (a calm side-monitor view with a clock, a
rendered or self-solving puzzle, and today's stats). Static site, no backend.

- Product spec and milestones: docs/PLAN.md
- Modules, data flow, event schema, analysis algorithm, technique tiers: docs/ARCHITECTURE.md
- Automation: an unattended Director dispatches backlog tasks to subagents (director/README.md).

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies (Node 22+). |
| `npx playwright install chromium` | One-time browser install for e2e. |
| `npm run dev` | Dev server. |
| `npm run check` | Lint (ESLint), typecheck (tsc), unit tests (Vitest). |
| `npm run build` | Production build to dist/. |
| `npm run e2e` | Playwright at 390x844 (touch) and 1440x900, with axe checks. Builds and serves itself. |
| `npm run gen:bank` | Pre-generate the puzzle bank into public/puzzles/ (from M3). |
| `npm run test:slow` | Slow generator suite (Hard 10-seed headroom assertion); run in CI as its own job. |
| `npx tsx scripts/sweep-attempts.ts` | Sweep generator attempt counts to check headroom (M3-02a tooling). |
| `node scripts/usage.mjs --since <ISO>` | Usage and cost from transcripts (Director tooling). |
| `node scripts/plan-budget.mjs --since <ISO>` | Room left in the plan's 5-hour and 7-day usage windows (Director tooling). |

Run checks with quiet output and read failures, not passing output.

## Folder map

```
src/engine/      pure TS Sudoku logic. No DOM, React, state or storage; randomness only via the PRNG.
src/analysis/    pure TS replay analysis (mistakes, solve stats, hints). Created in M7.
src/state/       event-sourced game store, timer, settings, persistence. Never imports ui.
src/workers/     engine worker and typed client. Created in M3.
src/ui/          React app: components/, layouts, Display mode, theme, styles.css (tokens).
e2e/             Playwright specs; import test/expect from e2e/fixtures.ts.
scripts/         generate-bank.ts, usage.mjs (+ test, fixtures), statusline-snapshot.sh.
public/puzzles/  generated puzzle bank.
director/        Director config, backlog, ledger, logs. Task agents don't edit it.
.claude/agents/  subagent definitions.
```

## Conventions

- TypeScript strict with `noUncheckedIndexedAccess`; no `any` without a comment saying why.
- Unit tests sit beside the code as `*.test.ts(x)`. Engine logic gets fast-check property tests.
- Grids are 81-element arrays, index = row * 9 + col, 0 = empty; cells read as r1c1..r9c9 in text.
- Components are function components; state lives in the store, components dispatch events.
- Colors only via the CSS custom properties in src/ui/styles.css, with light and dark values.
  Never signal by color alone (add a shape, weight, underline, or text cue).
- Layout with container queries; never scroll horizontally; touch targets at least 44px.
- No new runtime dependency without a reason in the task report.
- Comments explain why, not what. Match the surrounding style.

## Definition of done

1. Every acceptance criterion in the task is met.
2. New logic has tests (property tests for engine invariants).
3. `npm run check` and `npm run build` pass; `npm run e2e` passes when the task changes UI behavior.
4. No console errors.
5. Works at 390px and 1440px wide, in both light and dark themes.
6. Everything is reachable and operable by keyboard, with visible focus.
7. Work is committed on the task branch only; never commit to main, push, or rewrite history.
8. The agent ends with the JSON report from its agent definition.
