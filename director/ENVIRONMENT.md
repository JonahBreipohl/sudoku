# Environment

Facts about where the Director runs. Update when something changes; log tooling repairs at the end.

## Local machine (verified 2026-10-22 at setup)

- Windows 11; Git Bash and PowerShell. Node 24.15.0, npm 12.2.1. Claude Code 2.1.309.
- Remote `origin` = https://github.com/JonahBreipohl/sudoku.git, trunk `main`.
- `gh` CLI is **not installed**: push with plain git; no PR automation.
- Billing: Pro subscription, no API key. usage.mjs dollars are API-equivalent usage, not charges.
- From a clean `npm ci`: `npm run check` (lint, typecheck, 29 unit tests), `npm run build`, and
  `npm run e2e` (18 tests: phone 390x844 and desktop 1440x900, with axe) all pass.
- **e2e works here.** Playwright Chromium is installed (`npx playwright install chromium`). The
  Director should run `npm run e2e` when verifying tasks.
- npm 12 blocks dependency install scripts by default. esbuild's postinstall is blocked, but
  esbuild's platform binary comes from its optional dependency, so `tsx` (used by `gen:bank`)
  still works. If a future dependency needs its install script, run
  `npm install-scripts approve <pkg>` and record it here.
- TypeScript is pinned to `~6.0` because typescript-eslint 8.x supports `<6.1`. TypeScript 7 is
  the current `latest`; revisit when typescript-eslint supports it.

## Usage tooling (scripts/usage.mjs)

Verified on the setup session (b3030e86-...), with one web-fetch subagent.

- **Paths**: `~/.claude/projects/C--Users-jljro-Code-Projects-Browser-Sudoku/<session>.jsonl` for the
  main session; `.../<session>/subagents/agent-<agentId>.jsonl` per subagent. Worktrees would get
  directories whose name starts with the same slug; the script includes them.
- **Fields used**: `type: "assistant"`, `timestamp` (UTC ISO), `requestId`, `sessionId`, `agentId`
  and `isSidechain` (on subagent lines), `message.id`, `message.model`, and `message.usage`
  {`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`,
  `cache_creation.{ephemeral_5m_input_tokens, ephemeral_1h_input_tokens}`, `server_tool_use`, `speed`}.
- **Dedupe matters**: one API response is written as several lines (one per content block): the
  subagent file had 6 assistant lines for 2 responses.
- **Subagent usage appears**: yes, as its own file with `kind: "subagent"` and `agent_id`. Its tokens
  (60.6k) closely matched the agent's own reported total (56.3k). Main-session cache writes here
  are 1-hour TTL.
- Setup session total at the time of writing: about $7.2 API-equivalent (opus main session), $0.01
  for the haiku subagent.
- **Gaps**:
  - Fast mode (`speed: "fast"`, 2x Opus prices) isn't priced; config has no fast prices. All
    responses so far are `standard`.
  - Server tool fees (web search, $10 per 1,000) aren't priced; `server_tool_use` counts are in the
    usage block if this ever matters.
  - Legacy `isSidechain` turns inside a main file are handled (reported as `<file>#sidechain`) but
    weren't observed on this machine; the current layout uses `subagents/`.
  - Transcript paths for cloud runs are unverified.

## Plan-usage signal

`~/.claude/plan-usage.json` does not exist yet. It appears once the owner enables
`scripts/statusline-snapshot.sh` as their status line (director/README.md). Until then the
plan-usage ceilings are not checked; usage-limit errors still stop a run.

## Cloud runs

**Scheduled runs are cloud-only** (set up 2026-10-23): routine "Browser Sudoku Director (nightly)",
daily at 09:00 UTC, Director on Sonnet 5.5, in the cloud environment "Sudoku Director"
(env_01CTLjeThYEV3Axhti5jBPCq). The routine prompt tells the Director to read `Starting Prompt.txt`
from the repo, so edits to that file take effect on the next run.

What the environment provides (from the docs, not yet verified by a run):
- Ubuntu 24.04 x86_64; Node 22 on PATH (the project needs 22+); npm, git, gh. GraphQL `gh pr` /
  `gh issue` don't work through the proxy; plain git push does, including to `main`.
- Network: Custom = the default package-manager list plus cdn.playwright.dev,
  playwright.download.prss.microsoft.com, playwright.azureedge.net, archive.ubuntu.com,
  security.ubuntu.com. A blocked host returns 403 with `x-deny-reason: host_not_allowed`.
- Setup script (cached when it finishes in about 5 minutes):
  `npx -y playwright@1.64.1 install --with-deps chromium`. Keep that version in step with
  `@playwright/test` in package.json; a mismatch shows up as "browser not found" in e2e.
- No `~/.claude/plan-usage.json` (expected), so plan-usage ceilings aren't checked; usage-limit
  errors still stop a run.

**First cloud run results (2026-10-24)**: usage.mjs works in the cloud; transcripts are under `~/.claude/projects/-home-user-sudoku/<session>/` with subagents in `subagents/`, and it reports the Director and each subagent. `npm ci`, check and build work; e2e not exercised yet (no UI task). Run took ~15 minutes for six S tasks.

Original note:  whether `npm run e2e` passes (if not, mark e2e optional and say
why), where transcripts live and whether `node scripts/usage.mjs --since <run_start>` reports the
Director and subagents, and how long the run took.

## Tooling repairs

- 2026-10-26: "trunk diverged / unrelated histories" was a shallow-clone artifact, not a real
  divergence. The cloud checkout was stale and shallow, so `git fetch` brought in origin/main
  with a shallow boundary and git found no merge base. Before judging divergence, run
  `git rev-parse --is-shallow-repository`; if true, `git fetch --unshallow origin`. Then
  `git merge-base main origin/main` equals local main when it is merely behind, and
  `git merge --ff-only origin/main` works. Resetting local main (runs 0223 and 0322) was never
  needed; real divergence is only when the merge base is neither tip. Fixed on 2026-10-26: local
  main fast-forwarded 251 commits, nothing lost.
- 2026-10-25: cloud clones are shallow, which made local main look unrelated to origin/main. Added scripts/retry-unshallow.sh (runs a command; on failure in a shallow repo runs `git fetch --unshallow` and retries once) and scripts/sync-trunk.sh, run by a SessionStart hook in .claude/settings.json.
