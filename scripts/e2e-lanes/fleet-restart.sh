#!/bin/bash
# Restart the API process for lanes whose DATABASE is already good.
#
#   fleet-restart.sh "1 5 6 7 8"     restart those five lanes
#   fleet-restart.sh 9               restarts LANE NINE — not lanes 1..9
#   fleet-restart.sh                 with no argument, all ten
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
# Storage, in one place — see lane-env.sh for why it is not inlined here.
. "/home/user/rundesk/scripts/e2e-lanes/lane-env.sh"
export PGPASSWORD=rundesk

# A LIST, ALWAYS. NEVER A COUNT.
#
# `fleet-up.sh` accepts either and says in its own header that the count form
# "is destructive across a RANGE … which is a mistake you get to make once".
# I copied the parsing and left the warning behind, then typed
# `fleet-restart.sh "9"` meaning lane nine. It meant lanes ONE THROUGH NINE,
# restarted the three lanes whose worktree APIs three break sets were using,
# and every patch measured after that was measured against unpatched main-tree
# code. Twenty-nine results had to be thrown away.
#
# So this script takes a list and only a list. `10` restarts lane ten, not ten
# lanes; `"1 2 3"` restarts three. For every lane, say so — `$(seq 1 10)` is
# three characters longer than `10` and cannot be misread.
ARG=${*:-1 2 3 4 5 6 7 8 9 10}
LANES=($ARG)
for k in "${LANES[@]}"; do
  case "$k" in
    ''|*[!0-9]*) echo "not a lane number: '$k'"; exit 2 ;;
  esac
  if [ "$k" -lt 1 ] || [ "$k" -gt 10 ]; then echo "lane out of range: $k"; exit 2; fi
done
echo "restarting lanes: ${LANES[*]}  (a LIST — '9' means lane nine, not nine lanes)"

pg_ctlcluster 16 main start 2>/dev/null
for i in $(seq 1 20); do pg_isready -q && break; sleep 1; done
pg_isready >/dev/null || { echo "POSTGRES DOWN"; exit 1; }

# The build has to exist before anything is started. A lane that comes up on a
# stale `dist` is the bundle-staleness defect wearing server clothes.
[ -f "$R/apps/api/dist/apps/api/src/main.js" ] || {
  echo "apps/api/dist is missing — build it first (pnpm -C apps/api exec tsc -p tsconfig.build.json)"
  exit 2
}

# THE NEWEST MIGRATION HAS TO BE IN THE DATABASE, and checking that a database
# EXISTS is not checking that.
#
# The first version of this script checked existence alone. A container restart
# rolled Postgres back to a state predating that day's migration, every lane
# database was still there, this script started a current API against all ten,
# and every list create answered
#
#     PostgresError: column folders.status_scope does not exist
#
# as a 500 — from a suite whose own fixture then blamed itself ("could not make
# this suite's own list"). The lanes are built by restoring a DUMP, so
# `drizzle.__drizzle_migrations` is empty in them and `drizzle-kit migrate`
# cannot be used to tell: it would try to apply all 160 against a populated
# schema. The schema itself is the only honest witness.
#
# Refusing is right. A lane that comes up and 500s on its first write costs
# more than one that never came up, because the failure arrives wearing the
# suite's name.
LATEST_SQL=$(ls "$R/packages/db/src/migrations"/*.sql | sort | tail -1)
NEWEST_COL=$(grep -oiE 'ADD COLUMN IF NOT EXISTS "[a-z_]+"' "$LATEST_SQL" | head -1 | grep -oE '"[a-z_]+"' | tr -d '"')
NEWEST_TBL=$(grep -oiE 'ALTER TABLE "[a-z_]+"' "$LATEST_SQL" | head -1 | grep -oE '"[a-z_]+"' | tr -d '"')

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
  # The schema check, per lane, when the newest migration is one this can read.
  # A migration shape it cannot parse is skipped rather than guessed at — and
  # says so, because a check that silently passes is worse than none.
  if [ -n "$NEWEST_COL" ] && [ -n "$NEWEST_TBL" ]; then
    HAS=$(psql -h 127.0.0.1 -U rundesk -d "$DB" -tAc \
      "select count(*) from information_schema.columns where table_name='$NEWEST_TBL' and column_name='$NEWEST_COL'" 2>/dev/null | tr -d ' ')
    if [ "$HAS" != "1" ]; then
      echo "lane $k: $DB is behind — $NEWEST_TBL.$NEWEST_COL is missing ($(basename "$LATEST_SQL"))"
      echo "         apply it:  psql -h 127.0.0.1 -U rundesk -d $DB -f $LATEST_SQL"
      echo "         REFUSING to start an API that would 500 on its first write"
      continue
    fi
  else
    echo "lane $k: could not read a column check out of $(basename "$LATEST_SQL") — schema NOT verified"
  fi
  # Kill by PORT, never by `pkill -f` on an environment variable: PORTMARK is
  # not in any command line, so that pattern matches nothing (and a looser one
  # matches this script).
  PIDS=$(lsof -t -i ":$PORT" -sTCP:LISTEN 2>/dev/null)
  [ -n "$PIDS" ] && kill $PIDS 2>/dev/null
  # The store has to BE up, not merely be pointed at. `lane_store_up` keeps a
  # running one and its objects — a restart that emptied the bucket would make
  # a suite's second run differ from its first for a reason nothing in the
  # suite mentions.
  lane_store_up "$k"
  (
    cd "$R/apps/api"
    export PORT="$PORT"
    export PORTMARK="$k"
    export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/$DB"
    export JWT_ACCESS_SECRET=ci-access-secret-min-32-chars-aaaaaaaaaaaa
    export JWT_REFRESH_SECRET=ci-refresh-secret-min-32-chars-bbbbbbbbbb
    # Storage, from the one place that defines it — see lane-env.sh. Without
    # this the lane comes up with R2 unconfigured and every upload check
    # measures the refusal path instead of the real one.
    lane_store_env "$k"
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
