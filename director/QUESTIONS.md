# Questions

The Director adds questions here and marks dependent tasks `blocked`. Answer under `Answer:`;
the next run picks it up. Answered questions stay for the record.

## Q1: Where should the game be hosted? (blocks T043)

Options: GitHub Pages from this repo via a GitHub Actions workflow (simple, free; the repo must
allow Pages), Netlify/Vercel/Cloudflare Pages (needs an account and a token as a repo secret),
or no hosting (drop T043).

Answer:

## Q2: Confirm the budgets in config.json (non-blocking)

Setup chose run_budget_usd 15, weekly_budget_usd 75, max 4 tasks per run, 120 minutes per run,
fable disabled. At the current priors the whole backlog is roughly $70 (about $35 of task work, $24 of
Director overhead, $12 of reviews), so about 5-6 runs. Edit config.json to change them; the Director will not.

Answer:
