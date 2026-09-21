#!/bin/bash
# Break-test a suite inside an isolated git worktree.
#
#   wt-break.sh <lane 2|3|4> <suite> <patch> [<patch> ...]
#
# Lane N uses worktree /tmp/claude-0/wtN, database rundesk_v<N> and port 302N.
# The worktree is a detached checkout with node_modules symlinked in, so three
# of these run at once without patches colliding — which is the whole reason
# break testing was stuck behind everything else.
#
# The patch scripts hardcode /home/user/rundesk, so each is rewritten into the
# worktree path before it runs. The tree the agents are working in is never
# touched.
set -u
LANE="$1"; shift
SUITE="$1"; shift
WT="/tmp/claude-0/wt$LANE"
PORT=$((3020 + LANE))
OUT="/tmp/claude-0/break-$SUITE.txt"
# NOT truncated here. It used to be, above the lock — so a run that was refused
# for interleaving destroyed the previous run's results on its way out, and a
# real 5/6 became a one-line refusal. Truncation happens after the lock is held.
TSX="/home/user/rundesk/node_modules/.pnpm/tsx@4.21.0/node_modules/tsx"
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
export E2E_EMAIL=admin@rundesk.internal
export E2E_PASSWORD='Admin@123!'
# Some suites stage state directly in Postgres (a column with no endpoint that
# writes it). Without this they refuse to run — correctly — and every break
# patch then "fails" for the same irrelevant reason.
export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/rundesk_v$LANE"

restart() {
  # KILL BY PORT, NOT BY ENV VAR.
  #
  # This was `pkill -f "PORTMARK=$LANE "`, and `pkill -f` matches the COMMAND
  # LINE while `PORTMARK` is an environment variable — so it never matched
  # anything. The old, unpatched API kept the port, the new one failed to bind,
  # and every API-side break patch reported its suite still passing. Web
  # patches reddened because the browser reads a freshly built bundle; API
  # patches did not, because the server under test was never replaced. The
  # pattern in the results is what gave it away.
  local pids
  pids=$(lsof -t -i ":$PORT" -sTCP:LISTEN 2>/dev/null | sort -u)
  [ -n "$pids" ] && kill $pids 2>/dev/null
  for i in $(seq 1 20); do
    curl -s --noproxy '*' -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/api/v1/health" || break
    sleep 1
  done
  if curl -s --noproxy '*' -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/api/v1/health"; then
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null
    sleep 2
  fi
  (
    cd "$WT/apps/api"
    export PORT="$PORT" PORTMARK="$LANE"
    export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/rundesk_v$LANE"
    export JWT_ACCESS_SECRET=ci-access-secret-min-32-chars-aaaaaaaaaaaa
    export JWT_REFRESH_SECRET=ci-refresh-secret-min-32-chars-bbbbbbbbbb
    nohup node --require "$TSX/dist/preflight.cjs" \
      --import "file://$TSX/dist/loader.mjs" \
      dist/apps/api/src/main.js > "/tmp/claude-0/api-v$LANE.log" 2>&1 &
  )
  for i in $(seq 1 40); do
    curl -s --noproxy '*' -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/api/v1/health" && return 0
    sleep 2
  done
  return 1
}

cd "$WT" || exit 1
# A lock, because two runs sharing one worktree check out, patch and build over
# each other and every result is then about whichever run wrote last. That
# happened once and produced a set of "passes" that meant nothing.
LOCK="/tmp/claude-0/wt$LANE.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "lane $LANE is already break-testing — refusing to interleave" >&2
  exit 3
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT
# Only now that the lane is ours. A refusal must not touch the results of the
# run that legitimately holds it.
: > "$OUT"

