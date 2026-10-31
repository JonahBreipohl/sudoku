# Questions

The Director adds questions here and marks dependent tasks `blocked`. Write your answer under
`Answer:`; the next run picks it up. Answered questions stay for the record.

## Q1: Hosting (blocks M10-09)

A GitHub Pages workflow is ready in `.github/workflows/deploy-pages.yml` but disabled (`if: false`,
manual trigger only). Options: enable GitHub Pages for this repo (the repo must allow Pages, and
the site will be public at `https://jonahbreipohl.github.io/sudoku/`), use another host, or don't
deploy.

Answer:will switch to local environent later and connect to one of my existing websites

Update 2026-10-31 (owner, via Claude session): hosting on Cloudflare Pages with Git integration
on the owner's domain. The owner connects the repo in the Cloudflare dashboard; the repo side is
done (public/_headers, host config excluded from precache, README "Deploy (Cloudflare)"). Keep
the GitHub Pages workflow disabled. M10-09 is done once the owner confirms the site is live.

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

Answer: i set it to 10 and 40

## Q4: Review volume (non-blocking)

The Director's rules review every opus task and every change under src/engine/ or src/state/,
which is 43 of 80 tasks, plus every third other task: about 56 reviews, roughly $56 of the ~$183
projected total. If you want to cut that, one option is to review opus tasks and engine changes
only, and state changes every third task.

Answer: yes

## Q5: Daily puzzle level rotation (non-blocking, default chosen)

Default: Mon Easy, Tue Medium, Wed Medium, Thu Hard, Fri Hard, Sat Expert, Sun Master
(docs/ARCHITECTURE.md). Say if you want a different rotation or a fixed level.

Answer: i like that idea, go for it. see if it is possible to make it auto generate levels or at least a way to keep playing once you finish the level.

## Director note (run 20261024-0915)

- Q1: noted; M10-09 stays blocked until you pick a host (the Pages workflow stays disabled).
- Q2: you asked for a $10 run budget. The Director may not edit config.json, so please set `run_budget_usd` to 10 yourself. Until then M-size opus tasks are split into S tasks when reached.
- Q3 (clarified): no input needed beyond optionally lowering `weekly_budget_usd` ($40 now) if your plan's weekly window is smaller. Spend so far is about $14 API-equivalent.
- Q5: the daily-level rotation is accepted. Your note was cut off after "a way to keep playin..."; please re-send the end of that sentence (auto-generate / keep playing after the daily puzzle?).

## Q6: Hint key (non-blocking)

M5-06: the spec lists h as move-left (vim) and H as hint. Implemented plain h = move left, Shift+H = hint (documented in the shortcuts dialog; hint is a no-op until M7). Say if you want a different hint key.

Answer:

## Q6: Unshallow before the divergence check (non-blocking)

The repeated "trunk diverged" stops were a shallow-clone artifact (director/ENVIRONMENT.md,
Tooling repairs). Proposal for Starting Prompt.txt step 1: before checking for divergence, if
`git rev-parse --is-shallow-repository` prints true, run `git fetch --unshallow origin`. Until
this is changed, runs that see "unrelated histories" should do that by hand under the existing
tooling-repair rule.

Answer: Yes. Done 2026-10-28: scripts/sync-trunk.sh now always unshallows first, and Starting Prompt.txt step 1 runs it and defines divergence by the merge base.
