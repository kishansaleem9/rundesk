#!/bin/bash
# Restart the API process for lanes whose DATABASE is already good.
#
#   fleet-restart.sh "1 5 6 7 8"     restart those lanes' APIs
#   fleet-restart.sh 10              lanes 1..10
#
# WHY THIS EXISTS, AND WHY IT IS NOT `fleet-up.sh`. `fleet-up.sh` re-creates
# each lane from the pristine dump: `DROP DATABASE … WITH (FORCE)` then
# `pg_restore`. That is right when a lane's data is suspect and wrong when only
# the PROCESS died — a container restart kills every API and leaves ten
# perfectly good databases behind, and reaching for the destructive script
# there throws away state for no reason and takes minutes doing it.
#
# The distinction is the same one `fleet-up.sh` already makes between a count
# and a list: the cheap operation should not be reachable only through the
# expensive one.
#
# Nothing here touches Postgres itself beyond starting the cluster, and nothing
# drops anything.
set -u
R=/home/user/rundesk
TSX="$R/node_modules/.pnpm/tsx@4.21.0/node_modules/tsx"
export PGPASSWORD=rundesk

ARG=${1:-10}
case "$ARG" in
  *[!0-9]*) LANES=($ARG) ;;
  *)        LANES=($(seq 1 "$ARG")) ;;
esac
echo "restarting lanes: ${LANES[*]}"

pg_ctlcluster 16 main start 2>/dev/null
for i in $(seq 1 20); do pg_isready -q && break; sleep 1; done
pg_isready >/dev/null || { echo "POSTGRES DOWN"; exit 1; }

# The build has to exist before anything is started. A lane that comes up on a
# stale `dist` is the bundle-staleness defect wearing server clothes.
[ -f "$R/apps/api/dist/apps/api/src/main.js" ] || {
  echo "apps/api/dist is missing — build it first (pnpm -C apps/api exec tsc -p tsconfig.build.json)"
  exit 2
}

for k in "${LANES[@]}"; do
  DB="rundesk_v$k"; PORT=$((3020 + k))
  # REFUSE A LANE WHOSE DATABASE IS GONE rather than starting an API that will
  # answer every query with an error. `fleet-up.sh` is the script for that case
  # and this one says so instead of half-doing its job.
  if ! psql -h 127.0.0.1 -U rundesk -d postgres -tAc \
      "select 1 from pg_database where datname='$DB'" | grep -q 1; then
    echo "lane $k: $DB does not exist — use fleet-up.sh \"$k\" to create it"
    continue
  fi
  # Kill by PORT, never by `pkill -f` on an environment variable: PORTMARK is
  # not in any command line, so that pattern matches nothing (and a looser one
  # matches this script).
  PIDS=$(lsof -t -i ":$PORT" -sTCP:LISTEN 2>/dev/null)
  [ -n "$PIDS" ] && kill $PIDS 2>/dev/null
  (
    cd "$R/apps/api"
    export PORT="$PORT"
    export PORTMARK="$k"
    export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/$DB"
    export JWT_ACCESS_SECRET=ci-access-secret-min-32-chars-aaaaaaaaaaaa
    export JWT_REFRESH_SECRET=ci-refresh-secret-min-32-chars-bbbbbbbbbb
    nohup node --require "$TSX/dist/preflight.cjs" \
      --import "file://$TSX/dist/loader.mjs" \
      dist/apps/api/src/main.js > "/tmp/claude-0/api-v$k.log" 2>&1 &
  )
done

ok=0
for k in "${LANES[@]}"; do
  # RECOMPUTED, not carried over from the loop above. `$DB` there ends holding
  # the LAST lane's name, so reporting it here printed "(rundesk_v10)" against
  # every one of ten lanes that were each correctly on their own database. The
  # lanes were right and the sentence was wrong, which is the defect this whole
  # audit is named after — and it took saying it out loud ten times in a row
  # before it was read rather than skimmed.
  DB="rundesk_v$k"; PORT=$((3020 + k))
  up=""
  for i in $(seq 1 45); do
    if curl -s --noproxy '*' -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/api/v1/health"; then up=yes; break; fi
    sleep 2
  done
  if [ -n "$up" ]; then echo "lane $k: UP on $PORT ($DB)"; ok=$((ok+1))
  else echo "lane $k: DID NOT COME UP"; tail -5 "/tmp/claude-0/api-v$k.log"; fi
done
echo "$ok of ${#LANES[@]} lanes up"
