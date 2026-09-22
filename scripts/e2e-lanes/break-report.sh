#!/usr/bin/env bash
# WHAT A FINISHED BREAK SET ACTUALLY SAYS, per suite, in one line each.
#
# The sweep produces one `break-<suite>.txt` per set and the interesting rows
# are the ones that are NOT a plain reddening: a patch that ran green proves
# nothing, and a patch whose run stopped early proves less than the number
# beside it suggests. Reading that out of the log by eye is how three short runs
# in `app-catalogue` and four in `list-customize` were first recorded as
# nineteen-for-nineteen and twenty-one-for-twenty-one.
#
# The classifier is `classify-break-log.awk`, shared with `break-queue.sh`, so
# the reporter and the runner cannot disagree about what a patch did.
#
#   bash scripts/e2e-lanes/break-report.sh              # every log on this machine
#   bash scripts/e2e-lanes/break-report.sh ui-sweep     # named suites only
#   NAMES=1 bash scripts/e2e-lanes/break-report.sh      # and name every non-RED patch
#
# Exit 1 if any set holds a green, short, crashed, missing, unbuilt or
# changed-nothing patch, or refused its baseline — so it can gate a sweep's
# handover rather than being read optimistically.
set -uo pipefail
HERE="$(dirname "$0")"
LOGS=/tmp/claude-0
ARCHIVE='-[0-9]{8}-[0-9]{6}\.txt$'

if [ "$#" -gt 0 ]; then
  files=()
  for s in "$@"; do files+=("$LOGS/break-$s.txt"); done
else
  # `--` because the pattern starts with a hyphen and grep reads that as an
  # option: without it this printed a usage error and an EMPTY file list, so
  # the loop never ran and the summary said every set was clean.
  mapfile -t files < <(ls -1 "$LOGS"/break-*.txt 2>/dev/null | grep -Ev -- "$ARCHIVE")
fi

bad=0
for f in "${files[@]}"; do
  [ -f "$f" ] || { printf '%-34s no log on this machine\n' "$(basename "$f" .txt | sed 's/^break-//')"; bad=1; continue; }
  suite=$(basename "$f" .txt | sed 's/^break-//')
  eval "$(awk -f "$HERE/classify-break-log.awk" "$f" 2>/dev/null)"
  : "${RAN:=0}" "${GREEN:=0}" "${UNBUILT:=0}" "${MISSING:=0}" "${NOCHANGE:=0}" "${SHORT:=0}" "${CRASHED:=0}" "${RED:=0}"
  base=$(grep -m1 '^== BASELINE' "$f" 2>/dev/null | sed 's/^== BASELINE (no patch) //')
  refused=$(grep -c '^== REFUSING' "$f" 2>/dev/null || true)
  note=''
  [ "$GREEN"    != 0 ] && note="$note  GREEN $GREEN"
  [ "$SHORT"    != 0 ] && note="$note  SHORT $SHORT"
  [ "$CRASHED"  != 0 ] && note="$note  CRASHED $CRASHED"
  [ "$MISSING"  != 0 ] && note="$note  MISSING $MISSING"
  [ "$UNBUILT"  != 0 ] && note="$note  UNBUILT $UNBUILT"
  [ "$NOCHANGE" != 0 ] && note="$note  CHANGED-NOTHING $NOCHANGE"
  [ "$refused"  != 0 ] && note="$note  REFUSED"
  [ -n "$note" ] && bad=1
  printf '%-34s %2d patches  %2d reddened  baseline %-28s%s\n' \
    "$suite" "$RAN" "$RED" "${base:-—}" "$note"
  if [ -n "${NAMES:-}" ] && [ -n "$note" ]; then
    awk -v names=1 -f "$HERE/classify-break-log.awk" "$f" 2>/dev/null | grep -vE '^(RED|RAN=)' | sed 's/^/      /'
  fi
done

echo
if [ "$bad" = 0 ]; then
  echo "[break-report] every set is all-reddened with a green baseline"
else
  echo "[break-report] some set has a patch that proves less than its number suggests — see above"
fi
exit "$bad"
