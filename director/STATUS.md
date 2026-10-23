# Status

_Last updated: setup, 2026-10-22. The Director rewrites this file every run._

## Progress

| Milestone | Done / total |
|---|---|
| M0 Foundation | done at setup |
| M1 Engine core | 0 / 6 |
| M2 Logical solver and grader | 0 / 14 |
| M3 Generator and puzzle bank | 0 / 5 |
| M4 Game state | 0 / 8 |
| M5 Board and input | 0 / 9 |
| M6 Layouts, theming, accessibility | 0 / 7 |
| M7 Check, Submit, mistake analysis | 0 / 11 |
| M8 Hints | 0 / 2 |
| M9 Display mode and PWA | 0 / 9 |
| M10 Stats, daily, polish, deploy | 0 / 9 |

## Next ready tasks

Only M1-01 has no unmet dependencies; these follow it.

| Task | Model | Size | Need (2x prior) |
|---|---|---|---|
| M1-01 Seeded PRNG | sonnet | S | $1.20 |
| M1-02 Fast bitmask solver | opus | S | $2.40 |
| M1-04 Candidate state | sonnet | S | $1.20 |
| M1-03 Solution counting | opus | S | $2.40 |
| M1-05 Step type and helpers | sonnet | S | $1.20 |

## Blocked

- M10-09 Enable deployment: Q1 (hosting).

## Open questions

Q1 hosting (blocking); Q2 opus M tasks vs run budget; Q3 budgets; Q4 review volume; Q5 daily rotation.

## Spend

API-equivalent usage. This run $0, 7 days $0, all time $0. No calibration samples yet.

## Projection (priors only)

| | Tasks | Prior each | Total |
|---|---|---|---|
| sonnet S | 43 | $0.60 | $25.80 |
| sonnet M | 11 | $2.00 | $22.00 |
| opus S | 19 | $1.20 | $22.80 |
| opus M | 4 | $4.00 | $16.00 |
| haiku S | 3 | $0.05 | $0.15 |
| Task work | 80 | | $86.75 |
| Director overhead | 80 x $0.50 | | $40.00 |
| Reviews | ~56 x $1.00 | | ~$56.00 |
| **Total** | | | **~$183** |

At about $5.50 of usable budget per run, that is about 33 runs; the $40 weekly cap makes it about
4.5 weeks. Expect this to change once the ledger has samples.