# ── THE WORKTREE HAS TO BE AT HEAD, AND THE SUITE HAS TO BE GREEN WITHOUT A
#    PATCH, OR EVERYTHING BELOW IS UNREADABLE. ──────────────────────────────
#
# This cost a whole suite's evidence before it was written. The worktrees are
# DETACHED checkouts made once and never moved, so they drift behind the branch
# as agents land work. `list-card-cover` was run here against a tree two commits
# old: four of its checks failed on EVERY patch, including patches that touch
# nothing near them, and the same four failed on the unpatched tree. With four
# checks already red you cannot tell what any patch reddened — the whole run
# says nothing, and it says it in the shape of a result.
#
# Two guards, because they catch different things. Syncing to HEAD fixes drift.
# The baseline catches everything else drift is not: a suite that is genuinely
# red right now, a lane whose database is behind, a fixture another run left
# lying around. A patch that reddens a check which was ALREADY red is not
# evidence, and the baseline line at the top of the file is what lets the next
# reader see that at a glance instead of inferring it from a pattern.
REV=$(git -C /home/user/rundesk rev-parse HEAD)
if [ "$(git -C "$WT" rev-parse HEAD)" != "$REV" ]; then
  echo "== syncing $WT to $(echo "$REV" | cut -c1-8)" >> "$OUT"
  git -C "$WT" checkout -- . 2>/dev/null
  if ! git -C "$WT" checkout --detach "$REV" > /dev/null 2>&1; then
    echo "== CANNOT SYNC WORKTREE — refusing to run, results would be about the wrong tree" >> "$OUT"
    exit 4
  fi
  ( cd "$WT/packages/db"
    export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/rundesk_v$LANE"
    yes | pnpm exec drizzle-kit push --force > "/tmp/claude-0/wt$LANE-push.log" 2>&1 )
  # CHECKED, because an unchecked build is a silent one. This ran without `||`
  # and a build killed part-way — by a stray `pkill vite`, as it happens — left
  # the worktree with no `dist` at all. The next run then died inside the suite
  # on `ENOENT …/wtN/apps/web/dist/index.html`, which reads as a broken suite
  # rather than as a build that never finished. Say which it was.
  if ! pnpm -C apps/api exec tsc -p tsconfig.build.json > "/tmp/claude-0/wt$LANE-api.log" 2>&1; then
    { echo "== API BUILD FAILED in $WT — refusing, the lane would serve a stale binary"
      tail -5 "/tmp/claude-0/wt$LANE-api.log"; } >> "$OUT"
    exit 4
  fi
  if ! pnpm -C apps/web exec vite build > "/tmp/claude-0/wt$LANE-web.log" 2>&1; then
    { echo "== WEB BUILD FAILED in $WT — refusing, there would be no bundle to measure"
      tail -5 "/tmp/claude-0/wt$LANE-web.log"; } >> "$OUT"
    exit 4
  fi
  restart
fi

# A worktree that was never built, or whose build was interrupted before this
# guard existed, has no bundle and nothing above would have noticed: the sync
# block only runs when the revision differs. Build it once, here, so the
# baseline below measures a page rather than an ENOENT.
if [ ! -f "$WT/apps/web/dist/index.html" ]; then
  echo "== $WT has no bundle — building it before the baseline" >> "$OUT"
  if ! pnpm -C apps/web exec vite build > "/tmp/claude-0/wt$LANE-web.log" 2>&1; then
    { echo "== WEB BUILD FAILED in $WT"; tail -5 "/tmp/claude-0/wt$LANE-web.log"; } >> "$OUT"
    exit 4
  fi
fi

timeout 900 node "$WT/test/e2e/$SUITE.mjs" --api "$PORT" --dist "$WT/apps/web/dist" \
  > "/tmp/claude-0/brk-$SUITE-baseline.log" 2>&1
BASE=$(grep -E 'passed,' "/tmp/claude-0/brk-$SUITE-baseline.log" | tail -1 | sed 's/\x1b\[[0-9;]*m//g')
echo "== BASELINE (no patch) $BASE" >> "$OUT"
case "$BASE" in
  *' 0 failed'*) ;;
  *)
    { echo "== REFUSING TO BREAK-TEST — the unpatched suite is not green, so no patch below"
      echo "   could be told apart from what is already broken. Fix the baseline first."
      grep -E 'FAIL' "/tmp/claude-0/brk-$SUITE-baseline.log" | sed 's/\x1b\[[0-9;]*m//g' | head -6
    } >> "$OUT"
    exit 5
  ;;
esac

