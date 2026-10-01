#!/bin/bash
# Two sweeps at once keep two records (`found-24-sep/two-sweeps-share-one-record`).
#
#   bash scripts/e2e-lanes/sweep-selfcheck.sh [path/to/sweep.sh]
#
# Runs two sweeps of stand-in suites at the same time, in a scratch directory,
# with a stand-in for verify.sh that passes `ok-*` and fails `no-*` after a
# short wait. Each sweep's summary, and its status file, must count its own
# suites and nothing of the other's. No lane, API or browser is touched.
# READ WHOLE BEFORE IT RUNS (`lane-scripts-read-as-they-run`).
{
set -u
# Beside this script, wherever the checkout is: CI's is not /home/user/rundesk.
SWEEP="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/sweep.sh}"
T=$(mktemp -d "${TMPDIR:-/tmp}/sweep-selfcheck.XXXXXX")
cat > "$T/verify.sh" <<'STUB'
#!/bin/bash
sleep 0.$((RANDOM % 4 + 2))
echo "stand-in $1 on lane $2"
case "$1" in ok-*) exit 0 ;; *) exit 1 ;; esac
STUB
PASS=0; FAIL=0
chk () { if [ "$1" = yes ]; then PASS=$((PASS + 1)); echo "  PASS $2"; else FAIL=$((FAIL + 1)); echo "  FAIL $2 — $3"; fi; }

SWEEP_DIR="$T" SWEEP_VERIFY="$T/verify.sh" bash "$SWEEP" "1 2" ok-a1 ok-a2 ok-a3 ok-a4 ok-a5 ok-a6 > "$T/a.out" 2>&1 &
A=$!
sleep 0.3
SWEEP_DIR="$T" SWEEP_VERIFY="$T/verify.sh" bash "$SWEEP" "3" no-b1 ok-b2 no-b3 > "$T/b.out" 2>&1 &
B=$!
wait "$A"; RA=$?
wait "$B"; RB=$?

chk "$([ $RA = 0 ] && grep -q 'sweep: 6 of 6 passed' "$T/a.out" && echo yes)" \
  "the first sweep's summary counts its own six suites, all passed, though a second sweep started under it" "exit $RA: $(tr '\n' ' ' < "$T/a.out")"
chk "$([ $RB = 1 ] && grep -q 'sweep: 1 of 3 passed' "$T/b.out" && echo yes)" \
  "the second sweep's summary counts its own three, one passed" "exit $RB: $(tr '\n' ' ' < "$T/b.out")"
SA=$(grep -o 'its record is .*' "$T/a.out" | sed 's/its record is //')
SB=$(grep -o 'its record is .*' "$T/b.out" | sed 's/its record is //')
chk "$([ -n "$SA" ] && [ -n "$SB" ] && [ "$SA" != "$SB" ] && echo yes)" "each sweep names its own record" "'$SA' and '$SB'"
chk "$([ -f "$SA/sweep-status.txt" ] && [ "$(wc -l < "$SA/sweep-status.txt")" = 6 ] && ! grep -q -- '-b[0-9]' "$SA/sweep-status.txt" && echo yes)" \
  "the first's status file holds its six suites and none of the second's" "$(tr '\n' ' ' < "$SA/sweep-status.txt" 2>/dev/null)"
chk "$([ -f "$SB/sweep-status.txt" ] && [ "$(wc -l < "$SB/sweep-status.txt")" = 3 ] && ! grep -q -- '-a[0-9]' "$SB/sweep-status.txt" && echo yes)" \
  "the second's holds its three and none of the first's" "$(tr '\n' ' ' < "$SB/sweep-status.txt" 2>/dev/null)"
chk "$([ -L "$T/sweep-status.txt" ] && [ "$(readlink "$T/sweep-status.txt")" = "$SB/sweep-status.txt" ] && echo yes)" \
  "the familiar path is a link to the newest sweep's status" "$(readlink "$T/sweep-status.txt" 2>/dev/null || echo 'not a link')"

rm -rf "$T"
echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
exit
}
