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
# changed-nothing patch, refused its baseline, or was measured against a tree
# that has since moved (`OLDER TREE`) or one that cannot be identified at all
# (`TREE UNKNOWN`) — so it can gate a sweep's handover rather than being read
# optimistically.
#
# A PATCH MAY DECLARE THAT A SHORT RUN IS ITS HONEST OUTCOME, with a line
#
#     # Expect: SHORT
#
# in its header, and then a SHORT from that patch does not trip the gate. One
# patch has earned it: `acc-7-no-id-returned` makes the action report success
# with no container id, so the check that reads the id reddens — the defect,
# named — and the twenty-seven checks after it ADDRESS that id and have nothing
# to be about.
#
# ONLY SHORT MAY BE DECLARED. A patch that reddens nothing, crashes, does not
# build, is not found, or leaves the tree identical is never expected: each of
# those is a patch that proves nothing, and a tool that let a header wave one
# through would be the suppression list this audit keeps deleting. The
# declaration is checked against the measured outcome, so a patch that declares
# SHORT and then reddens properly is reported as a row to look at too — its
# header is out of date.
set -uo pipefail
HERE="$(dirname "$0")"
LOGS=/tmp/claude-0
REPO="$(cd "$HERE/../.." && pwd)"
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

# AND WHETHER EACH ROW IS EVIDENCE ABOUT THE TREE AS IT IS NOW.
#
# A REFUSED baseline or a GREEN patch from an older tree is a row whose fix may
# already be in, and reading one as live is not hypothetical: `create-menu-ai`'s
# refusal named a type filter that offered ten kinds where nine were expected,
# and the suite had been corrected hours before I read it. Two of those in five
# minutes is a column, not an anecdote.
#
# `check-break-freshness.mjs --porcelain` is the one answer to that question,
# asked once here rather than re-derived per row.
declare -A CURRENT=()
while IFS=$'\t' read -r verdict suite tree; do
  [ -n "${suite:-}" ] && CURRENT["$suite"]="$tree"
done < <(node "$REPO/scripts/check-break-freshness.mjs" --porcelain 2>/dev/null)

bad=0
for f in "${files[@]}"; do
  [ -f "$f" ] || { printf '%-34s no log on this machine\n' "$(basename "$f" .txt | sed 's/^break-//')"; bad=1; continue; }
  suite=$(basename "$f" .txt | sed 's/^break-//')
  eval "$(awk -f "$HERE/classify-break-log.awk" "$f" 2>/dev/null)"
  : "${RAN:=0}" "${GREEN:=0}" "${UNBUILT:=0}" "${MISSING:=0}" "${NOCHANGE:=0}" "${SHORT:=0}" "${CRASHED:=0}" "${RED:=0}"
  base=$(grep -m1 '^== BASELINE' "$f" 2>/dev/null | sed 's/^== BASELINE (no patch) //')
  refused=$(grep -c '^== REFUSING' "$f" 2>/dev/null || true)
  note=''
  # Shorts split into the ones a patch declared and the ones it did not. A
  # declared SHORT that did NOT happen is also worth a row: the header is stale.
  declared=0
  undeclared=0
  stale_expect=0
  while read -r verdict patch; do
    [ -z "${patch:-}" ] && continue
    expects=0
    grep -qE '^#[[:space:]]*Expect:[[:space:]]*SHORT' "$REPO/test/e2e/breaks/$patch.py" 2>/dev/null && expects=1
    if [ "$verdict" = SHORT ] && [ "$expects" = 1 ]; then declared=$((declared + 1))
    elif [ "$verdict" = SHORT ];                    then undeclared=$((undeclared + 1))
    elif [ "$expects" = 1 ];                        then stale_expect=$((stale_expect + 1))
    fi
  done < <(awk -v names=1 -f "$HERE/classify-break-log.awk" "$f" 2>/dev/null | grep -vE '^RAN=')
  [ "$GREEN"        != 0 ] && note="$note  GREEN $GREEN"
  [ "$undeclared"   != 0 ] && note="$note  SHORT $undeclared"
  [ "$declared"     != 0 ] && note="$note  (short by declaration $declared)"
  [ "$stale_expect" != 0 ] && note="$note  STALE Expect: SHORT $stale_expect"
  [ "$CRASHED"  != 0 ] && note="$note  CRASHED $CRASHED"
  [ "$MISSING"  != 0 ] && note="$note  MISSING $MISSING"
  [ "$UNBUILT"  != 0 ] && note="$note  UNBUILT $UNBUILT"
  [ "$NOCHANGE" != 0 ] && note="$note  CHANGED-NOTHING $NOCHANGE"
  [ "$refused"  != 0 ] && note="$note  REFUSED"
  case "${CURRENT[$suite]:-}" in
    older)   note="$note  OLDER TREE" ;;
    unknown) note="$note  TREE UNKNOWN" ;;
  esac
  # A declaration alone is not a finding, so it does not gate.
  gating="$note"
  gating="${gating//  (short by declaration $declared)/}"
  [ -n "$(printf '%s' "$gating" | tr -d ' ')" ] && bad=1
  printf '%-34s %2d patches  %2d reddened  baseline %-28s%s\n' \
    "$suite" "$RAN" "$RED" "${base:-—}" "$note"
  if [ -n "${NAMES:-}" ] && [ -n "$note" ]; then
    # AND WHY, for the rows where "why" is one line in a file this script
    # already knows the name of. Every SHORT row cost the same three steps —
    # read the row, open `brk-<patch>.log`, find the throw — and the throw is
    # what says whether the patch cascaded honestly or a bare `.click()` ended
    # the run. Five of these were diagnosed this morning and all five turned on
    # that one line.
    while read -r verdict patch; do
      [ -z "${patch:-}" ] && continue
      printf '      %-9s %s\n' "$verdict" "$patch"
      log="$LOGS/brk-$patch.log"
      [ -f "$log" ] || continue
      sed 's/\x1b\[[0-9;]*m//g' "$log" \
        | grep -m1 -E 'threw: |^✗ [0-9]+ of [0-9]+ checks ran|FAIL ran [0-9]+ checks' \
        | sed 's/^[[:space:]]*/                  /' | cut -c1-150
    done < <(awk -v names=1 -f "$HERE/classify-break-log.awk" "$f" 2>/dev/null | grep -vE '^(RED|RAN=)')
  fi
done

echo
if [ "$bad" = 0 ]; then
  echo "[break-report] every set is all-reddened with a green baseline"
else
  echo "[break-report] some set has a patch that proves less than its number suggests — see above"
fi
exit "$bad"