# Was the PREVIOUS patch a web one? If so its bundle is still on disk, and an
# API-only patch that follows would run against it — so every later check would
# be measuring the last web patch's breakage rather than its own.
#
# AND THE SAME IN THE OTHER DIRECTION, which was missing for a long time. There
# was a `WEB_DIRTY` and no `API_DIRTY`: after an API patch, `apps/api/dist`
# holds the patched build and the lane is serving it, so the next web-only
# patch sets `NEEDS_API=no`, skips the rebuild AND the restart, and runs its
# checks against the previous patch's broken server. Found by the field-types
# run, where patch 18 was an API one and every web patch after it — fourteen
# of them — measured patch 18. The symptom is a block of patches that all
# redden the same unrelated check, which reads like a real finding.
WEB_DIRTY=no
API_DIRTY=no
for b in "$@"; do
  # NAME OR PATH, both accepted.
  #
  # This used to take only the bare name, and a caller who passed the path it
  # had just written — which tab-completes, and which every other script in
  # this directory takes — got eight lines of "MISSING" for eight files that
  # were sitting right there. A whole break set reported as absent because the
  # argument was spelled the obvious way is the stale-reason defect wearing a
  # shell script: the message named a real condition and meant something else.
  b="${b##*/}"; b="${b%.py}"
  SRC="/tmp/claude-0/breaks/$b.py"
  [ -f "$SRC" ] || { echo "== $b MISSING (no /tmp/claude-0/breaks/$b.py)" >> "$OUT"; continue; }
  P="/tmp/claude-0/wt$LANE-patch.py"
  sed "s#/home/user/rundesk#$WT#g" "$SRC" > "$P"

  git -C "$WT" checkout -- . 2>/dev/null
  if ! python3 "$P" > /dev/null 2>/tmp/claude-0/wt$LANE-pf.err; then
    { echo "== $b PATCH FAILED"; tail -2 "/tmp/claude-0/wt$LANE-pf.err"; } >> "$OUT"
    continue
  fi

  CHANGED=$(git -C "$WT" diff --name-only)
  NEEDS_API=no; NEEDS_WEB=no
  # WHICH SIDE CONSUMES THE CHANGED PACKAGE, not just "it is a package".
  # `packages/*` all went to the API rebuild, so a patch to `packages/ui` —
  # which only the WEB bundle consumes — rebuilt the server and left the
  # bundle untouched. Its check stayed green with the component broken.
  case "$CHANGED" in *apps/api/*|*packages/db/*) NEEDS_API=yes ;; esac
  case "$CHANGED" in *apps/web/*|*packages/ui/*|*packages/feature-flags/*) NEEDS_WEB=yes ;; esac
  # `packages/db` is read by the web typecheck too, and `feature-flags` by both.
  case "$CHANGED" in *packages/feature-flags/*) NEEDS_API=yes ;; esac
  [ -z "$CHANGED" ] && { echo "== $b PATCH CHANGED NOTHING" >> "$OUT"; continue; }

  OK=yes
  # A SCHEMA PATCH HAS TO REACH THE DATABASE, or it proves nothing. Dropping an
  # index from `packages/db/src/schema` and rebuilding leaves the index sitting
  # in the lane's Postgres, so "the index refuses a direct insert" stayed green
  # with the index deleted from the source. The schema is pushed whenever
  # packages/** changed, which is also how a real deployment gets it.
  case "$CHANGED" in *packages/db/*)
    ( cd packages/db
      export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/rundesk_v$LANE"
      yes | pnpm exec drizzle-kit push --force > "/tmp/claude-0/wt$LANE-push.log" 2>&1 ) || OK=no
  ;; esac
  # Rebuild the API when this patch touches it, AND when the previous one did —
  # the mirror of the bundle rule below, and for the same reason.
  if [ "$NEEDS_API" = yes ] || [ "$API_DIRTY" = yes ]; then
    pnpm -C apps/api exec tsc -p tsconfig.build.json > "/tmp/claude-0/wt$LANE-api.log" 2>&1 || OK=no
  fi
  # Rebuild the bundle when this patch touches web, AND when the previous one
  # did — otherwise this patch runs against the previous patch's breakage.
  if [ "$NEEDS_WEB" = yes ] || [ "$WEB_DIRTY" = yes ]; then
    pnpm -C apps/web exec vite build > "/tmp/claude-0/wt$LANE-web.log" 2>&1 || OK=no
  fi
  WEB_DIRTY="$NEEDS_WEB"

  if [ "$OK" = yes ]; then
    # Restart when this patch touched the API, or when the previous one did and
    # the lane is therefore still serving that patch's binary.
    if [ "$NEEDS_API" = yes ] || [ "$API_DIRTY" = yes ]; then restart; fi
    API_DIRTY="$NEEDS_API"
    timeout 900 node "$WT/test/e2e/$SUITE.mjs" --api "$PORT" --dist "$WT/apps/web/dist" \
      > "/tmp/claude-0/brk-$b.log" 2>&1
    { echo "== $b"
      grep -E 'FAIL' "/tmp/claude-0/brk-$b.log" | sed 's/\x1b\[[0-9;]*m//g' | head -4
      grep -E 'passed,' "/tmp/claude-0/brk-$b.log" | tail -1 | sed 's/\x1b\[[0-9;]*m//g'
    } >> "$OUT"
  else
    { echo "== $b BUILD FAILED"; tail -3 "/tmp/claude-0/wt$LANE-api.log" "/tmp/claude-0/wt$LANE-web.log" 2>/dev/null; } >> "$OUT"
  fi
done

git -C "$WT" checkout -- . 2>/dev/null
echo "== restoring $WT" >> "$OUT"
# The lane's database may be carrying a patched schema; put it back.
( cd "$WT/packages/db"
  export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/rundesk_v$LANE"
  yes | pnpm exec drizzle-kit push --force > /dev/null 2>&1 )
pnpm -C apps/api exec tsc -p tsconfig.build.json > /dev/null 2>&1
pnpm -C apps/web exec vite build > /dev/null 2>&1
restart
echo "DONE $SUITE" >> "$OUT"
