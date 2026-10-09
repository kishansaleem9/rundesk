#!/bin/bash
# Bring up independent verification lanes, from a LIST.
#
# Verification was the bottleneck: one Postgres, one API, one dist meant one
# suite at a time. Each lane here gets its OWN database (restored from a dump
# of the pristine one, so the seed is identical) and its OWN API on its own
# port. Lane k is database rundesk_v<k> on port 302<k>.
#
# The shared `apps/web/dist` stays shared and is only ever READ by a suite, so
# lanes can share it safely. Break tests, which must rebuild, run in their own
# worktree per lane — see wt-break.sh — and a lane's private bundle is built by
# refresh-dists.sh into the /tmp/claude-0/dist-<lane> that verify.sh prefers.
# (This used to point at break-fleet.sh, which never existed.)
#   fleet-up.sh "1 2 3 4"          lanes 1 to 4 (also what no argument means)
#   fleet-up.sh "9 10"             lanes 9 and 10, leaving the rest alone
#   fleet-up.sh "$(seq 1 6)"       a range, spelled out
#
# A LIST, NEVER A COUNT. This read a bare number as a count, `4` as lanes 1 to
# 4, and it `DROP DATABASE`s every lane it is given. So `fleet-up.sh "3"`,
# which is how `sweep-until-clean.sh` heals one lane that went down, dropped
# lanes 1 and 2 as well (`commit-log/log-8ac33d9-1`). `lane_list` (lane-env.sh)
# is the one reading of a lane argument, shared with `fleet-restart.sh`.
# READ WHOLE BEFORE IT RUNS. Bash reads a script as it goes, by offset, so an
# edit to this file while it runs shifts what the run reads next — two break
# sets died that way (`lane-scripts-read-as-they-run`). The body is one brace
# group, which bash parses entirely before running any of it, and it ends in
# `exit`, so nothing appended after it runs either.
{
set -u
# The tree this file is in, as `fleet-restart.sh` (`found-5-oct/lane-scripts-build-the-main-checkout`).
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PGPASSWORD=rundesk
TSX="$R/node_modules/.pnpm/tsx@4.21.0/node_modules/tsx"
# Storage, in one place — see lane-env.sh for why it is not inlined here.
. "$R/scripts/e2e-lanes/lane-env.sh"

LANES=($(lane_list ${*:-1 2 3 4})) || exit 2
echo "lanes: ${LANES[*]}  (a LIST — '3' means lane three, not three lanes)"

sudo pg_ctlcluster 16 main start 2>/dev/null
for i in $(seq 1 20); do pg_isready -q && break; sleep 1; done
pg_isready >/dev/null || { echo "POSTGRES DOWN"; exit 1; }

# Re-dump so a lane created later in the session inherits any migration the
# pristine database has picked up since. Cheap — the dump is under a megabyte.
pg_dump -h 127.0.0.1 -U rundesk -d rundesk_pristine -Fc -f /tmp/claude-0/pristine.dump || exit 1

# A STORE PER LANE, so the upload path is something a suite can measure.
#
# The ledger had the cover picker's Upload tab down as unmeasurable for want of
# credentials. It was not credentials — `R2Service` reads `R2_ENDPOINT` and sets
# `forcePathStyle: true`, so any S3-compatible endpoint finishes the path with
# no product change. `s3-stub.mjs` is that endpoint, and it is per-lane for the
# same reason the database is: two lanes sharing one bucket would let one
# suite's objects answer another's reads, and its arranged-failure seam would
# fire on whichever PUT arrived first. Lane k gets port 91<k>.
#
# `check-s3-stub.mjs` drives the real SDK against this file every preflight, so
# a stub that stopped being faithful is caught there rather than by a suite
# going quietly green.
for k in "${LANES[@]}"; do
  DB="rundesk_v$k"; PORT=$((3020 + k)); S3PORT=$((9100 + k))
  # By port, and waited on — see `lane_api_down` for what `pkill -f "PORTMARK=…"`
  # did here, which was nothing.
  lane_api_down "$PORT" || { echo "lane $k: NOT STARTED — the old API would not let go of $PORT"; continue; }
  # Killed HERE as well as inside `lane_store_up`, and on purpose: this script
  # re-creates the database, so the lane must start with an EMPTY bucket. The
  # helper on its own would keep a running store and its objects, which is the
  # right behaviour for `fleet-restart.sh` and the wrong one here.
  stub_down "$S3PORT" "$LANE_ENV_DIR/s3-stub.mjs"
  : > "/tmp/claude-0/s3-v$k.log"
  sudo -u postgres psql -q -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" 2>/dev/null
  sudo -u postgres psql -q -c "CREATE DATABASE $DB OWNER rundesk" 2>/dev/null
  pg_restore -h 127.0.0.1 -U rundesk -d "$DB" --no-owner --role=rundesk \
    /tmp/claude-0/pristine.dump > "/tmp/claude-0/restore-v$k.log" 2>&1
  lane_store_up "$k"
  lane_model_up "$k"
  # The database was just re-created, so the lane's index starts empty too: a
  # running search stub would answer for rows that no longer exist.
  lane_has_search "$k" && stub_down "$(lane_search_port "$k")" "$LANE_ENV_DIR/meili-stub.mjs"
  lane_search_up "$k"
  lane_calendar_up "$k"
  lane_media_up "$k"
  (
    cd "$R/apps/api"
    export PORT="$PORT"
    export PORTMARK="$k"
    export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/$DB"
    export JWT_ACCESS_SECRET=ci-access-secret-min-32-chars-aaaaaaaaaaaa
    export JWT_REFRESH_SECRET=ci-refresh-secret-min-32-chars-bbbbbbbbbb
    # The four variables that turn "Storage is not configured" into a working
    # presign. No product change; `R2Service` has read these all along.
    lane_store_env "$k"
    lane_model_env "$k"
    lane_search_env "$k"
    lane_calendar_env "$k"
    lane_media_env "$k"
    lane_oauth_env "$k"
    lane_proxy_env "$k"
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
  # The store is reported separately, because an API that is up with storage
  # unconfigured is exactly the state the upload checks used to be written
  # against — a lane in that state would go green on the wrong path rather than
  # fail, which is the kind of quiet the rest of this harness exists to stop.
  S3PORT=$((9100 + k))
  s3=$(grep -o '"ready":true' "/tmp/claude-0/s3-v$k.log" 2>/dev/null | head -1)
  if [ -n "$up" ] && [ -n "$s3" ] && lane_search_ready "$k"; then
    echo "lane $k: UP on $PORT (rundesk_v$k), store on $S3PORT$(lane_has_search "$k" && echo ", search on $(lane_search_port "$k")")"; ok=$((ok+1))
  elif [ -n "$up" ] && [ -n "$s3" ]; then
    # The same quiet as a lane without its store: an API whose search init
    # failed falls back to Postgres and measures the path it was meant to leave.
    echo "lane $k: API UP on $PORT but NOT SEARCHING THROUGH ITS STUB on $(lane_search_port "$k") — the index will not be measurable"
  elif [ -n "$up" ]; then echo "lane $k: API UP on $PORT but NO STORE on $S3PORT — uploads will not be measurable"; tail -3 "/tmp/claude-0/s3-v$k.log" 2>/dev/null
  else echo "lane $k: DID NOT COME UP"; tail -5 "/tmp/claude-0/api-v$k.log"; fi
done
echo "$ok/${#LANES[@]} lanes up"
# A lane that did not come up is a failure, not a line of output. This exited 0
# with every lane down, and `build-api.sh` after it.
[ "$ok" = "${#LANES[@]}" ] || exit 1
exit
}
