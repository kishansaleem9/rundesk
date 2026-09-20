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
set -u
R=/home/user/rundesk
N=${1:-4}
export PGPASSWORD=rundesk
TSX="$R/node_modules/.pnpm/tsx@4.21.0/node_modules/tsx"

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

for k in $(seq 1 "$N"); do
  PORT=$((3020 + k))
  pkill -f "PORTMARK=$k " 2>/dev/null
done
pkill -f 'dist/apps/api/src/main.js' 2>/dev/null
sleep 2

for k in $(seq 1 "$N"); do
  DB="rundesk_v$k"; PORT=$((3020 + k))
  (
    cd "$R/apps/api"
    export PORT="$PORT" PORTMARK="$k"
    export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/$DB"
    export JWT_ACCESS_SECRET=ci-access-secret-min-32-chars-aaaaaaaaaaaa
    export JWT_REFRESH_SECRET=ci-refresh-secret-min-32-chars-bbbbbbbbbb
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
  if [ -n "$up" ]; then echo "lane $k: UP on $PORT"; ok=$((ok+1))
  else echo "lane $k: DOWN"; tail -5 "/tmp/claude-0/api-v$k.log"; fi
done
echo "$ok/$N lanes synced and up"
