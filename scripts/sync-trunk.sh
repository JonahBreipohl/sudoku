#!/bin/bash
# Session-start sync: fetch main and fast-forward it when the checkout is on a clean main.
# Runs through retry-unshallow.sh because the first fast-forward in a shallow cloud clone can fail
# with "unrelated histories"; only then is the repo unshallowed and the step retried.

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0

scripts/retry-unshallow.sh git fetch origin main || exit $?

[ "$(git symbolic-ref --short -q HEAD)" = "main" ] || exit 0
git diff --quiet && git diff --cached --quiet || exit 0

scripts/retry-unshallow.sh git merge --ff-only origin/main
