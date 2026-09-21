#!/bin/bash
# Run one suite in one lane. `verify.sh <suite> <lane>`
# Lane k talks to the API on port 302k, backed by database rundesk_v<k>.
#
# THE WEB BUNDLE IS PER-LANE WHEN THE LANE HAS ONE. `apps/web/dist` is shared,
# and a suite only ever READS it, so sharing is fine — until somebody rebuilds.
# `vite build` empties the directory before it writes, so a run that starts
# while another agent is mid-build dies on
#
#     ENOENT: no such file or directory, open 'apps/web/dist/index.html'
#
# which happened here with three agents and this shell all rebuilding at once.
# Worse than the crash is the near miss: a run that starts just AFTER somebody
# else's build finishes is measuring their tree rather than its own, and
# reports a perfectly ordinary pass or fail about the wrong code.
#
# So build your lane its own bundle once, and every run below uses it
# automatically with no change to how this script is called:
#
#     pnpm -C apps/web exec vite build --outDir /tmp/claude-0/dist-<lane> --emptyOutDir
#
# Absent, it falls back to the shared one, which is right for a single-agent
# session where there is nothing to collide with. The chosen path is printed on
# the result line, so a run can always be traced to the bundle it measured.
set -u
cd /home/user/rundesk
SUITE="$1"; LANE="${2:-1}"
PORT=$((3020 + LANE))
DIST="/tmp/claude-0/dist-$LANE"
[ -f "$DIST/index.html" ] || DIST="apps/web/dist"
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/rundesk_v$LANE"
export E2E_EMAIL=admin@rundesk.internal
export E2E_PASSWORD='Admin@123!'
OUT="/tmp/claude-0/run-$SUITE.log"
timeout 900 node "test/e2e/$SUITE.mjs" --api "$PORT" --dist "$DIST" > "$OUT" 2>&1
code=$?
echo "== $SUITE (lane $LANE, dist $DIST) exit=$code"
grep -E 'passed,|FAIL' "$OUT" | sed 's/\x1b\[[0-9;]*m//g' | tail -8
