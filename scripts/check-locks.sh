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
