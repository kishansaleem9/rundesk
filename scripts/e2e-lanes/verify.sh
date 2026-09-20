#!/bin/bash
# Run one suite in one lane. `verify.sh <suite> <lane>`
# Lane k talks to the API on port 302k, backed by database rundesk_v<k>.
set -u
cd /home/user/rundesk
SUITE="$1"; LANE="${2:-1}"
PORT=$((3020 + LANE))
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/rundesk_v$LANE"
export E2E_EMAIL=admin@rundesk.internal
export E2E_PASSWORD='Admin@123!'
OUT="/tmp/claude-0/run-$SUITE.log"
timeout 900 node "test/e2e/$SUITE.mjs" --api "$PORT" --dist apps/web/dist > "$OUT" 2>&1
code=$?
echo "== $SUITE (lane $LANE) exit=$code"
grep -E 'passed,|FAIL' "$OUT" | sed 's/\x1b\[[0-9;]*m//g' | tail -8
