# Director

An unattended Claude Code session (the Director) runs on a schedule with the prompt in
`../Starting Prompt.txt`. Each run it picks ready tasks from `tasks.json`, sends each to a
subagent on the task's model, verifies and merges the result, and records usage so it never
starts a task that is unlikely to finish within budget. Dollar amounts are API-equivalent usage
computed from transcripts; on a Pro or Max plan they measure usage, not charges.

## Files

| File | Owner | Purpose |
|---|---|---|
| `config.json` | you | Trunk, budgets, size priors, prices, limits. The Director never edits it. |
| `tasks.json` | Director | The backlog: milestone names and tasks (fields below). |
| `ledger.jsonl` | Director | One JSON row per task attempt: model, size, need vs actual cost, review and overhead cost, outcome. Drives estimates. |
| `QUESTIONS.md` | Director asks, you answer | Decisions the Director can't make. Answer under `Answer:`; the next run unblocks the tasks. |
| `RUNLOG.md` | Director | Append-only log, one entry per run. |
| `STATUS.md` | Director | Rewritten every run: progress, next tasks, blocked, spend, projection. |
| `ENVIRONMENT.md` | Director | What works where (e2e, usage tooling, plan-usage signal) and tooling repairs. |

Tooling: `scripts/usage.mjs` (usage and cost per transcript, model, and overall; see its header)
and `scripts/statusline-snapshot.sh` (plan-usage signal, below).

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

## Plan-usage signal (optional, local runs)

On Pro and Max plans Claude Code gives the status line command your current 5-hour and 7-day
usage (`rate_limits.five_hour` / `seven_day`, each with `used_percentage` and `resets_at` in Unix
seconds). `scripts/statusline-snapshot.sh` writes that to `~/.claude/plan-usage.json` and prints a
short status line. The Director reads the file and starts no task while either window is above
the ceilings in `config.json` (80% and 85%). The file updates whenever any Claude Code session
renders its status line, so it is fresh while you or the Director are active.

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
stdin. Cloud runs don't have this file; that's expected and the Director carries on without it.
