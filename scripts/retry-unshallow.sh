#!/bin/bash
# Run a command; if it fails and the repo is a shallow clone, unshallow and retry once.
#
# Why: cloud containers start with a shallow clone, so after `git fetch` the local history and
# origin/main look unrelated and `git merge --ff-only` fails ("refusing to merge unrelated
# histories"). Any other failure, or a full-history repo, fails normally with the original exit code.
#
# Usage: scripts/retry-unshallow.sh <command> [args...]

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <command> [args...]" >&2
  exit 2
fi

"$@"
status=$?
[ "$status" -eq 0 ] && exit 0

if [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" != "true" ]; then
  exit "$status"
fi

echo "retry-unshallow: '$*' failed (exit $status) and this is a shallow clone; running git fetch --unshallow, then retrying once." >&2
if ! git fetch --unshallow origin; then
  echo "retry-unshallow: git fetch --unshallow failed; giving up." >&2
  exit "$status"
fi

"$@"
