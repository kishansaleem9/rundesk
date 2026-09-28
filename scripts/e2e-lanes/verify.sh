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
# READ WHOLE BEFORE IT RUNS. Bash reads a script as it goes, by offset, so an
# edit to this file while it runs shifts what the run reads next — two break
# sets died that way (`lane-scripts-read-as-they-run`). The body is one brace
# group, which bash parses entirely before running any of it, and it ends in
# `exit`, so nothing appended after it runs either.
{
set -u
cd /home/user/rundesk
SUITE="$1"; LANE="${2:-1}"
PORT=$((3020 + LANE))
# The lane helpers (`lane_schema_drift`); it defines functions and sets nothing else.
. /home/user/rundesk/scripts/e2e-lanes/lane-env.sh
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
#
# `find -newer`, NOT `xargs sh -c '[ {} -nt … ]'`. That spliced each path into
# a shell string unquoted, so `$workspaceId` in a file NAME expanded to nothing
# and the test ran against a path that does not exist: all 77 `$`-named source
# files — the list/board/calendar/Gantt route among them — were invisible to
# this refusal, the same `$` defect `log-tree.mjs` fixed for patch deps.
#
# AND THE INPUTS OUTSIDE `src`: `index.html` is Vite's entry and in Tailwind's
# content list, and the three config files and `public/` shape the bundle too.
if [ -f "$DIST/index.html" ]; then
  NEWER=$( { find apps/web/src packages/ui/src packages/feature-flags/src \
               \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) -newer "$DIST/index.html" -print
             find apps/web/index.html apps/web/vite.config.ts apps/web/tailwind.config.ts \
               apps/web/postcss.config.js apps/web/public -type f -newer "$DIST/index.html" -print
           } 2>/dev/null | head -3)
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
# `packages/feature-flags/src` too: the API requires it (13 compiled files do)
# from SOURCE under tsx, like `@rundesk/db`. And `find -newer`, for the reason
# the web scan above gives.
if [ -n "$API_BUILT" ]; then
  API_NEWER=$(find apps/api/src packages/db/src packages/feature-flags/src -name '*.ts' \
                -newer "$API_BUILT" -print 2>/dev/null | head -3)
  if [ -n "$API_NEWER" ]; then
    echo "== $SUITE (lane $LANE) REFUSING — the API build is older than the source it is built from"
    echo "   newer, among others:"
    echo "$API_NEWER" | sed 's/^/     /'
    echo "   rebuild and restart:  bash scripts/e2e-lanes/build-api.sh \"$LANE\"" ""
    exit 7
  fi
fi

# ── AND THE LANE HAS TO BE SERVING THIS TREE'S BUILD AT ALL. ─────────────────
#
# The stamp above proves THIS tree's build is fresh. It says nothing about the
# process on the lane's port. `wt-break.sh` starts each break lane's API from
# its own worktree (`/tmp/claude-0/wt<k>/apps/api`) and leaves it running when
# it finishes — at whatever commit, and after whatever patch, that run last
# built. A sweep on lanes 2–4 straight after a break plan measured those, and
# printed the result under this tree's name. Found on 23 September by asking
# the port which directory it was serving from, before the first full sweep
# of the day rather than after it.
#
# `fuser` names the pid listening on the port; its working directory says
# which tree it runs. Anything but this repository's `apps/api` is refused.
LANE_PID=$(fuser -n tcp "$PORT" 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$' | head -1)
if [ -n "$LANE_PID" ]; then
  LANE_CWD=$(readlink "/proc/$LANE_PID/cwd" 2>/dev/null)
  if [ "$LANE_CWD" != "/home/user/rundesk/apps/api" ]; then
    echo "== $SUITE (lane $LANE) REFUSING — port $PORT is served from $LANE_CWD, not this tree"
    echo "   a break worktree's API is left running when wt-break.sh finishes; put the lane back on this build:"
    echo "   bash scripts/e2e-lanes/build-api.sh \"$LANE\""
    exit 8
  fi
  # AND IT HAS TO HAVE STARTED AFTER THE BUILD IT IS MEANT TO SERVE. The stamp
  # check above clears the moment a build runs — and `build-api.sh` with no
  # lanes named builds without restarting anything, so every lane went on
  # serving the old process, and the schema it read from source when IT
  # started, while this said nothing.
  LANE_START=$(date -d "$(ps -o lstart= -p "$LANE_PID" 2>/dev/null)" +%s 2>/dev/null)
  BUILT_AT=$(stat -c %Y "$API_BUILT" 2>/dev/null)
  if [ -n "$LANE_START" ] && [ -n "$BUILT_AT" ] && [ "$LANE_START" -lt "$BUILT_AT" ]; then
    echo "== $SUITE (lane $LANE) REFUSING — the API on $PORT started at $(date -d "@$LANE_START" +%H:%M:%S), before the build at $(date -d "@$BUILT_AT" +%H:%M:%S)"
    echo "   it is still serving the previous build; restart it onto this one:"
    echo "   bash scripts/e2e-lanes/build-api.sh \"$LANE\""
    exit 7
  fi
fi

# ── AND THE LANE'S DATABASE HAS THE SCHEMA THE SOURCE SAYS. ─────────────────
#
# Lanes 2 to 4 lacked four unique indexes and a dropped default, and lanes 6 to
# 10 two migrations, and every suite run on them reported on "the product"
# (`found-25-sep/lane-databases-drift-from-the-migrations`). On 28 September
# this found lanes 6 to 10 still on 0164's old default and lanes 2 and 4 without
# two foreign keys. `lane_schema_drift` (lane-env.sh) compares the lane with the
# pristine dump plus the current schema source, and a lane that differs is
# refused, naming what differs.
if ! DRIFT=$(lane_schema_drift "rundesk_v$LANE"); then
  echo "== $SUITE (lane $LANE) REFUSING — rundesk_v$LANE does not have the schema the source says:"
  printf '%s\n' "$DRIFT" | head -8 | sed 's/^/   /'
  echo "   push the schema to it (and apply any data migration it lacks), then run again:"
  echo "   (cd packages/db && DATABASE_URL=postgres://rundesk:rundesk@127.0.0.1:5432/rundesk_v$LANE pnpm exec drizzle-kit push --force)"
  exit 9
fi

export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/rundesk_v$LANE"
export E2E_EMAIL=admin@rundesk.internal
export E2E_PASSWORD='Admin@123!'
# ONE LOG PER SUITE AND LANE. It was one per suite, so the same suite run on
# two lanes at once (a sweep beside a break baseline, or two sessions) wrote
# into one file, and each summary below read the other's lines.
OUT="/tmp/claude-0/run-$SUITE-lane$LANE.log"
timeout 900 node "test/e2e/$SUITE.mjs" --api "$PORT" --dist "$DIST" > "$OUT" 2>&1
code=$?
echo "== $SUITE (lane $LANE, dist $DIST) exit=$code"
# EVERY FAIL LINE. This printed the last eight lines, so a run with eight
# failures showed seven and its count, and the first — often the cause of the
# rest — was only in the log (found-28-sep/verify-hides-the-first-failures).
grep -E 'passed,|FAIL' "$OUT" | sed 's/\x1b\[[0-9;]*m//g'
[ "$code" -ne 0 ] && echo "   the whole run: $OUT"
# THE SUITE'S STATUS, NOT THE SUMMARY'S. This ended on the grep|sed|tail above,
# so it exited 0 for a suite that failed or crashed, and every runner that read
# its status — sweep.sh and batch.sh among them — counted a red run as green.
exit "$code"
exit
}
