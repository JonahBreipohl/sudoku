# Run log

## setup 2026-10-22

Founding session (not a Director run). Rebuilt the first vanilla scaffold to the founding spec:
React + Vite + strict TypeScript walking skeleton (board with a hardcoded puzzle, click/tap and
arrow selection, keyboard and pad entry, conflicts, theme toggle; engine parse/validate with
fast-check tests), docs/PLAN.md and docs/ARCHITECTURE.md, 80-task backlog for M1-M10, five
subagents, director files, usage tooling with fixture tests, statusline snapshot script, project
permissions, CI and a disabled Pages workflow. Clean install, check, build and e2e green.
No tasks dispatched; ledger empty.

Next up: M1-01 seeded PRNG, then M1-02 fast solver and M1-04 candidate state.

## run 20261023-0903 (first cloud run)

~12 minutes. Trunk green at start (29 tests). Tasks:
- M1-01 sonnet S pass: need 1.20, actual 0.17 (+0.11 review).
- M1-02 opus S pass: need 2.40, actual 1.23 (+0.30 review). Reviewer flagged timing-test flakiness.
- M1-02a haiku S pass (new follow-up): actual 0.01 (+0.05 review).
- M1-04 sonnet S pass: need 1.20, actual 0.19 (+0.12 review). Follow-up M1-04a added.
Not started: M1-03 (opus S): 2 x 1.2 prior + overhead + review exceeded the remaining budget (~$2.7).
Spend this run about $2.80 of $6. usage.mjs worked in the cloud and reported subagents separately. e2e not run (no UI changes); not yet verified in cloud.
Next up: M1-03, M1-04a, then M2.
