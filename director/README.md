# Director

An unattended Claude Code session (the Director) runs on a schedule with the prompt in
`../Starting Prompt.txt`. Each run it picks ready tasks from `tasks.json`, sends each to a
subagent on the task's model, verifies and merges the result, and records usage so it never
starts a task that is unlikely to finish within budget. The budget is a share of the plan's usage
windows (default: at most 60% of any 5-hour window and 85% of the 7-day window; see "Plan-usage
budget" below). Task costs are still measured in dollars of API-equivalent usage computed from
transcripts; on a Pro or Max plan they measure usage, not charges.

## Files

| File | Owner | Purpose |
|---|---|---|
| `config.json` | you | Trunk, plan budget, size priors, prices, limits. The Director never edits it. |
| `runs.jsonl` | Director | One row per run: start, end, API-equivalent spend. Feeds the plan-usage estimate. |
| `plan-readings.jsonl` | you and Director | Plan usage percentages seen at a moment; calibrates dollars per percent. Append only. |
| `tasks.json` | Director | The backlog: milestone names and tasks (fields below). |
| `ledger.jsonl` | Director | One JSON row per task attempt: model, size, need vs actual cost, review and overhead cost, outcome. Drives estimates. |
| `QUESTIONS.md` | Director asks, you answer | Decisions the Director can't make. Answer under `Answer:`; the next run unblocks the tasks. |
| `RUNLOG.md` | Director | Append-only log, one entry per run. |
| `STATUS.md` | Director | Rewritten every run: progress, next tasks, blocked, spend, projection. |
| `ENVIRONMENT.md` | Director | What works where (e2e, usage tooling, plan-usage signal) and tooling repairs. |

Tooling: `scripts/usage.mjs` (usage and cost per transcript, model, and overall; see its header),
`scripts/plan-budget.mjs` (room left in the plan's windows; below), and
`scripts/statusline-snapshot.sh` (live plan-usage signal, below).

## Task fields

`id` ("M2-03"), `title`, `milestone` (integer 1-10), `priority` (1 highest to 3), `size` ("S"
about 30 minutes of agent work, "M" up to about 90), `model` ("haiku" | "sonnet" | "opus"; fable
only by escalation), `effort` (optional), `agent` (engine-dev | feature-dev | chore-dev | qa-e2e),
`deps` (task ids), `files` (paths likely touched; used to decide what can run in parallel),
`description`, `acceptance` (testable criteria), `status`, `attempts`, `notes` (failure notes and
handoffs). Optional: `blocked_by` (question id), `split_into` (ids), `branch`.

## Task statuses

| Status | Meaning |
|---|---|
| `todo` | Not started, or reset after a failed attempt. Ready when every dep is `done` and it isn't blocked. |
| `in_progress` | Dispatched in the current run. A run that dies leaves it here; the next run reconciles it. |
| `resume` | Partial work committed on `task/<id>` with a handoff in `notes`; picked up first next run. |
| `done` | Verified, merged into `main`, branch deleted. |
| `blocked` | Waiting on a question in `QUESTIONS.md` (see `blocked_by`), or failed on the top allowed model. |
| `split` | Too big for one run; replaced by the smaller tasks listed in `split_into`. |

## Agents (`.claude/agents/`)

| Agent | Model | Use |
|---|---|---|
| engine-dev | opus | Engine algorithms, analysis, tricky bugs; every change ships with tests. |
| feature-dev | sonnet | UI, layout, input, state wiring, persistence, workers, PWA, most features. |
| chore-dev | haiku | Copy, config, docs, small mechanical edits; reads only the files named in the task. |
| qa-e2e | sonnet | Playwright specs and flakiness. |
| reviewer | opus | Read-only review of a task branch; never edits. |

The Director passes each task's own `model` when it spawns the agent, so routing lives in
`tasks.json`; the agent files set the default, the role, and the closing JSON contract.

## Plan-usage budget

`config.json` `plan_budget` sets the limit as a percentage of the plan's windows:

| Key | Default | Meaning |
|---|---|---|
| `five_hour_pct` | 60 | Most of any 5-hour window the Director may use. |
| `seven_day_pct` | 85 | Most of the 7-day window the Director may use. |
| `usd_per_pct_prior` | 0.10 / 1.00 | Dollars of API-equivalent usage per 1% of each window, used until there are readings. A guess: 100% of a 5-hour window = $10. |
| `readings_used` | 5 | How many recent readings the calibration takes the median of. |
| `live_max_age_minutes` | 30 | How old the live snapshot may be before it is ignored. |

Before each dispatch the Director runs `node scripts/plan-budget.mjs --since <run_start>`, which
reports, per window, the percent used, the percent left, and that room in dollars. The Director
starts a task only if its estimated cost fits the smaller of the two.

How it knows the percent used:

- **Live** (local runs with the status line enabled, below): the plan's real percentages, which
  include your own usage. The 60% then caps the total, yours included.
- **Estimate** (cloud runs; Claude Code doesn't expose plan percentages there): the Director's
  own spend in the window, from `runs.jsonl` plus the current run, divided by dollars per percent.
  The 60% then caps the Director's share and leaves the rest of the window for you.

### Calibrating dollars per percent

Nobody publishes how many dollars of usage make up 1% of a plan window, so the starting value
is a guess. Readings replace it: each pairs the percent shown at a moment with what the Director
spent in that window. The median of the latest five is used. Your own usage in the same window
only makes the Director more cautious.

To add a reading after a Director run, open Settings > Usage on claude.ai (or `/usage` in a local
Claude Code session) and note the current-session and weekly percentages, then either run

```bash
node scripts/plan-budget.mjs --record --five-hour 42 --seven-day 18 --resets-at 2026-10-28T13:00:00Z
```

or append a line to `plan-readings.jsonl` and commit it:

```json
{"at": "2026-10-28T10:30:00Z", "five_hour_pct": 42, "seven_day_pct": 18, "resets_at": "2026-10-28T13:00:00Z", "source": "owner"}
```

`at` is when you looked (UTC). `resets_at` (when the 5-hour window resets) is optional but makes
the reading more precise. If you know how much a single Director run used rather than the
window's total, record that share with the run's dollars from `runs.jsonl`:
`node scripts/plan-budget.mjs --record --five-hour 3 --director-usd 0.25`
(`"director_usd": 0.25` in the JSON line). Readings taken soon after a Director run, while you've used little
yourself, are the most useful. Readings under 3% are ignored. Local runs with the live signal
record readings by themselves.

## Plan-usage signal (optional, local runs)

On Pro and Max plans Claude Code gives the status line command your current 5-hour and 7-day
usage (`rate_limits.five_hour` / `seven_day`, each with `used_percentage` and `resets_at` in Unix
seconds). `scripts/statusline-snapshot.sh` writes that to `~/.claude/plan-usage.json` and prints a
short status line. When the file is fresh, `plan-budget.mjs` uses it instead of the estimate. The
file updates whenever any interactive Claude Code session renders its status line, so it is fresh
while you or the Director are active.

To enable it, add this to your **user** settings (`~/.claude/settings.json`), using the absolute
path to this repo:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash \"C:/Users/jljro/Code Projects/Browser Sudoku/scripts/statusline-snapshot.sh\""
  }
}
```

If you already have a status line, you can call the script from it instead, passing the same
stdin. Cloud runs don't have this file; that's expected and the Director uses the estimate.
