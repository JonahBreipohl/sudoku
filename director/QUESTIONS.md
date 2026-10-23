# Questions

The Director adds questions here and marks dependent tasks `blocked`. Answer under `Answer:`;
the next run picks it up. Answered questions stay for the record.

## Q1: Where should the game be hosted? (blocks T043)

Options: GitHub Pages from this repo via a GitHub Actions workflow (simple, free; the repo must
allow Pages), Netlify/Vercel/Cloudflare Pages (needs an account and a token as a repo secret),
or no hosting (drop T043).

Answer:

## Q2: Confirm the budgets in config.json (non-blocking)

Setup proposed run_budget_usd 15 and weekly_budget_usd 75.

Answer: (2026-10-22) Use smaller amounts so each run finishes cleanly within Pro usage limits
(5-hour and weekly windows). Now run_budget_usd 7, weekly_budget_usd 30, wrapup_reserve_usd 0.5,
max_tasks_per_run 3, max_run_minutes 90. All M tasks were split into S tasks. Dollar figures are
API-equivalent usage measured from transcripts, not charges: the account is on a Pro
subscription with no API key.
