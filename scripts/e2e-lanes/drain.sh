#!/bin/bash
# Work through every remaining break-patch set, one at a time, waiting for a
# worktree that is genuinely free.
#
# THE FIRST VERSION OF THIS REPORTED EIGHT SUCCESSES HAVING RUN NOTHING. It
# claimed a lane with its own marker directory rather than the lock
# `wt-break.sh` actually uses, so it handed work to a lane that was already
# busy; `wt-break.sh` refused each one in milliseconds, and this script never
# looked at the return code. A runner that does not check whether the thing it
# ran succeeded is the facade defect, in the harness, again.
#
# Now: `wt-break.sh` owns the lock and exits 3 when it refuses; this retries
# rather than counting it done.
set -u
B=/tmp/claude-0/breaks
QUEUE=(
  "tab-title-countdown:tab-title-countdown-*.py"
  "task-cover:task-cover-*.py"
  "focus-pill:fp-*.py"
  "list-card-cover:list-card-cover-*.py"
  "task-header-status:ths-*.py"
  "task-activity-filter:taf-*.py"
  "task-field-create:tfc-*.py"
  "integration-error-card:iec-*.py"
)
for item in "${QUEUE[@]}"; do
  suite="${item%%:*}"; glob="${item#*:}"
  patches=$(cd "$B" && ls $glob 2>/dev/null | sed 's/\.py//' | tr '\n' ' ')
  [ -z "$patches" ] && { echo "SKIP $suite — no patches match $glob"; continue; }
  n_patches=$(echo $patches | wc -w)
  placed=""
  while [ -z "$placed" ]; do
    for n in 2 3 4; do
      bash /tmp/claude-0/wt-break.sh "$n" "$suite" $patches > /dev/null 2>&1
      rc=$?
      if [ "$rc" -ne 3 ]; then
        echo "✓ $suite on wt$n ($n_patches patches, rc=$rc)"
        placed=yes; break
      fi
    done
    [ -z "$placed" ] && sleep 30
  done
done
echo "DRAIN COMPLETE"
