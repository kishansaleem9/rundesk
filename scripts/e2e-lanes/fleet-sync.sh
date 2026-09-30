#!/bin/bash
# Bring every lane's database up to whatever `packages/db/src/schema` currently
# says, and restart the lanes so they pick up the source as it now stands.
#
# WHY THIS IS NEEDED AT ALL, because it is not obvious and it cost a confusing
# hour: the API is started from `apps/api/dist`, but the build emits
# EXTENSIONLESS imports into `packages/db/src`, so it can only run under the
# tsx loader — which compiles that schema from SOURCE at require time. So the
# running API always has the schema the working tree has, while the database
# only has what has been pushed. An agent adding a column makes every lane
# start failing with `column "x" does not exist` until this runs.
# READ WHOLE BEFORE IT RUNS. Bash reads a script as it goes, by offset, so an
# edit to this file while it runs shifts what the run reads next — two break
# sets died that way (`lane-scripts-read-as-they-run`). The body is one brace
# group, which bash parses entirely before running any of it, and it ends in
# `exit`, so nothing appended after it runs either.
{
set -u
R=/home/user/rundesk
N=${1:-4}
export PGPASSWORD=rundesk
TSX="$R/node_modules/.pnpm/tsx@4.21.0/node_modules/tsx"
# Storage, in one place — see lane-env.sh for why it is not inlined here.
. "/home/user/rundesk/scripts/e2e-lanes/lane-env.sh"

for k in $(seq 1 "$N"); do
  DB="rundesk_v$k"
  (
    cd "$R/packages/db"
    # `VAR=x yes | cmd` sets VAR for `yes`, not for `cmd`. Export it.
    export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/$DB"
    yes | pnpm exec drizzle-kit push --force > "/tmp/claude-0/push-v$k.log" 2>&1
  ) &
done
# The shared pristine database backs port 3011, which older suites still use.
(
  cd "$R/packages/db"
  export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/rundesk_pristine"
  yes | pnpm exec drizzle-kit push --force > "/tmp/claude-0/push-pristine.log" 2>&1
) &
wait

# Every push is read from its log, not its status (`push_log_ok`, lane-env.sh):
# a push that stopped on a question exits 0 having applied nothing, and this
# said "synced" (`found-29-sep/lane-push-errors-read-as-synced`). Nothing is
# restarted when one stopped: the lanes keep serving what they served.
stopped=""
for f in $(seq 1 "$N" | sed 's#.*#/tmp/claude-0/push-v&.log#') /tmp/claude-0/push-pristine.log; do
  push_log_ok "$f" || stopped="$stopped $f"
done
if [ -n "$stopped" ]; then
  for f in $stopped; do
    echo "schema push STOPPED: $f — $(grep -m1 -E '^Error|Interactive prompts require|PostgresError' "$f" || echo 'no change was reported')"
  done
  echo "nothing restarted; fix the push and run this again"
  exit 1
fi

for k in $(seq 1 "$N"); do
  PORT=$((3020 + k))
  pkill -f "PORTMARK=$k " 2>/dev/null
done
pkill -f 'dist/apps/api/src/main.js' 2>/dev/null
# Every lane now serves the main tree, so no break worktree's stamp is true —
# see `lane_api_down` in lane-env.sh, which clears it on the other stop path.
rm -f /tmp/claude-0/wt*.serving
sleep 2

for k in $(seq 1 "$N"); do
  DB="rundesk_v$k"; PORT=$((3020 + k))
  # The store has to BE up, not merely be pointed at. `lane_store_up` keeps a
  # running one and its objects — a restart that emptied the bucket would make
  # a suite's second run differ from its first for a reason nothing in the
  # suite mentions.
  lane_store_up "$k"
  lane_model_up "$k"
  lane_search_up "$k"
  (
    cd "$R/apps/api"
    export PORT="$PORT" PORTMARK="$k"
    export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/$DB"
    export JWT_ACCESS_SECRET=ci-access-secret-min-32-chars-aaaaaaaaaaaa
    export JWT_REFRESH_SECRET=ci-refresh-secret-min-32-chars-bbbbbbbbbb
    # Storage, from the one place that defines it — see lane-env.sh. Without
    # this the lane comes up with R2 unconfigured and every upload check
    # measures the refusal path instead of the real one.
    lane_store_env "$k"
    lane_model_env "$k"
    lane_search_env "$k"
    lane_oauth_env "$k"
    lane_proxy_env "$k"
    nohup node --require "$TSX/dist/preflight.cjs" \
      --import "file://$TSX/dist/loader.mjs" \
      dist/apps/api/src/main.js > "/tmp/claude-0/api-v$k.log" 2>&1 &
  )
done

ok=0
for k in $(seq 1 "$N"); do
  PORT=$((3020 + k)); up=""
  for i in $(seq 1 45); do
    if curl -s --noproxy '*' -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/api/v1/health"; then up=yes; break; fi
    sleep 2
  done
  if [ -n "$up" ] && lane_search_ready "$k"; then echo "lane $k: UP on $PORT"; ok=$((ok+1))
  elif [ -n "$up" ]; then echo "lane $k: API UP on $PORT but NOT SEARCHING THROUGH ITS STUB on $(lane_search_port "$k")"
  else echo "lane $k: DOWN"; tail -5 "/tmp/claude-0/api-v$k.log"; fi
done
echo "$ok/$N lanes synced and up"
exit
}
