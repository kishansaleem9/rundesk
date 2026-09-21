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

# Was the PREVIOUS patch a web one? If so its bundle is still on disk, and an
# API-only patch that follows would run against it — so every later check would
# be measuring the last web patch's breakage rather than its own.
WEB_DIRTY=no
for b in "$@"; do
  SRC="/tmp/claude-0/breaks/$b.py"
  [ -f "$SRC" ] || { echo "== $b MISSING" >> "$OUT"; continue; }
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
  [ "$NEEDS_API" = yes ] && { pnpm -C apps/api exec tsc -p tsconfig.build.json > "/tmp/claude-0/wt$LANE-api.log" 2>&1 || OK=no; }
  # Rebuild the bundle when this patch touches web, AND when the previous one
  # did — otherwise this patch runs against the previous patch's breakage.
  if [ "$NEEDS_WEB" = yes ] || [ "$WEB_DIRTY" = yes ]; then
    pnpm -C apps/web exec vite build > "/tmp/claude-0/wt$LANE-web.log" 2>&1 || OK=no
  fi
  WEB_DIRTY="$NEEDS_WEB"

  if [ "$OK" = yes ]; then
    [ "$NEEDS_API" = yes ] && restart
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
