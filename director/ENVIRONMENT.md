# Environment

Facts about where the Director runs. Update when something changes; log tooling repairs at the end.

## Local machine (verified 2026-10-22 at setup)

- Windows 11, Git Bash and PowerShell available. Node 24.15.0, npm 12.2.1.
- `gh` CLI is **not** installed: push with plain git; no PR automation.
- Remote: `origin` = https://github.com/JonahBreipohl/sudoku.git, trunk `main`.
- `npm run check` and `npm run build`: work.
- `npm run e2e`: **not available yet** (T001 adds Playwright). After T001 merges, the Director
  should try it once and record here whether browsers are installed and it passes.
- Usage tooling: `node scripts/usage.mjs --since <ISO>` works and reads transcripts from
  `~/.claude/projects/C--Users-jljro-Code-Projects-Browser-Sudoku*/` recursively. Subagent
  transcript layout not yet observed; the first run should confirm that a subagent shows up as
  its own file in `--compare` output and note the path pattern here.
- `~/.claude/plan-usage.json`: absent, so plan-usage ceilings are not checked.

## Cloud runs

Not yet run in the cloud. Expect no plan-usage file and possibly different transcript paths;
record what you find.

## Tooling repairs

(none yet)
