#!/bin/bash
# Bring up N independent verification lanes.
#
# Verification was the bottleneck: one Postgres, one API, one dist meant one
# suite at a time. Each lane here gets its OWN database (restored from a dump
# of the pristine one, so the seed is identical) and its OWN API on its own
# port. Lane k is database rundesk_v<k> on port 302<k>.
#
# The shared `apps/web/dist` stays shared and is only ever READ by a suite, so
# lanes can share it safely. Break tests, which must rebuild, get their own
# dist directory per lane — see break-fleet.sh.
#   fleet-up.sh 4          lanes 1 2 3 4
#   fleet-up.sh "9 10"     lanes 9 and 10, LEAVING 1..8 ALONE
#
# The second form exists because the first is destructive across a RANGE: it
# `DROP DATABASE`s every lane from 1 to N. Adding two lanes to a running fleet
# by calling `fleet-up.sh 10` would therefore wipe the eight lanes other agents
# were working in, which is a mistake you get to make once. A list is the same
# shape `sweep.sh` already takes for its lanes.
set -u
R=/home/user/rundesk
export PGPASSWORD=rundesk
TSX="$R/node_modules/.pnpm/tsx@4.21.0/node_modules/tsx"

ARG=${1:-4}
case "$ARG" in
  *[!0-9]*) LANES=($ARG) ;;            # a list: "9 10"
  *)        LANES=($(seq 1 "$ARG")) ;; # a count: 4  →  1 2 3 4
esac
echo "lanes: ${LANES[*]}"

sudo pg_ctlcluster 16 main start 2>/dev/null
for i in $(seq 1 20); do pg_isready -q && break; sleep 1; done
pg_isready >/dev/null || { echo "POSTGRES DOWN"; exit 1; }

# Re-dump so a lane created later in the session inherits any migration the
# pristine database has picked up since. Cheap — the dump is under a megabyte.
pg_dump -h 127.0.0.1 -U rundesk -d rundesk_pristine -Fc -f /tmp/claude-0/pristine.dump || exit 1

for k in "${LANES[@]}"; do
  DB="rundesk_v$k"; PORT=$((3020 + k))
  pkill -f "PORTMARK=$k " 2>/dev/null
  sudo -u postgres psql -q -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" 2>/dev/null
  sudo -u postgres psql -q -c "CREATE DATABASE $DB OWNER rundesk" 2>/dev/null
  pg_restore -h 127.0.0.1 -U rundesk -d "$DB" --no-owner --role=rundesk \
    /tmp/claude-0/pristine.dump > "/tmp/claude-0/restore-v$k.log" 2>&1
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
  PORT=$((3020 + k))
  up=""
  for i in $(seq 1 45); do
    if curl -s --noproxy '*' -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/api/v1/health"; then up=yes; break; fi
    sleep 2
  done
  if [ -n "$up" ]; then echo "lane $k: UP on $PORT (rundesk_v$k)"; ok=$((ok+1))
  else echo "lane $k: DID NOT COME UP"; tail -5 "/tmp/claude-0/api-v$k.log"; fi
done
echo "$ok/${#LANES[@]} lanes up"
