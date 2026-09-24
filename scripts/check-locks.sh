#!/usr/bin/env bash
# The lane locks (`lock_take`, `lock_held`, `lock_drop` in
# scripts/e2e-lanes/lane-env.sh) carry their holder's PID, so a reaped holder
# cannot leave every waiter waiting for ever. Held to that:
#
#   free           taken, and signed with the taker's PID
#   live holder    held; not taken
#   dead holder    not held; taken, and the clearing is said out loud
#   unsigned, new  held (a lock taken this instant and not yet signed)
#   unsigned, old  not held; taken
#   absent         not held
#
# and a break run's pair (`break_locks_take`): both taken when both are free;
# refused on a busy lane without touching the suite; refused on a busy suite
# with the lane given back and the holder left alone.
#
# --mutate runs the cases against broken copies of the helpers.
#
#   bash scripts/check-locks.sh [--mutate]
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=$(mktemp -d)
sleep 300 & LIVE=$!
( exit 0 ) & DEAD=$!; wait "$DEAD" 2>/dev/null
trap 'kill "$LIVE" 2>/dev/null; rm -rf "$TMP"' EXIT

cases () {
  local env="$1" bad=0 d out
  fail () { echo "  $1"; bad=$((bad + 1)); }
  # Each case in its own shell, so `$$` is that shell and nothing leaks.
  d="$TMP/free"; rm -rf "$d"
  out=$(bash -c ". '$env'; lock_take '$d' && echo \$\$") || fail 'free: not taken'
  [ -n "$out" ] && [ "$(cat "$d/pid" 2>/dev/null)" = "$out" ] || fail "free: signed '$(cat "$d/pid" 2>/dev/null)', taker was '$out'"

  d="$TMP/live"; rm -rf "$d"; mkdir "$d"; echo "$LIVE" > "$d/pid"
  bash -c ". '$env'; lock_held '$d'" || fail 'live holder: not held'
  bash -c ". '$env'; lock_take '$d'" 2>/dev/null && fail 'live holder: taken from under it'

  d="$TMP/dead"; rm -rf "$d"; mkdir "$d"; echo "$DEAD" > "$d/pid"
  bash -c ". '$env'; lock_held '$d'" && fail 'dead holder: still held'
  out=$(bash -c ". '$env'; lock_take '$d' && echo taken" 2>&1)
  case "$out" in *"stale lock"*taken*) ;; *) fail "dead holder: '$out'";; esac

  d="$TMP/young"; rm -rf "$d"; mkdir "$d"
  bash -c ". '$env'; lock_held '$d'" || fail 'unsigned, new: not held'

  d="$TMP/old"; rm -rf "$d"; mkdir "$d"; touch -d '5 minutes ago' "$d"
  bash -c ". '$env'; lock_held '$d'" && fail 'unsigned, old: still held'
  bash -c ". '$env'; lock_take '$d'" 2>/dev/null || fail 'unsigned, old: not taken'

  bash -c ". '$env'; lock_held '$TMP/absent'" && fail 'absent: held'

  # A break run's pair: its lane and its suite (`break_locks_take`).
  local B="$TMP/break" rc
  rm -rf "$B"; mkdir -p "$B"
  BREAK_LOCK_DIR="$B" bash -c ". '$env'; break_locks_take 7 s" 2>/dev/null; rc=$?
  [ "$rc" = 0 ] && [ -d "$B/wt7.lock" ] && [ -d "$B/break-s.lock" ] || fail "pair, both free: returned $rc, lane $( [ -d "$B/wt7.lock" ] && echo held || echo free ), suite $( [ -d "$B/break-s.lock" ] && echo held || echo free )"
  BREAK_LOCK_DIR="$B" bash -c ". '$env'; break_locks_drop 7 s"
  [ -d "$B/wt7.lock" ] || [ -d "$B/break-s.lock" ] && fail 'pair: a drop left a lock behind'

  rm -rf "$B"; mkdir -p "$B/wt7.lock"; echo "$LIVE" > "$B/wt7.lock/pid"
  BREAK_LOCK_DIR="$B" bash -c ". '$env'; break_locks_take 7 s" 2>/dev/null; rc=$?
  [ "$rc" = 3 ] && [ ! -d "$B/break-s.lock" ] || fail "pair, lane busy: returned $rc, suite $( [ -d "$B/break-s.lock" ] && echo 'taken anyway' || echo free )"

  # The suite busy on another lane: refused, and THIS lane given back, or it
  # would sit locked with nothing running on it.
  rm -rf "$B"; mkdir -p "$B/break-s.lock"; echo "$LIVE" > "$B/break-s.lock/pid"
  out=$(BREAK_LOCK_DIR="$B" bash -c ". '$env'; break_locks_take 8 s" 2>&1); rc=$?
  [ "$rc" = 3 ] && [ ! -d "$B/wt8.lock" ] || fail "pair, suite busy: returned $rc, lane 8 $( [ -d "$B/wt8.lock" ] && echo 'LEFT HELD' || echo free )"
  case "$out" in *"s is already being break-tested"*) ;; *) fail "pair, suite busy: said '$out'";; esac
  [ "$(cat "$B/break-s.lock/pid" 2>/dev/null)" = "$LIVE" ] || fail 'pair, suite busy: the holder lost its lock'
  return $bad
}

if cases "$REPO/scripts/e2e-lanes/lane-env.sh"; then
  echo "ok locks: a live holder keeps its lock, a dead or unsigned-and-old one is taken"
else
  echo "not ok locks"; exit 1
fi
[ "${1:-}" = --mutate ] || exit 0

MUTANTS=(
  # The old lock: a directory is held whoever made it and whether they live.
  's/^  kill -0 "\$pid" 2>\/dev\/null$/  true/'
  # An unsigned lock held for ever — the old behaviour for every lock on disk.
  's/^    \[ "\$age" -lt "\$\{LOCK_UNSIGNED_GRACE:-60\}" \]$/    true/'
  # Taken but not signed: the next waiter cannot tell it from a dead one.
  '0,/^    echo "\$\$" > "\$dir\/pid"$/s//    :/'
  # Never cleared: a stale lock is waited on for ever.
  's/^  lock_held "\$dir" && return 1$/  return 1/'
  # The lane lock alone, as it was: a second set of one suite runs beside the first.
  's/^  if ! lock_take "\$dir\/break-\$suite.lock"; then$/  if false; then/'
  # Refused on the suite, and the lane kept: locked, with nothing running on it.
  '/refusing to share its results file/{n;s/^    lock_drop "\$dir\/wt\$lane.lock"$/    :/}'
)
caught=0
for i in "${!MUTANTS[@]}"; do
  m="$TMP/env-$i.sh"
  sed -E "${MUTANTS[$i]}" "$REPO/scripts/e2e-lanes/lane-env.sh" > "$m"
  if cmp -s "$m" "$REPO/scripts/e2e-lanes/lane-env.sh"; then
    echo "  mutation $((i + 1)) CHANGED NOTHING — its pattern no longer matches"; continue
  fi
  if cases "$m" > /dev/null; then echo "  mutation $((i + 1)) SURVIVED: ${MUTANTS[$i]}"
  else caught=$((caught + 1)); fi
done
if [ "$caught" = "${#MUTANTS[@]}" ]; then
  echo "ok $caught of ${#MUTANTS[@]} mutations of the lock helpers are caught"
else
  echo "not ok only $caught of ${#MUTANTS[@]} mutations are caught"; exit 1
fi
