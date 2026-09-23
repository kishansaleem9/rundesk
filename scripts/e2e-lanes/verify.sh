#!/bin/bash
# Run one suite in one lane. `verify.sh <suite> <lane>`
# Lane k talks to the API on port 302k, backed by database rundesk_v<k>.
#
# IT WAS UNCOMMITTED FOR A DAY, and `batch.sh` — which IS committed — did
# nothing but invoke it out of `/tmp`. On any other checkout that is a tool
# that appears usable and runs a file which exists nowhere in the repository.
# This engagement has already lost a container with 86 unpushed commits in it;
# the single-suite recipe should not be the next thing to go that way, and I
# spent this morning re-typing it by hand — the port, the database, the dist —
# because it was not here to read.
#
# IT EXPECTS AN API ALREADY LISTENING ON 302k. `wt-break.sh` starts one per lane
# from that lane's worktree; outside a break set, start one yourself:
#
#   cd apps/api && PORT=302k \
#     DATABASE_URL=postgres://rundesk:rundesk@127.0.0.1:5432/rundesk_v<k> \
#     JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=... node dist/apps/api/src/main.js
#
# and mind the connection budget: Postgres allows 100 and each API holds about
# ten, so eight forgotten ones is a sweep reporting "sorry, too many clients
# already" as if it were a product failure. That happened.
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
#
# DELIBERATELY CONSERVATIVE: this compares mtimes, and `git checkout`, `git
# add` and friends move an mtime without changing a byte — so it will sometimes
# refuse over a file that is identical to what the bundle was built from. That
# costs one rebuild. The opposite error costs a run that reports on code which
# no longer exists, and an afternoon working out why. Hashing every source file
# would be exact and would also read thousands of files before every suite;
# when the two errors are that asymmetric, take the cheap one.
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

# ── AND THE API IS A BUILD TOO, WHICH COST A WRONG ANSWER THE DAY THIS WENT IN.
#
# The refusal above was written for the web bundle and the API has exactly the
# same shape: `fleet-up.sh` and `fleet-restart.sh` both run
# `dist/apps/api/src/main.js`, a `tsc` output, so a lane restarted after a
# source change still serves the previous build. Unlike the bundle it is
# SHARED across every lane, so one forgotten build is wrong everywhere at once.
#
# What it looked like: `folder-dialog` reported "the row came back with null
# for a typed …" — the suite's own words for a box wired to nothing — against a
# service that had been writing the column for twenty minutes. The build was
# two days old. Nothing in the run said so, and the failure named the product.
#
# `packages/db/src` is in the scan because the schema is compiled into that
# same output: a column added to `schema/folders.ts` and not rebuilt is a
# column Drizzle will not select, which reads as a write that never happened.
#
# Same conservatism as above, and the same asymmetry behind it: an mtime moved
# by `git checkout` costs one rebuild, a stale API costs an afternoon.
#
# THE REFERENCE IS A STAMP, AND THE TWO REFERENCES TRIED BEFORE IT BOTH FAILED
# IN A WAY WORTH KEEPING WRITTEN DOWN.
#
#   · `main.js`, the obvious one, refused a build made twenty minutes earlier:
#     `tsc` rewrites it only when `main.ts` changes, so the file named after
#     the build is the one least likely to have moved.
#   · the NEWEST output anywhere in `dist`, which is what "when did this last
#     build" seems to mean — and has a deadlock in it. A `git checkout` or a
#     reverted break patch moves a source mtime without changing a byte, an
#     incremental `tsc` then writes nothing, the newest output stays put, and
#     the refusal repeats however many times you follow its own advice. That
#     happened within the hour, and a gate you cannot satisfy gets switched off.
#
# `build-api.sh` touches `dist/.built-at` after both builds succeed, which
# answers the question this check is really asking — has a build been RUN since
# the source was last touched — rather than the proxy, did it write anything.
# The fallback keeps the check working on a tree that has never used the
# wrapper; it is the version with the deadlock, so the message names the
# wrapper either way.
API_BUILT=apps/api/dist/.built-at
[ -f "$API_BUILT" ] || API_BUILT=$(find apps/api/dist -name '*.js' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
if [ -n "$API_BUILT" ]; then
  API_NEWER=$(find apps/api/src packages/db/src -name '*.ts' 2>/dev/null \
              | xargs -r -I{} sh -c '[ {} -nt "'"$API_BUILT"'" ] && echo {}' 2>/dev/null | head -3)
  if [ -n "$API_NEWER" ]; then
    echo "== $SUITE (lane $LANE) REFUSING — the API build is older than the source it is built from"
    echo "   newer, among others:"
    echo "$API_NEWER" | sed 's/^/     /'
    echo "   rebuild and restart:  bash scripts/e2e-lanes/build-api.sh \"$LANE\"" ""
    exit 7
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
# THE SUITE'S STATUS, NOT THE SUMMARY'S. This ended on the grep|sed|tail above,
# so it exited 0 for a suite that failed or crashed, and every runner that read
# its status — sweep.sh and batch.sh among them — counted a red run as green.
exit "$code"
