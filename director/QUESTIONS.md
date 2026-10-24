# Questions

The Director adds questions here and marks dependent tasks `blocked`. Write your answer under
`Answer:`; the next run picks it up. Answered questions stay for the record.

## Q1: Hosting (blocks M10-09)

A GitHub Pages workflow is ready in `.github/workflows/deploy-pages.yml` but disabled (`if: false`,
manual trigger only). Options: enable GitHub Pages for this repo (the repo must allow Pages, and
the site will be public at `https://jonahbreipohl.github.io/sudoku/`), use another host, or don't
deploy.

Answer:will switch to local environent later and connect to one of my existing websites

## Q2: Four opus M tasks can't fit a $6 run at the priors (non-blocking)

M2-09 (chains + X-chains), M2-12 (unique rectangles), M3-02 (generate into a band) and M7-04
(mistake diagnosis) need 2 x $4.00 = $8 at the priors, more than one run allows ($6 minus the $0.50
reserve). By the Director's rules it will split each into S tasks when it reaches them. If you'd
rather keep them whole, raise `run_budget_usd` to at least $10. Once real ledger samples exist the
estimate may drop and they may fit anyway.

Answer:increase to 10 dollars, goal is to max out 5 hour usage but to avoid running out of usage mid work

## Q3: Budgets: $6 per run, $40 per week (non-blocking)

Earlier in this session we agreed $7 per run and $30 per week for the Pro plan; the founding spec's
defaults ($6 and $40) are now in `config.json`. $40 per week of API-equivalent usage may be more than
a Pro plan's weekly window allows; the plan-usage ceilings stop the Director at 85% of the 7-day
window either way, if the status-line signal is enabled (director/README.md). Change
`weekly_budget_usd` if you want it lower.

Answer: please clarify what input is needed from me, dont understand question

## Q4: Review volume (non-blocking)

The Director's rules review every opus task and every change under src/engine/ or src/state/,
which is 43 of 80 tasks, plus every third other task: about 56 reviews, roughly $56 of the ~$183
projected total. If you want to cut that, one option is to review opus tasks and engine changes
only, and state changes every third task.

Answer: yes

## Q5: Daily puzzle level rotation (non-blocking, default chosen)

Default: Mon Easy, Tue Medium, Wed Medium, Thu Hard, Fri Hard, Sat Expert, Sun Master
(docs/ARCHITECTURE.md). Say if you want a different rotation or a fixed level.

Answer: i like that idea, go for it. see if ot is possible to ahe an auto generate or at least a way to keep playin

## Director note (run 20261024-0915)

- Q1: noted; M10-09 stays blocked until you pick a host (the Pages workflow stays disabled).
- Q2: you asked for a $10 run budget. The Director may not edit config.json, so please set `run_budget_usd` to 10 yourself. Until then M-size opus tasks are split into S tasks when reached.
- Q3 (clarified): no input needed beyond optionally lowering `weekly_budget_usd` ($40 now) if your plan's weekly window is smaller. Spend so far is about $14 API-equivalent.
- Q5: the daily-level rotation is accepted. Your note was cut off after "a way to keep playin..."; please re-send the end of that sentence (auto-generate / keep playing after the daily puzzle?).
