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

## run 20261024-0054 (cloud)

~15 minutes. Trunk green at start (63 tests). Six tasks, all passed and reviewed (max tasks reached):
- M1-03 opus S: need 2.40, actual 0.61 (+0.05 review).
- M1-05 sonnet S: need 1.20, actual 0.22 (+0.05 review).
- M1-04a haiku S: need 0.10, actual 0.01 (+0.04 review).
- M1-06 sonnet S: need 1.20, actual 0.11 (+0.03 review). Reviewer minor: round-trip property accepts multiple-solutions.
- M2-01 opus S: need 2.40, actual 0.69 (+0.04 review).
- M2-02 opus S: need 1.20 (prior), actual 0.40 (+0.04 review).
Spend this run about $2.93 of $6. M1 complete. e2e not run (no UI changes). Nothing escalated.
Next up: M2-03 and the remaining M2 techniques; M3-01, M3-03, M4-01 are also ready.

## run 20261024-0332 (cloud)

~20 minutes. Trunk green at start (130 tests). Six tasks, all passed first attempt (max tasks reached):
- M2-03 opus S: need 1.0, actual 0.63 (+0.17 review).
- M2-04 opus S: need 1.0, actual 0.78 (+0.17 review).
- M2-05 opus S: need 1.0, actual 0.51 (+0.17 review). Reviewer minor -> new M2-05a.
- M3-03 sonnet S: need 0.3, actual 0.21 (not reviewed; web worker, no state/engine). e2e run: 18 passed.
- M2-05a haiku S: actual 0.01 (+0.12 review).
- M2-06 opus S: need 1.0, actual 0.74 (+0.13 review).
Spend this run about $4.5 of $6. Nothing escalated. Ledger overhead figures are approximate (interleaved Director turns).
Next up: M2-07, M2-08, M2-11, M3-01, M4-01.

## run 20261024-0915 (cloud)

~25 minutes. Trunk green at start (172 tests). Four tasks, all passed first attempt and reviewed:
- M2-07 opus S: need 1.0, actual 0.90 (+0.15 review).
- M2-08 opus S: need 1.0, actual 0.79 (+0.15 review). Added optional Step.groups.
- M2-11 opus S: need 1.0, actual 0.51 (+0.13 review).
- M3-01 opus S: need 1.0, actual 0.38 (+0.12 review).
Spend this run about $3.8 of $6 (Director ~0.6). Stopped with ~1.7 left to keep a safe wrap-up margin. Config budget still $6 (you asked for $10; see QUESTIONS.md).
Next up: M4-01, M2-12/M2-09 (M, to split), M3-02 after M2-13.

## run 20261025-0157 (cloud)

~10 minutes. Trunk green at start (207 tests). Config budget now $10. Five tasks, all passed first attempt:
- M4-01 sonnet S: need 2.4 (prior x2), actual 0.23 (+0.17 review). Reviewer minors -> M4-01a.
- M4-01a haiku S: actual 0.01 (not reviewed).
- M4-02 sonnet S: actual 0.16 (+0.19 review). Minors -> M4-02a.
- M4-03 sonnet S: actual 0.11 (not reviewed; state review rotated per Q4).
- M4-04 sonnet S: actual 0.20 (+0.28 review). e2e 18 passed. Minors -> M4-04a. Subagent's first hand-back said only "pending"; verified the branch myself.
Spend this run about $2.3 of $10. Stopped to wrap up with budget left (cautious; 5 of 6 tasks).
Next up: M4-02a, M4-04a, M4-05, M4-06, M5-01.
