#!/bin/bash
# A schema push that stopped is not read as done (`push_log_ok`, lane-env.sh;
# `found-29-sep/lane-push-errors-read-as-synced`).
#
#   bash scripts/e2e-lanes/push-log-selfcheck.sh [--mutate]
#
# drizzle-kit 0.31 exits 0 when it stops on a question no pipe answers, having
# applied nothing, and `fleet-sync.sh` said "synced". Each log below is the
# shape of a real push's: applied, nothing to change, stopped on the question,
# a database error, and no log at all. Only the first two may read as done.
# With --mutate, a `push_log_ok` that trusts the exit status (answers yes to
# everything) must be caught by the same cases.
# No database: it reads logs it writes itself, so CI's verify job runs it too.
# READ WHOLE BEFORE IT RUNS (`lane-scripts-read-as-they-run`).
{
set -u
# Beside this script, so CI's checkout (not /home/user/rundesk) reads it too.
. "$(cd "$(dirname "$0")" && pwd)/lane-env.sh"
DIR=$(mktemp -d)
trap 'rm -rf "$DIR"' EXIT
printf '%s\n' "[✓] Pulling schema from database..." "[✓] Changes applied" > "$DIR/applied.log"
printf '%s\n' "[✓] Pulling schema from database..." "[i] No changes detected" > "$DIR/unchanged.log"
printf '%s\n' "[✓] Pulling schema from database..." \
  " · You're about to add uq_flag_scope unique constraint to the table, which contains 73 items." \
  "Error: Interactive prompts require a TTY terminal (process.stdin.isTTY or process.stdout.isTTY is false)." > "$DIR/stopped.log"
printf '%s\n' "[✓] Pulling schema from database..." "Error: PostgresError: relation \"x\" does not exist" > "$DIR/failed.log"
: > "$DIR/empty.log"

run_cases () {
  local bad=0 f want got
  for f in applied:yes unchanged:yes stopped:no failed:no empty:no missing:no; do
    want=${f#*:}; f=${f%%:*}
    if push_log_ok "$DIR/$f.log"; then got=yes; else got=no; fi
    if [ "$got" = "$want" ]; then echo "  ok   $f push reads as done: $got"
    else echo "  FAIL $f push reads as done: $got, expected $want"; bad=1; fi
  done
  return $bad
}

echo "push_log_ok, on six push logs:"
if ! run_cases; then echo "push-log selfcheck FAILED"; exit 1; fi

if [ "${1:-}" = "--mutate" ]; then
  echo "mutation: a push_log_ok that trusts the exit status"
  push_log_ok () { return 0; }
  if run_cases > "$DIR/mutant.out" 2>&1; then
    echo "  FAIL the mutant was not caught — every case passed with a check that reads nothing"
    exit 1
  fi
  echo "  ok   caught: $(grep -c FAIL "$DIR/mutant.out") case(s) failed against it"
fi
echo "push-log selfcheck ok"
exit
}
