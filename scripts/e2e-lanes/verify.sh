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

# ── A PER-LANE BUNDLE IS ONLY AS FRESH AS ITS LAST BUILD. ────────────────────
#
# Giving each lane its own `dist` removed one hazard and introduced a quieter
# one: nothing ages it out. A full sweep was started here against `dist-1`…`-4`
# that had been built three hours and six source files earlier, so four of the
# seven lanes were reporting on a tree that no longer existed. Exactly the
# staleness the break worktrees had, in the fix written that morning to avoid
# it — a shared thing made private is still stale, it is just stale privately,
# and a private staleness is harder to notice because nothing else trips over
# it.
#
# It refuses rather than rebuilding, for the same reason `wt-break.sh` refuses:
# seven lanes each firing their own `vite build` on four cores turns one
# forgotten rebuild into a thundering herd. The rebuild is one line and the
# message carries it.
if [ -f "$DIST/index.html" ]; then
  NEWER=$(find apps/web/src packages/ui/src packages/feature-flags/src \
            -name '*.ts' -o -name '*.tsx' -o -name '*.css' 2>/dev/null \
          | xargs -r -I{} sh -c '[ {} -nt "'"$DIST"'/index.html" ] && echo {}' 2>/dev/null | head -3)
  if [ -n "$NEWER" ]; then
    echo "== $SUITE (lane $LANE) REFUSING — $DIST is older than the source it is built from"
    echo "   newer, among others:"
    echo "$NEWER" | sed 's/^/     /'
    echo "   rebuild it:  pnpm -C apps/web exec vite build --outDir $DIST --emptyOutDir"
    echo "   or all of them:  bash scripts/e2e-lanes/refresh-dists.sh \"1 2 3 4\""
    exit 6
  fi
fi

export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/rundesk_v$LANE"
export E2E_EMAIL=admin@rundesk.internal
export E2E_PASSWORD='Admin@123!'
OUT="/tmp/claude-0/run-$SUITE.log"
timeout 900 node "test/e2e/$SUITE.mjs" --api "$PORT" --dist "$DIST" > "$OUT" 2>&1
code=$?
echo "== $SUITE (lane $LANE, dist $DIST) exit=$code"
grep -E 'passed,|FAIL' "$OUT" | sed 's/\x1b\[[0-9;]*m//g' | tail -8
