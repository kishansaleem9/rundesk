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
# READ WHOLE BEFORE IT RUNS. Bash reads a script as it goes, by offset, so an
# edit to this file while it runs shifts what the run reads next — two break
# sets died that way (`lane-scripts-read-as-they-run`). The body is one brace
# group, which bash parses entirely before running any of it, and it ends in
# `exit`, so nothing appended after it runs either.
{
set -u
# THE CHECKOUT THIS COPY IS IN, not /home/user/rundesk by name. From the main
# tree that is the main tree, as it always was. From a worktree it is that
# worktree: its API build, and its lane helpers and stubs. The copy in a
# worktree started the MAIN tree's build with the MAIN tree's helpers, so a
# lane restarted from a worktree never served what the worktree held — and a
# helper the worktree had added did not exist for it (`lane_search_up`).
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TSX="$R/node_modules/.pnpm/tsx@4.21.0/node_modules/tsx"
# Storage, in one place — see lane-env.sh for why it is not inlined here.
. "$R/scripts/e2e-lanes/lane-env.sh"
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
# `lane_list` (lane-env.sh) is that rule, and `fleet-up.sh` reads it too.
LANES=($(lane_list ${*:-1 2 3 4 5 6 7 8 9 10})) || exit 2
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
#
# THE NEWEST MIGRATION THAT ADDS A COLUMN, not simply the newest file. A
# data-only migration (0161 rewrites saved image URLs) names no column to look
# for, and reading only the newest file switched this check off for every
# restart for as long as such a file stayed newest — it printed "schema NOT
# verified" and started the API anyway. Walking back to the newest file with a
# column keeps the witness.
#
# AND A TABLE IT CREATES counts too (`newest_schema_witness`, lane-env.sh): 0162
# creates one and adds no column, and reading columns only left the check on
# 0160's while a lane without the new table came up and 500'd writing to it.
read -r LATEST_SQL NEWEST_TBL NEWEST_COL <<< "$(newest_schema_witness "$R/packages/db/src/migrations")"

# The lanes this run REFUSED to restart. The count at the end has to leave them
# out: a refused lane still has its old API listening, which answers health, so
# it was counted "UP" — on the build this run was asked to replace.
declare -A REFUSED=()

for k in "${LANES[@]}"; do
  DB="rundesk_v$k"; PORT=$((3020 + k))
  # REFUSE A LANE WHOSE DATABASE IS GONE rather than starting an API that will
  # answer every query with an error. `fleet-up.sh` is the script for that case
  # and this one says so instead of half-doing its job.
  if ! psql -h 127.0.0.1 -U rundesk -d postgres -tAc \
      "select 1 from pg_database where datname='$DB'" | grep -q 1; then
    echo "lane $k: $DB does not exist — use fleet-up.sh \"$k\" to create it"
    REFUSED[$k]=1
    continue
  fi
  # The schema check, per lane, when the newest migration is one this can read.
  # A migration shape it cannot parse is skipped rather than guessed at — and
  # says so, because a check that silently passes is worse than none.
  if [ -n "$NEWEST_TBL" ]; then
    if [ -n "$NEWEST_COL" ]; then
      HAS=$(psql -h 127.0.0.1 -U rundesk -d "$DB" -tAc \
        "select count(*) from information_schema.columns where table_name='$NEWEST_TBL' and column_name='$NEWEST_COL'" 2>/dev/null | tr -d ' ')
    else
      HAS=$(psql -h 127.0.0.1 -U rundesk -d "$DB" -tAc \
        "select count(*) from information_schema.tables where table_name='$NEWEST_TBL'" 2>/dev/null | tr -d ' ')
    fi
    if [ "$HAS" != "1" ]; then
      echo "lane $k: $DB is behind — $NEWEST_TBL${NEWEST_COL:+.$NEWEST_COL} is missing ($(basename "$LATEST_SQL"))"
      echo "         apply it:  psql -h 127.0.0.1 -U rundesk -d $DB -f $LATEST_SQL"
      echo "         REFUSING to start an API that would 500 on its first write"
      REFUSED[$k]=1
      continue
    fi
  else
    echo "lane $k: no migration names a column or a table to check — schema NOT verified"
  fi
  # AND THE WHOLE SCHEMA, not only the newest migration's column: an index, a
  # default or a constraint the lane lacks is invisible to the witness above
  # (`found-25-sep/lane-databases-drift-from-the-migrations`).
  if ! DRIFT=$(lane_schema_drift "$DB"); then
    echo "lane $k: $DB does not have the schema the source says —"
    printf '%s\n' "$DRIFT" | head -6 | sed 's/^/         /'
    echo "         REFUSING; push the schema to it (fleet-sync.sh) and restart"
    REFUSED[$k]=1
    continue
  fi
  # Kill by PORT, never by `pkill -f` on an environment variable: PORTMARK is
  # not in any command line, so that pattern matches nothing (and a looser one
  # matches this script). And WAIT for it to go: relaunching at once let the
  # health loop below pass against the dying process — see `lane_api_down`.
  lane_api_down "$PORT" || { echo "lane $k: NOT RESTARTED — the old API would not let go of $PORT"; REFUSED[$k]=1; continue; }
  # The store has to BE up, not merely be pointed at. `lane_store_up` keeps a
  # running one and its objects — a restart that emptied the bucket would make
  # a suite's second run differ from its first for a reason nothing in the
  # suite mentions.
  lane_store_up "$k"
  # Off unless RUNDESK_LANE_MODEL names this lane (`all`, or a list of lane
  # numbers) — see lane-env.sh for which suites need a lane without a model,
  # and why a fleet mixes the two.
  lane_model_up "$k"
  # And its search engine, when RUNDESK_LANE_SEARCH names it — before the API,
  # which makes its index at boot (lane-env.sh).
  lane_search_up "$k"
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
    lane_model_env "$k"
    lane_search_env "$k"
    lane_oauth_env "$k"
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
  if [ -n "${REFUSED[$k]:-}" ]; then echo "lane $k: NOT RESTARTED (above)"; continue; fi
  up=""
  for i in $(seq 1 45); do
    if curl -s --noproxy '*' -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/api/v1/health"; then up=yes; break; fi
    sleep 2
  done
  # A lane RUNDESK_LANE_SEARCH names is up when its API searches through its
  # stub, not when it answers health: an init that failed falls back to
  # Postgres in silence (`lane_search_ready`).
  if [ -n "$up" ] && lane_search_ready "$k"; then
    echo "lane $k: UP on $PORT ($DB)$(lane_has_search "$k" && echo ", searching through its stub on $(lane_search_port "$k")")"; ok=$((ok+1))
  elif [ -n "$up" ]; then
    echo "lane $k: API UP on $PORT but NOT SEARCHING THROUGH ITS STUB on $(lane_search_port "$k") — the index would not be measured"
    sed 's/\x1b\[[0-9;]*m//g' "/tmp/claude-0/api-v$k.log" | grep -a -m2 -E 'SearchService|Meilisearch'
  else echo "lane $k: DID NOT COME UP"; tail -5 "/tmp/claude-0/api-v$k.log"; fi
done
echo "$ok of ${#LANES[@]} lanes up"
# A lane that did not come up is a failure, not a line of output. This exited 0
# with every lane down, and so did `build-api.sh`, whose last command it is.
[ "$ok" = "${#LANES[@]}" ] || exit 1
exit
}
