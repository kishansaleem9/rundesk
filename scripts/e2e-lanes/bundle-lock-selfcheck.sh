#!/bin/bash
# A lane's web bundle has one writer or any number of readers (`dist_lock_*`,
# lane-env.sh; `commit-log/log-d92d58f-1`).
#
#   bash scripts/e2e-lanes/bundle-lock-selfcheck.sh [--mutate]
#
# `verify.sh` holds the bundle shared while its suite runs, and
# `refresh-dists.sh` takes it exclusive to build. Two cases, on a throwaway
# directory standing in for `/tmp/claude-0/dist-<k>`, each timed by the order
# its steps write to a log: a build started while a run holds the bundle must
# begin only after the run ends, and a second build of the same bundle only
# after the first ends. With --mutate, lock helpers that take nothing (the
# state before this) must be caught by the same cases.
# No lane, no build, no database: CI's verify job runs it too.
# READ WHOLE BEFORE IT RUNS (`lane-scripts-read-as-they-run`).
{
set -u
# Beside this script, so CI's checkout (not /home/user/rundesk) reads it too.
. "$(cd "$(dirname "$0")" && pwd)/lane-env.sh"
DIR=$(mktemp -d)
trap 'rm -rf "$DIR"' EXIT
DIST="$DIR/dist-9"
mkdir -p "$DIST"

# Each case runs its two holders in subshells, the second started while the
# first holds the lock, and answers 0 when the second began after the first let go.
held_then () {
  local first=$1 second=$2 log=$3
  : > "$log"
  ( "$first" "$DIST" 10 || { echo "first-refused" >> "$log"; exit 1; }
    echo "first-start" >> "$log"; sleep 2; echo "first-end" >> "$log" ) &
  local a=$!
  sleep 0.5
  ( "$second" "$DIST" 10 || { echo "second-refused" >> "$log"; exit 1; }
    echo "second-start" >> "$log" ) &
  local b=$!
  wait "$a" "$b"
  [ "$(tr '\n' ' ' < "$log")" = "first-start first-end second-start " ]
}

run_cases () {
  local bad=0
  if held_then dist_lock_shared dist_lock_exclusive "$DIR/run-then-build.log"; then
    echo "  ok   a build waits for the run reading the bundle"
  else
    echo "  FAIL a build did not wait for the run: $(tr '\n' ' ' < "$DIR/run-then-build.log")"; bad=1
  fi
  if held_then dist_lock_exclusive dist_lock_exclusive "$DIR/build-then-build.log"; then
    echo "  ok   a second build of the bundle waits for the first"
  else
    echo "  FAIL a second build did not wait: $(tr '\n' ' ' < "$DIR/build-then-build.log")"; bad=1
  fi
  if held_then dist_lock_exclusive dist_lock_shared "$DIR/build-then-run.log"; then
    echo "  ok   a run waits for the build writing the bundle"
  else
    echo "  FAIL a run did not wait for the build: $(tr '\n' ' ' < "$DIR/build-then-run.log")"; bad=1
  fi
  return $bad
}

echo "dist_lock_*, on a stand-in bundle:"
if ! run_cases; then echo "bundle-lock selfcheck FAILED"; exit 1; fi

if [ "${1:-}" = "--mutate" ]; then
  echo "mutation: lock helpers that take nothing"
  dist_lock_take () { return 0; }
  if run_cases > "$DIR/mutant.out" 2>&1; then
    echo "  FAIL the mutant was not caught — every case passed with helpers that hold nothing"
    exit 1
  fi
  echo "  ok   caught: $(grep -c FAIL "$DIR/mutant.out") case(s) failed against it"
fi
echo "bundle-lock selfcheck ok"
exit
}
