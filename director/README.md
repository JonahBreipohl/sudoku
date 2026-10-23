# Director

An unattended Claude Code session (the Director) runs on a schedule, picks ready tasks from
`tasks.json`, hands each to a subagent, verifies and merges the result, and records cost in
`ledger.jsonl`. The full procedure is the Director prompt in `../Starting Prompt.txt`; this file
documents the data it works with.

## Files

| File | Written by | Purpose |
|---|---|---|
| `config.json` | you | Trunk, budgets, size priors, routing, limits. The Director never edits it. |
| `tasks.json` | Director | Backlog: milestones and tasks (schema below). |
| `ledger.jsonl` | Director | One JSON row per dispatched attempt; drives cost estimates. |
| `QUESTIONS.md` | Director asks, you answer | Decisions the Director cannot make. Blocked tasks point here. |
| `RUNLOG.md` | Director | Append-only log, one entry per run. |
| `STATUS.md` | Director | Rewritten each run: progress, next tasks, spend, projection. |
| `ENVIRONMENT.md` | Director | What works on this machine (e2e, usage tooling) and tooling repairs. |

Usage and cost come from `node scripts/usage.mjs` (see the header comment in that file).

## Task schema

```json
{
  "id": "T012",
  "title": "short imperative title",
  "milestone": 1,
  "priority": 1,
  "agent": "feature-dev | engine-dev",
  "model": "haiku | sonnet | opus | fable",
  "effort": "low | medium | high | xhigh",
  "size": "S | M",
  "deps": ["T010"],
  "files": ["globs this task is expected to touch, used to decide what can run in parallel"],
  "acceptance": ["checkable criteria"],
  "status": "todo | in_progress | resume | done | blocked | split",
  "blocked_by": "Q3 (when blocked)",
  "split_into": ["T012a", "T012b"],
  "attempts": 0,
  "notes": "handoffs, failure notes, follow-up context"
}
```

Priority: 1 is highest. Sizes: S is roughly one focused change (under ~300 lines), M is a
feature with several files. There is no L; split it.

## Ledger row

```json
{"run_id":"20261023-0300","task_id":"T010","attempt":1,"agent":"engine-dev","model":"sonnet",
 "effort":"medium","size":"S","need_usd":2.0,"actual_usd":0.84,"review_usd":0,"overhead_usd":0.31,
 "tokens":412000,"minutes":9,"outcome":"pass|partial|fail","measured_by":"transcripts|estimate"}
```

Rows without a task (an early exit, for example) use `"task_id": null` and only `overhead_usd`.

## Agents

Defined in `.claude/agents/`: `feature-dev`, `engine-dev`, `reviewer`. The Director sets the model
per dispatch; the files set the role, tools and rules.

## Answering questions

Write your answer under the question in `QUESTIONS.md` (keep the `Answer:` line). The next run
unblocks the tasks that point at it.
