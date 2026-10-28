#!/bin/bash
# Trunk sync: fetch main and fast-forward it when the checkout is on a clean main.
# Run by the SessionStart hook and by the Director at run start (Starting Prompt.txt, step 1).
#
# Cloud containers start with a shallow clone. After a fetch, shallow history hides the merge base,
# so main and origin/main look unrelated ("refusing to merge unrelated histories", or ahead/behind
# counts with no merge base) even when main is merely behind. Unshallowing up front costs about a
# second for this repo, so do it every time instead of waiting for a failure.

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0

if [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = "true" ]; then
  git fetch --unshallow origin || exit $?
fi
scripts/retry-unshallow.sh git fetch origin main || exit $?

[ "$(git symbolic-ref --short -q HEAD)" = "main" ] || exit 0
git diff --quiet && git diff --cached --quiet || exit 0

scripts/retry-unshallow.sh git merge --ff-only origin/main
