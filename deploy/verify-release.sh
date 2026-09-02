#!/usr/bin/env bash
#
# Post-deploy verification for the task-types / reporting-line / work-schedule
# release, and for the meetings release that follows it (migration 0092).
# Run on the VPS after deploy/deploy-prod.sh:
#
#   bash deploy/verify-release.sh
#
# This exists because the site cannot be opened from the office IP, so "it
# deployed" and "it works" have to be established from the shell. Every check
# is a real HTTP round trip against the running container — nothing is inferred
# from the image tag or the git log.
set -uo pipefail

cd "$(dirname "$0")/.."

# Caller-supplied values win over .env. Captured before sourcing because
# `set -a` would otherwise overwrite them — which silently pointed an earlier
# run at the wrong database and made it report five false failures.
ovr_port="${API_HOST_PORT:-}"
ovr_email="${RUNDESK_EMAIL:-}"
ovr_pass="${RUNDESK_PASSWORD:-}"
ovr_pghost="${POSTGRES_HOST:-}"
ovr_pgport="${POSTGRES_PORT:-}"
ovr_pguser="${POSTGRES_USER:-}"
ovr_pgdb="${POSTGRES_DB:-}"
ovr_pgpass="${POSTGRES_PASSWORD:-}"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
POSTGRES_HOST="${ovr_pghost:-${POSTGRES_HOST:-127.0.0.1}}"
POSTGRES_PORT="${ovr_pgport:-${POSTGRES_PORT:-5432}}"
POSTGRES_USER="${ovr_pguser:-${POSTGRES_USER:-rundesk}}"
POSTGRES_DB="${ovr_pgdb:-${POSTGRES_DB:-rundesk}}"
POSTGRES_PASSWORD="${ovr_pgpass:-${POSTGRES_PASSWORD:-}}"
export POSTGRES_HOST POSTGRES_PORT POSTGRES_USER POSTGRES_DB POSTGRES_PASSWORD

PORT="${ovr_port:-${API_HOST_PORT:-3010}}"
API="http://127.0.0.1:${PORT}/api/v1"
EMAIL="${ovr_email:-${RUNDESK_EMAIL:-admin@rundesk.internal}}"
PASSWORD="${ovr_pass:-${RUNDESK_PASSWORD:-Admin@123!}}"

PASS=0; FAIL=0
say()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mPASS\033[0m %s\n' "$*"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$*"; FAIL=$((FAIL+1)); }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
# A grep that finds nothing exits 1, and under `set -e` that would kill the run
# mid-way. Every pipeline below ends in `|| true` for that reason.
# CAUTION: the `sed 's/.*://'` is greedy, so this mangles any value that
# contains a colon — an ISO timestamp comes back as its last fragment. For
# those, grep the whole "key":"value" pair instead of reaching for this.
jget() { grep -o "\"$1\":[^,}]*" | head -1 | sed 's/.*://;s/"//g' || true; }

say "API is up"
for _ in $(seq 1 45); do
  curl -fsS --max-time 5 "$API/health" >/dev/null 2>&1 && break
  printf '.'; sleep 2
done
curl -fsS --max-time 5 "$API/health" >/dev/null 2>&1 || die "API not answering on $API"
echo "  ok"

say "Migration 0091 was applied"
# What 0091 adds. If drizzle-kit migrate skipped it these are absent, and every
# feature below would fail in a confusing way instead of an obvious one.
#
# Postgres normally runs in the rundesk-postgres container here; fall back to a
# plain psql so this is still useful on a host-installed database. If neither
# works, say so rather than reporting six false failures.
DB_MODE=none
if docker exec rundesk-postgres true >/dev/null 2>&1; then
  DB_MODE=docker
elif command -v psql >/dev/null 2>&1 && \
     PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h "${POSTGRES_HOST:-127.0.0.1}" -p "${POSTGRES_PORT:-5432}" \
       -U "${POSTGRES_USER:-rundesk}" -d "${POSTGRES_DB:-rundesk}" -tAc 'select 1' >/dev/null 2>&1; then
  DB_MODE=psql
fi

run_sql() {
  case "$DB_MODE" in
    docker) docker exec rundesk-postgres psql -U "${POSTGRES_USER:-rundesk}" -d "${POSTGRES_DB:-rundesk}" -tAc "$1" 2>/dev/null || true ;;
    psql)   PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h "${POSTGRES_HOST:-127.0.0.1}" -p "${POSTGRES_PORT:-5432}" \
              -U "${POSTGRES_USER:-rundesk}" -d "${POSTGRES_DB:-rundesk}" -tAc "$1" 2>/dev/null || true ;;
    *)      printf '' ;;
  esac
}

check_sql() {
  local desc="$1" sql="$2" want="$3"
  if [ "$DB_MODE" = none ]; then
    printf '  \033[2mSKIP\033[0m %s (no reachable database — set POSTGRES_HOST/PORT/PASSWORD)\n' "$desc"
    return
  fi
  local got; got=$(run_sql "$sql" | tr -d '[:space:]')
  if [ "$got" = "$want" ]; then ok "$desc"; else bad "$desc (got '${got:-<none>}', expected '$want')"; fi
}
[ "$DB_MODE" = none ] && printf '\033[1;33m  no database reachable — the schema checks below are skipped, not passed\033[0m\n'
[ "$DB_MODE" != none ] && echo "  (reading the database via $DB_MODE)"
check_sql "task_types table exists"            "SELECT to_regclass('public.task_types') IS NOT NULL;" "t"
check_sql "tasks.task_type_id column exists"   "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='task_type_id');" "t"
check_sql "workspace_members.manager_id exists" "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workspace_members' AND column_name='manager_id');" "t"
check_sql "workspaces.work_days exists"        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workspaces' AND column_name='work_days');" "t"
check_sql "workspace_holidays table exists"    "SELECT to_regclass('public.workspace_holidays') IS NOT NULL;" "t"
check_sql "the one-default-per-workspace index exists" \
  "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='uq_task_types_one_default');" "t"

say "Signing in as $EMAIL"
LOGIN=$(curl -fsS --max-time 20 -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" || true)
TOKEN=$(printf '%s' "$LOGIN" | jget accessToken)
# Who this token belongs to, straight from the response that issued it. An
# earlier version matched $EMAIL against the roster with grep -F, which is a
# substring match: on a seeded install "admin@rundesk.internal" also matches
# "org-admin@rundesk.internal", so the checks below ran against the wrong
# person and a legitimate 200 was reported as a failure.
ME=$(printf '%s' "$LOGIN" | awk -F'"user":\\{' '{print $2}' | jget id)
[ -n "$TOKEN" ] || die "login rejected — set RUNDESK_EMAIL / RUNDESK_PASSWORD if the admin password was rotated"
AUTH="Authorization: Bearer $TOKEN"
WS=$(curl -fsS --max-time 20 "$API/workspaces" -H "$AUTH" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*://;s/"//g' || true)
[ -n "$WS" ] || die "no workspace visible for this account"
echo "  ok — workspace $WS"

say "Task types: create, default, apply, delete"
# §1.1 — a workspace with no types hides the picker, so the feature is only
# real if every workspace starts with some. Migration 0093 backfills them and
# workspace creation seeds them; without that, production had zero.
SEEDED=$(curl -fsS --max-time 20 "$API/workspaces/$WS/task-types" -H "$AUTH" 2>/dev/null || true)
printf '%s' "$SEEDED" | grep -q 'Milestone' \
  && ok "the workspace ships with a Milestone type" \
  || bad "no default task types -> $(printf '%s' "$SEEDED" | head -c 160)"

# Deliberately NOT the default. An earlier version created this type with
# isDefault:true and then checked that a task created "as" it carried it — which
# passed while the controller was silently dropping taskTypeId, because the task
# picked the type up as the workspace default instead. A non-default type is the
# only version of this check that tests the wire.
TT=$(curl -fsS --max-time 20 -X POST "$API/workspaces/$WS/task-types" -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Deploy check","icon":"✅"}' 2>/dev/null || true)
TID=$(printf '%s' "$TT" | jget id)
if [ -n "$TID" ]; then ok "created a task type"; else bad "create -> $TT"; fi

if [ -n "$TID" ]; then
  LIST=$(curl -fsS --max-time 20 "$API/workspaces/$WS/task-types" -H "$AUTH" 2>/dev/null || true)
  printf '%s' "$LIST" | grep -q 'Deploy check' && ok "it is listed" || bad "list -> $LIST"

  DEFAULTS=$(printf '%s' "$LIST" | grep -o '"isDefault":true' | wc -l | tr -d ' ')
  # 0 is the interesting failure: deleting the default used to leave a workspace
  # with none, which makes every later task untyped and hides the picker.
  [ "$DEFAULTS" = "1" ] && ok "exactly one default type" \
    || bad "found $DEFAULTS defaults, expected 1 (0 means nothing re-nominated one after a delete)"

  # §1.1 — a task can be created *as* a type. tasks.service.ts always accepted
  # taskTypeId, but the global pipe runs whitelist:true and CreateTaskDto had no
  # such field, so the client's choice was stripped in transit and every task
  # got the list's default. The only way to see that is to send one and read the
  # task back.
  # There is no "lists in a workspace" route — walk space -> project -> list.
  SPID=$(curl -fsS --max-time 20 "$API/spaces/workspace/$WS" -H "$AUTH" 2>/dev/null | jget id || true)
  PRID=$([ -n "$SPID" ] && curl -fsS --max-time 20 "$API/projects/space/$SPID" -H "$AUTH" 2>/dev/null | jget id || true)
  LID=$([ -n "$PRID" ] && curl -fsS --max-time 20 "$API/lists/project/$PRID" -H "$AUTH" 2>/dev/null | jget id || true)
  if [ -n "$LID" ]; then
    # A taskTypeId from another workspace must be refused. The PATCH path always
    # scoped it (task-types.service.ts, byId); the create path did not when the
    # field was opened up, so a caller could type a task with somebody else's
    # id. A well-formed uuid that is not this workspace's is exactly that case.
    FOREIGN=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X POST "$API/tasks" -H "$AUTH" \
      -H 'Content-Type: application/json' \
      -d "{\"listId\":\"$LID\",\"title\":\"deploy check — foreign type\",\"taskTypeId\":\"00000000-0000-4000-8000-000000000000\"}" || true)
    case "$FOREIGN" in
      400|404) ok "a task type from another workspace is refused ($FOREIGN)" ;;
      *)       bad "a foreign taskTypeId answered $FOREIGN — it was accepted" ;;
    esac

    NEW=$(curl -fsS --max-time 20 -X POST "$API/tasks" -H "$AUTH" \
      -H 'Content-Type: application/json' \
      -d "{\"listId\":\"$LID\",\"title\":\"deploy check — typed task\",\"taskTypeId\":\"$TID\"}" 2>/dev/null || true)
    NEW_ID=$(printf '%s' "$NEW" | jget id)
    if [ -n "$NEW_ID" ]; then
      READ=$(curl -fsS --max-time 20 "$API/tasks/$NEW_ID" -H "$AUTH" 2>/dev/null || true)
      DEFAULT_TID=$(printf '%s' "$SEEDED" | grep -o '{"id":"[0-9a-f-]\{36\}"[^}]*"isDefault":true' | head -1 | sed 's/.*"id":"//;s/".*//' || true)
      printf '%s' "$READ" | grep -q "$TID" \
        && ok "a task can be created as a chosen non-default type" \
        || bad "the chosen type did not stick -> $(printf '%s' "$READ" | head -c 200)"
      # Not `if [ -n ... ]`: when this could not find the default it skipped
      # silently, and the run showed neither a pass nor a fail for the one
      # assertion that distinguishes "the choice travelled" from "the task took
      # the default anyway". A check that quietly no-ops is worse than one that
      # fails, because the output looks fine.
      if [ -z "$DEFAULT_TID" ]; then
        bad "could not identify the workspace default, so the check below proves nothing"
      elif printf '%s' "$READ" | grep -q "$DEFAULT_TID"; then
        bad "the task took the workspace default instead of the chosen type"
      else
        ok "and not the workspace default, so the choice really travelled"
      fi

      # …and search narrows to it. A second type gives the negative case: a
      # filter that returns everything regardless would pass the positive one on
      # its own. The workspace is a path segment here, not a query param.
      OTHER=$(curl -fsS --max-time 20 -X POST "$API/workspaces/$WS/task-types" -H "$AUTH" \
        -H 'Content-Type: application/json' -d '{"name":"Deploy check other"}' 2>/dev/null || true)
      OID=$(printf '%s' "$OTHER" | jget id)

      MINE=$(curl -fsS --max-time 25 "$API/search/$WS?q=deploy&taskTypeId=$TID" -H "$AUTH" 2>/dev/null || true)
      printf '%s' "$MINE" | grep -q "$NEW_ID" \
        && ok "search finds it when filtered to that type" \
        || bad "taskTypeId=$TID did not return the task -> $(printf '%s' "$MINE" | head -c 200)"

      if [ -n "$OID" ]; then
        NOTMINE=$(curl -fsS --max-time 25 "$API/search/$WS?q=deploy&taskTypeId=$OID" -H "$AUTH" 2>/dev/null || true)
        printf '%s' "$NOTMINE" | grep -q "$NEW_ID" \
          && bad "filtering to a different type still returned it — the filter is not applied" \
          || ok "and excludes it when filtered to a different type"
        curl -fsS --max-time 20 -X DELETE "$API/workspaces/$WS/task-types/$OID" -H "$AUTH" >/dev/null 2>&1 || true
      else
        bad "could not create a second task type for the negative case"
      fi

      curl -fsS --max-time 20 -X DELETE "$API/tasks/$NEW_ID" -H "$AUTH" >/dev/null 2>&1 || true
    else
      bad "could not create a task to check the type -> $(printf '%s' "$NEW" | head -c 160)"
    fi
  else
    bad "no list available to create a typed task in"
  fi

  DEL=$(curl -fsS --max-time 20 -X DELETE "$API/workspaces/$WS/task-types/$TID" -H "$AUTH" 2>/dev/null || true)
  printf '%s' "$DEL" | grep -q 'untypedTasks' \
    && ok "delete reports how many tasks it untyped" || bad "delete -> $DEL"
fi

say "Work schedule + holidays"
SCHED=$(curl -fsS --max-time 20 "$API/workspaces/$WS/work-schedule" -H "$AUTH" 2>/dev/null || true)
printf '%s' "$SCHED" | grep -q 'workDays' && ok "reads: $(printf '%s' "$SCHED" | head -c 120)" || bad "read -> $SCHED"

SET=$(curl -fsS --max-time 20 -X PATCH "$API/workspaces/$WS/work-schedule" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"workDays":[7,1,2,3,4,1]}' 2>/dev/null || true)
printf '%s' "$SET" | grep -q '\[1,2,3,4,7\]' \
  && ok "de-dupes and sorts the week" || bad "set -> $SET"

EMPTY=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X PATCH "$API/workspaces/$WS/work-schedule" \
  -H "$AUTH" -H 'Content-Type: application/json' -d '{"workDays":[]}' || true)
[ "$EMPTY" = "400" ] && ok "an empty week is refused (400)" || bad "empty week -> $EMPTY"

# Put the week back before anything else reads it.
curl -fsS --max-time 20 -X PATCH "$API/workspaces/$WS/work-schedule" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"workDays":[1,2,3,4,5]}' >/dev/null 2>&1 || true

HDAY="2027-11-11"
H=$(curl -fsS --max-time 20 -X POST "$API/workspaces/$WS/holidays" -H "$AUTH" \
  -H 'Content-Type: application/json' -d "{\"day\":\"$HDAY\",\"name\":\"Deploy check\"}" 2>/dev/null || true)
HID=$(printf '%s' "$H" | jget id)
if [ -n "$HID" ]; then
  ok "holiday added"
  DUP=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X POST "$API/workspaces/$WS/holidays" \
    -H "$AUTH" -H 'Content-Type: application/json' -d "{\"day\":\"$HDAY\",\"name\":\"dup\"}" || true)
  [ "$DUP" = "409" ] && ok "a duplicate date is refused (409)" || bad "duplicate -> $DUP"
  curl -fsS --max-time 20 -X DELETE "$API/workspaces/$WS/holidays/$HID" -H "$AUTH" >/dev/null 2>&1 \
    && ok "and removed again" || bad "holiday delete failed"
else
  bad "holiday add -> $H"
fi

say "Workload reads the work schedule"
WL=$(curl -fsS --max-time 30 "$API/workspaces/$WS/reports/workload?days=14" -H "$AUTH" 2>/dev/null || true)
printf '%s' "$WL" | grep -q 'dailyCapacities' \
  && ok "workload returns per-day capacity" || bad "workload -> $(printf '%s' "$WL" | head -c 160)"
printf '%s' "$WL" | grep -q '"userId"' \
  && ok "and each row carries a userId (the key the heat map now uses)" \
  || bad "workload rows have no userId — the duplicate-key fix has nothing to key on"

say "Reporting line"
MEMBERS=$(curl -fsS --max-time 20 "$API/workspaces/$WS/members" -H "$AUTH" 2>/dev/null || true)
printf '%s' "$MEMBERS" | grep -q 'managerId' \
  && ok "the roster exposes managerId" || bad "no managerId on the roster"

# Anyone on the roster who is not this account. Compared by id, exactly —
# never by matching an email, which is how the caller got mistaken for
# someone whose address merely contains theirs.
PEER=$(printf '%s' "$MEMBERS" | grep -o '"userId":"[^"]*"' | sed 's/.*://;s/"//g' \
     | grep -v -x -F "$ME" | head -1 || true)
if [ -n "$ME" ] && printf '%s' "$MEMBERS" | grep -qF "$ME"; then
  ok "this account is on the roster of $WS"
else
  bad "signed in fine, but this account is not a member of $WS"
fi

if [ -n "$ME" ] && [ -n "$PEER" ]; then
  # Start from nobody-reports-to-anybody. Left as it was, a manager set by an
  # earlier run makes the *first* call the cycle, and the check then passes or
  # fails for a reason that has nothing to do with this deploy.
  for U in "$ME" "$PEER"; do
    curl -fsS --max-time 20 -X PATCH "$API/workspaces/$WS/members/$U/manager" -H "$AUTH" \
      -H 'Content-Type: application/json' -d '{"managerId":null}' >/dev/null 2>&1 || true
  done
  SET=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X PATCH "$API/workspaces/$WS/members/$ME/manager" \
    -H "$AUTH" -H 'Content-Type: application/json' -d "{\"managerId\":\"$PEER\"}" || true)
  [ "$SET" = "200" ] && ok "a manager can be assigned" || bad "assigning a manager answered $SET"
  LOOP=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X PATCH "$API/workspaces/$WS/members/$PEER/manager" \
    -H "$AUTH" -H 'Content-Type: application/json' -d "{\"managerId\":\"$ME\"}" || true)
  [ "$LOOP" = "400" ] && ok "a reporting loop is refused (400)" || bad "a cycle was allowed: $LOOP"
  SELFR=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X PATCH "$API/workspaces/$WS/members/$ME/manager" \
    -H "$AUTH" -H 'Content-Type: application/json' -d "{\"managerId\":\"$ME\"}" || true)
  [ "$SELFR" = "400" ] && ok "reporting to yourself is refused (400)" || bad "self-report answered $SELFR"
  for U in "$ME" "$PEER"; do
    curl -fsS --max-time 20 -X PATCH "$API/workspaces/$WS/members/$U/manager" -H "$AUTH" \
      -H 'Content-Type: application/json' -d '{"managerId":null}' >/dev/null 2>&1 || true
  done
  ok "reporting line set and cleared again"
elif [ -n "$ME" ]; then
  # A workspace of one still has to refuse the nonsense. Only the two-person
  # cases need a second person; gating these behind one meant a single-member
  # production learned nothing about the half that matters most.
  echo "  (one member — the two-person cases are skipped, the refusals are not)"
  SELFR=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X PATCH "$API/workspaces/$WS/members/$ME/manager" \
    -H "$AUTH" -H 'Content-Type: application/json' -d "{\"managerId\":\"$ME\"}" || true)
  [ "$SELFR" = "400" ] && ok "reporting to yourself is refused (400)" || bad "self-report answered $SELFR"
  OUTSIDER=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X PATCH "$API/workspaces/$WS/members/$ME/manager" \
    -H "$AUTH" -H 'Content-Type: application/json' \
    -d '{"managerId":"00000000-0000-0000-0000-000000000000"}' || true)
  [ "$OUTSIDER" = "404" ] && ok "a manager from outside the workspace is refused (404)" \
    || bad "an outsider was accepted as a manager: $OUTSIDER"
else
  bad "could not find this account on the roster — checked for $EMAIL"
fi

say "Search sort still works alongside the type filter"
for s in relevance updated created; do
  N=$(curl -fsS --max-time 25 "$API/search/$WS?q=a&sort=$s" -H "$AUTH" 2>/dev/null \
      | grep -o '"entityType"' | wc -l | tr -d ' ' || true)
  [ "${N:-0}" -gt 0 ] && ok "sort=$s returns $N hit(s)" || bad "sort=$s returned nothing"
done
BOTH=$(curl -fsS --max-time 25 "$API/search/$WS?q=a&types=task,message" -H "$AUTH" 2>/dev/null \
       | tr ',' '\n' | grep -o '"entityType":"[^"]*"' | sed 's/.*://;s/"//g' | sort -u | tr '\n' ' ' || true)
case " $BOTH " in
  *" doc "*|*" file "*|*" user "*|*" comment "*|*" channel "*)
    bad "types=task,message leaked: $BOTH" ;;
  *) ok "types=task,message returns only: ${BOTH:-（nothing matched）}" ;;
esac

say "Inbox split"
CNT=$(curl -fsS --max-time 20 "$API/notifications/counts" -H "$AUTH" 2>/dev/null || true)
printf '%s' "$CNT" | grep -q 'inbox' && ok "triage counts resolve: $CNT" || bad "counts -> $CNT"

# ─────────────────────────────── the meetings release (0092) ──────────────
say "Migration 0092 was applied"
check_sql "meetings table exists"          "SELECT to_regclass('public.meetings') IS NOT NULL;" "t"
check_sql "meeting_attendees table exists" "SELECT to_regclass('public.meeting_attendees') IS NOT NULL;" "t"
check_sql "the one-row-per-attendee index exists" \
  "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='uq_meeting_attendee_user');" "t"

# ─────────────────────────────── §2.8 SyncUp (0108–0113) ──────────────────
# The one-live-call index is checked here because its absence is SILENT: with
# it missing, start()'s ON CONFLICT DO NOTHING matches no index and simply
# inserts, so two people pressing Start SyncUp together get two live calls and
# nothing anywhere reports a problem. A fresh database is built by `push` from
# the TypeScript schema and the migration journal is then marked applied, so an
# index that lives only in 0111's SQL is an index a new deployment never gets.
#
# Every migration in this release is named below. The first version of this
# block stopped at 0111 and then 0112 and 0113 were written, so a release went
# out carrying two migrations this script did not look for — which is precisely
# the thing it exists to notice. Add the check WITH the migration.
say "Migrations 0108–0113 were applied"
check_sql "calls table exists"                "SELECT to_regclass('public.calls') IS NOT NULL;" "t"
check_sql "call_transcript_lines table exists" "SELECT to_regclass('public.call_transcript_lines') IS NOT NULL;" "t"
check_sql "call_recordings table exists"      "SELECT to_regclass('public.call_recordings') IS NOT NULL;" "t"
check_sql "the one-live-call-per-channel index exists" \
  "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='uq_calls_one_live_per_channel');" "t"
# The predicate matters as much as the name: an index on channel_id WITHOUT
# 'ended_at IS NULL' would reject a second call in a channel that has already
# finished one, which is every channel after its first SyncUp.
check_sql "and it only covers live calls" \
  "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='uq_calls_one_live_per_channel' AND indexdef ILIKE '%ended_at IS NULL%');" "t"
check_sql "one segment per storage key" \
  "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='uq_call_recordings_key');" "t"
# 0112 — without this a tie in the read-then-write for `position` is stored
# rather than rejected, and "the pieces in order" quietly becomes two pieces
# claiming to be the same one.
check_sql "one segment per place in the order (0112)" \
  "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='uq_call_recordings_position');" "t"
# 0113 — the once-a-day rule for "Contact your admin" reads this table. Missing,
# the rule finds nothing and every press mails every admin again.
check_sql "feature_flag_requests table exists (0113)" \
  "SELECT to_regclass('public.feature_flag_requests') IS NOT NULL;" "t"
check_sql "and the lookup it is read by is indexed" \
  "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='feature_flag_requests_recent_idx');" "t"

# ──────────────── §G11/§G12 message actions (0114–0115) ───────────────────
# Added WITH the migration, per the lesson two blocks up.
#
# Each of these fails silently rather than loudly if the migration is missed,
# which is the only reason they are worth a check. A missing assignments table
# turns Assign into a 500 the moment somebody presses it; a task_id that is
# still NOT NULL makes every message reminder and every /remind fail with a
# constraint error nobody can read; and the two enum labels are what the Inbox
# files these under, so without them the notification insert itself throws.
say "Message actions are on this release (0114–0115)"
check_sql "an invitation can be declined (0114)" \
  "SELECT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='invitation_status' AND e.enumlabel='declined');" "t"
check_sql "chat_message_assignments table exists (0115)" \
  "SELECT to_regclass('public.chat_message_assignments') IS NOT NULL;" "t"
check_sql "one live assignment per person per message" \
  "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='chat_message_assignments_unique');" "t"
check_sql "chat_thread_follows table exists (0115)" \
  "SELECT to_regclass('public.chat_thread_follows') IS NOT NULL;" "t"
# A reminder can now be about a message, or about nothing. If task_id is still
# NOT NULL here, the column check passes on a fresh `push` database and fails on
# a migrated one — which is exactly the split this whole block exists to catch.
check_sql "a reminder no longer requires a task" \
  "SELECT is_nullable FROM information_schema.columns WHERE table_name='reminders' AND column_name='task_id';" "YES"
check_sql "and can point at a message instead" \
  "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reminders' AND column_name='message_id');" "t"
# Nullable on both sides is not the same as unconstrained.
check_sql "but never at both at once" \
  "SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reminders_one_subject');" "t"
check_sql "the message_assigned notification kind exists" \
  "SELECT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='notification_type' AND e.enumlabel='message_assigned');" "t"
check_sql "the message_reminder notification kind exists" \
  "SELECT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='notification_type' AND e.enumlabel='message_reminder');" "t"

# G10-10 [12:21-12:24] / G10-11 [12:38-12:41] — "kisi ne mujhe comment/assign
# kiya to mujhe show ho". The two comment kinds already fired wearing another
# type; splitting them is what lets the Primary customiser offer them as
# separate rows. Schema only here — that they are actually WRITTEN is driven in
# test/e2e/task-depth.mjs, because an enum label with no emitter behind it is
# the exact defect this file exists to catch.
check_sql "the comment_assigned notification kind exists (0119)" \
  "SELECT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='notification_type' AND e.enumlabel='comment_assigned');" "t"
check_sql "the comment_resolved notification kind exists (0119)" \
  "SELECT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='notification_type' AND e.enumlabel='comment_resolved');" "t"
check_sql "the subtask_created notification kind exists (0119)" \
  "SELECT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='notification_type' AND e.enumlabel='subtask_created');" "t"

# ────────────────── §G08 [08:37] unread, split by workspace ───────────────
# The switcher's dot. Checked against the bell's own total as well as for its
# own sake: two counts of "unread" that disagree are worse than one, and the
# split must never exceed the total it is a split of.
say "Unread is available per workspace"
UBW=$(curl -fsS --max-time 20 "$API/notifications/unread-by-workspace" -H "$AUTH" 2>/dev/null || true)
printf '%s' "$UBW" | grep -q '"data"' \
  && ok "the per-workspace unread map answers" \
  || bad "unread-by-workspace -> $(printf '%s' "$UBW" | head -c 140)"
TOTAL=$(curl -fsS --max-time 20 "$API/notifications/unread-count" -H "$AUTH" 2>/dev/null | jget count)
# The COUNTS, not every digit in the payload.
#
# This read `grep -oE '[0-9]+'` and summed everything it found — including the
# digits inside each workspace UUID, so one workspace with 537 unread summed to
# 31,355. It passed on an earlier release only because the map was empty then:
# no entries, no digits, sum zero. A check that passes because there is nothing
# to check is the failure mode this whole file exists to avoid.
#
# The shape is {"data":{"<uuid>":537},...}, and a UUID contains no colon, so a
# colon followed by digits is a count and nothing else.
SUMMED=$(printf '%s' "$UBW" | grep -oE ':[0-9]+' | tr -d ':' | awk '{s+=$1} END {print s+0}')
ENTRIES=$(printf '%s' "$UBW" | grep -oE ':[0-9]+' | wc -l | tr -d ' ')
if [ "${ENTRIES:-0}" -eq 0 ] 2>/dev/null; then
  # Said out loud rather than counted as a pass: nothing was compared.
  ok "SKIP nothing unread anywhere, so there is no split to compare (not checked)"
elif [ -n "$TOTAL" ] && [ "$SUMMED" -le "$TOTAL" ] 2>/dev/null; then
  ok "and never exceeds the bell's own total ($SUMMED <= $TOTAL across $ENTRIES workspace(s))"
else
  bad "the split ($SUMMED) exceeds the bell total ($TOTAL) — they disagree on what unread means"
fi

# ─────────────────────────── §G01 [00:18] declining an invite ─────────────
# Declining is the RECIPIENT saying no, and it is deliberately not the same
# status as `revoked` (the sender cancelling). It also must not require an
# account: whoever is declining is precisely the person who was never going to
# make one.
say "An invitation can be declined"
INV=$(curl -fsS --max-time 20 -X POST "$API/invitations" -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"decline-check-$$@rundesk.invalid\",\"workspaceId\":\"$WS\",\"role\":\"member\"}" 2>/dev/null || true)
ITOK=$(printf '%s' "$INV" | jget token)
if [ -n "$ITOK" ]; then
  ok "an invitation can be raised to decline"
  # No Authorization header on purpose.
  DEC=$(curl -fsS --max-time 20 -X POST "$API/invitations/decline" \
    -H 'Content-Type: application/json' -d "{\"token\":\"$ITOK\"}" 2>/dev/null || true)
  printf '%s' "$DEC" | grep -q 'declined' \
    && ok "and declined without signing in" \
    || bad "decline -> $(printf '%s' "$DEC" | head -c 140)"
  AGAIN=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X POST "$API/invitations/decline" \
    -H 'Content-Type: application/json' -d "{\"token\":\"$ITOK\"}" 2>/dev/null || true)
  [ "$AGAIN" = "200" ] \
    && ok "declining twice is somebody making sure, not an error" \
    || bad "second decline -> $AGAIN"
  GONE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$API/invitations/preview?token=$ITOK" 2>/dev/null || true)
  [ "$GONE" = "410" ] \
    && ok "and a declined invitation can no longer be claimed" \
    || bad "preview after decline -> $GONE (expected 410)"
else
  bad "could not create an invitation to decline -> $(printf '%s' "$INV" | head -c 140)"
fi

# ────────────── §G11 [15:36]/[15:19] assign and remind, for real ──────────
# The table checks above prove the migration ran. They cannot tell the
# difference between a working feature and four routes returning 500, which is
# what "Assign" was before this release: a button that appended a mention to
# the composer and told nobody anything.
say "A message can be assigned, and remembered"
CHN=$(curl -fsS --max-time 20 -X POST "$API/workspaces/$WS/chat/channels" -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"release-check-$$\",\"description\":\"deploy check\"}" 2>/dev/null || true)
CHID=$(printf '%s' "$CHN" | jget id)
if [ -n "$CHID" ]; then
  MSG=$(curl -fsS --max-time 20 -X POST "$API/chat/channels/$CHID/messages" -H "$AUTH" \
    -H 'Content-Type: application/json' -d '{"body":"deploy check: assign me"}' 2>/dev/null || true)
  MSGID=$(printf '%s' "$MSG" | jget id)
  if [ -n "$MSGID" ]; then
    ok "a message can be posted to assign"
    ASG=$(curl -fsS --max-time 20 -X POST "$API/chat/messages/$MSGID/assign" -H "$AUTH" \
      -H 'Content-Type: application/json' -d "{\"assigneeId\":\"$ME\"}" 2>/dev/null || true)
    printf '%s' "$ASG" | grep -q "$ME" \
      && ok "and assigned to somebody" \
      || bad "assign -> $(printf '%s' "$ASG" | head -c 140)"
    MINE=$(curl -fsS --max-time 20 "$API/workspaces/$WS/chat/assigned-to-me" -H "$AUTH" 2>/dev/null || true)
    printf '%s' "$MINE" | grep -q "$MSGID" \
      && ok "and it reaches the assignee's own list" \
      || bad "assigned-to-me -> $(printf '%s' "$MINE" | head -c 140)"
    # Resolved, not deleted: who did it is a fact worth keeping.
    RES=$(curl -fsS --max-time 20 -X PATCH "$API/chat/messages/$MSGID/assign/$ME" -H "$AUTH" \
      -H 'Content-Type: application/json' -d '{"resolved":true}' 2>/dev/null || true)
    printf '%s' "$RES" | grep -q 'resolvedAt' \
      && ok "and can be marked done" \
      || bad "resolve -> $(printf '%s' "$RES" | head -c 140)"
    # The reminder that could not exist before 0115: no task behind it.
    WHEN=$(date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+1H +%Y-%m-%dT%H:%M:%SZ)
    REM=$(curl -fsS --max-time 20 -X POST "$API/chat/messages/$MSGID/remind" -H "$AUTH" \
      -H 'Content-Type: application/json' -d "{\"remindAt\":\"$WHEN\",\"note\":\"deploy check\"}" 2>/dev/null || true)
    printf '%s' "$REM" | grep -q "$MSGID" \
      && ok "a reminder can hang off the message itself" \
      || bad "message reminder -> $(printf '%s' "$REM" | head -c 140)"
    # §G12 — the per-thread stance persists and reads back.
    curl -fsS --max-time 20 -X PUT "$API/chat/messages/$MSGID/thread-follow" -H "$AUTH" \
      -H 'Content-Type: application/json' -d '{"state":"muted"}' >/dev/null 2>&1 || true
    TF=$(curl -fsS --max-time 20 "$API/chat/messages/$MSGID/thread-follow" -H "$AUTH" 2>/dev/null || true)
    printf '%s' "$TF" | grep -q 'muted' \
      && ok "a single thread can be muted, and stays muted" \
      || bad "thread-follow -> $(printf '%s' "$TF" | head -c 140)"
  else
    bad "could not post a message to assign -> $(printf '%s' "$MSG" | head -c 140)"
  fi
  # Leave the instance as it was found.
  curl -fsS --max-time 20 -X POST "$API/chat/channels/$CHID/archive" -H "$AUTH" >/dev/null 2>&1 || true
else
  bad "could not create a channel for the assign check -> $(printf '%s' "$CHN" | head -c 140)"
fi

# ─────────────── §G15 [23:16] a tag that can reach a task ────────────────
# The endpoints below all existed before this release and all returned 200.
# What did not exist was any caller: no component in the web app touched
# `/labels/` outside Workspace Settings, so tags were write-only and could
# never reach a task. These check the two things that are new — an idempotent
# create, because "type and press Enter" hits the same name constantly, and the
# round trip onto a task.
say "A tag can be created and put on a task"
TAG_NAME="release-check-$$"
TAG=$(curl -fsS --max-time 20 -X POST "$API/workspaces/$WS/labels" -H "$AUTH" \
  -H 'Content-Type: application/json' -d "{\"name\":\"$TAG_NAME\",\"color\":\"#7c3aed\"}" 2>/dev/null || true)
TAGID=$(printf '%s' "$TAG" | jget id)
if [ -n "$TAGID" ]; then
  ok "a tag can be created"
  # Same name again. Before this release the unique index made it a 500, which
  # is what somebody tagging a second task with a tag they already made gets.
  AGAIN_TAG=$(curl -fsS --max-time 20 -X POST "$API/workspaces/$WS/labels" -H "$AUTH" \
    -H 'Content-Type: application/json' -d "{\"name\":\"$TAG_NAME\",\"color\":\"#2563eb\"}" 2>/dev/null || true)
  [ "$(printf '%s' "$AGAIN_TAG" | jget id)" = "$TAGID" ] \
    && ok "and creating it again hands back the same tag" \
    || bad "second create -> $(printf '%s' "$AGAIN_TAG" | head -c 140)"
  UPPER=$(curl -fsS --max-time 20 -X POST "$API/workspaces/$WS/labels" -H "$AUTH" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"$(printf '%s' "$TAG_NAME" | tr '[:lower:]' '[:upper:]')\",\"color\":\"#059669\"}" 2>/dev/null || true)
  [ "$(printf '%s' "$UPPER" | jget id)" = "$TAGID" ] \
    && ok "ignoring case, so the list is not a spelling test" \
    || bad "upper-case create made a second tag -> $(printf '%s' "$UPPER" | head -c 140)"
  # A task of this check's own.
  #
  # This used `$TID`, which is a TASK TYPE id — and one deleted two hundred
  # lines earlier at that. Attaching a label to a dead task-type UUID is a 404,
  # correctly, and the check reported it as the tag feature being broken. The
  # tag round trip needs a task, so it makes one.
  TAG_TASK=""
  if [ -n "$LID" ]; then
    TAG_TASK=$(curl -fsS --max-time 20 -X POST "$API/tasks" -H "$AUTH" \
      -H 'Content-Type: application/json' \
      -d "{\"listId\":\"$LID\",\"title\":\"deploy check — tag me\"}" 2>/dev/null | jget id || true)
  fi
  if [ -n "$TAG_TASK" ]; then
    ok "a task exists to tag"
    ATT=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X POST "$API/tasks/$TAG_TASK/labels/$TAGID" -H "$AUTH" 2>/dev/null || true)
    { [ "$ATT" = "201" ] || [ "$ATT" = "200" ]; } \
      && ok "and it can be put on a task" \
      || bad "attach -> $ATT"
    curl -fsS --max-time 20 "$API/tasks/$TAG_TASK" -H "$AUTH" 2>/dev/null | grep -q "$TAGID" \
      && ok "and the task carries it back" \
      || bad "the task does not report the tag it was given"
    curl -fsS --max-time 20 -X DELETE "$API/tasks/$TAG_TASK/labels/$TAGID" -H "$AUTH" >/dev/null 2>&1 || true
    curl -fsS --max-time 20 -X DELETE "$API/tasks/$TAG_TASK" -H "$AUTH" >/dev/null 2>&1 || true
  else
    bad "no list available to create a task to tag"
  fi
  curl -fsS --max-time 20 -X DELETE "$API/labels/$TAGID" -H "$AUTH" >/dev/null 2>&1 || true
else
  bad "could not create a tag -> $(printf '%s' "$TAG" | head -c 140)"
fi

# ───────── §1.3 [10:13] the second-level panel remembers (0116) ──────────
# The collapse itself is a browser concern and is checked there. What has to be
# true HERE is that the preference survives the round trip — a panel that
# collapses and forgets is the complaint she made, not the fix. Validation is
# checked too: this is a jsonb column fed from a request body.
say "The second-level panels remember their collapse"
check_sql "users.panels_collapsed exists (0116)" \
  "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='panels_collapsed');" "t"
PC=$(curl -fsS --max-time 20 -X PATCH "$API/users/me" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"panelsCollapsed":{"chat":true,"docs":false}}' 2>/dev/null || true)
printf '%s' "$PC" | grep -q '"chat":true' \
  && ok "a collapsed panel can be saved" \
  || bad "panelsCollapsed -> $(printf '%s' "$PC" | head -c 140)"
curl -fsS --max-time 20 "$API/users/me" -H "$AUTH" 2>/dev/null | grep -q '"chat":true' \
  && ok "and survives a fresh read, so it follows the person" \
  || bad "panelsCollapsed did not survive a re-read"
JUNK=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X PATCH "$API/users/me" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"panelsCollapsed":{"chat":true,"evil":"payload"}}' 2>/dev/null || true)
[ "$JUNK" = "400" ] \
  && ok "an unknown panel key is refused, not stored" \
  || bad "arbitrary jsonb accepted onto a user row -> $JUNK"
# Leave the deploy-check account as it was found.
curl -fsS --max-time 20 -X PATCH "$API/users/me" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"panelsCollapsed":{}}' >/dev/null 2>&1 || true

# ─────────── §G15 [21:36] the create modal's three new subjects ───────────
# A reminder with no task is the one that could not exist before 0115.
say "Reminder, whiteboard and dashboard can be created"
R_WHEN=$(date -u -d '+2 hours' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+2H +%Y-%m-%dT%H:%M:%SZ)
SR=$(curl -fsS --max-time 20 -X POST "$API/workspaces/$WS/reminders" -H "$AUTH" \
  -H 'Content-Type: application/json' -d "{\"remindAt\":\"$R_WHEN\",\"note\":\"deploy check\"}" 2>/dev/null || true)
printf '%s' "$SR" | jget id | grep -q . \
  && ok "a reminder needs no task to exist" \
  || bad "standalone reminder -> $(printf '%s' "$SR" | head -c 140)"
WB=$(curl -fsS --max-time 20 -X POST "$API/workspaces/$WS/canvases" -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"type":"whiteboard","title":"deploy check board","data":{"items":[]}}' 2>/dev/null || true)
WBID=$(printf '%s' "$WB" | jget id)
[ -n "$WBID" ] \
  && ok "a whiteboard can be created from anywhere" \
  || bad "whiteboard -> $(printf '%s' "$WB" | head -c 140)"
DB=$(curl -fsS --max-time 20 -X POST "$API/dashboards" -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d "{\"workspaceId\":\"$WS\",\"name\":\"deploy check dashboard\",\"layout\":[]}" 2>/dev/null || true)
DBID=$(printf '%s' "$DB" | jget id)
[ -n "$DBID" ] \
  && ok "and so can a dashboard" \
  || bad "dashboard -> $(printf '%s' "$DB" | head -c 140)"
[ -n "$WBID" ] && curl -fsS --max-time 20 -X DELETE "$API/workspaces/$WS/canvases/$WBID" -H "$AUTH" >/dev/null 2>&1
[ -n "$DBID" ] && curl -fsS --max-time 20 -X DELETE "$API/dashboards/$DBID" -H "$AUTH" >/dev/null 2>&1

# ────────── §G06 [06:42–07:39] status, timed mute, contrast, call ────────
# Four columns and one enum-ish field, all added in 0117. Each fails silently
# rather than loudly without the migration: the status endpoint 500s on a
# column that is not there, and the timed mute simply never suppresses.
say "The settings menu can do what she walked through (0117)"
check_sql "users.status_text exists (0117)" \
  "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='status_text');" "t"
check_sql "users.status_expires_at exists — a status that ends" \
  "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='status_expires_at');" "t"
check_sql "users.dnd_until exists — a mute that ends" \
  "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='dnd_until');" "t"
check_sql "users.high_contrast exists" \
  "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='high_contrast');" "t"
check_sql "support_tickets.kind exists — a ticket can be a call" \
  "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='kind');" "t"

ST=$(curl -fsS --max-time 20 -X PUT "$API/presence/me/status" -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"emoji":"☕","text":"deploy check","expiresAt":"'"$(date -u -d '+30 minutes' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+30M +%Y-%m-%dT%H:%M:%SZ)"'"}' 2>/dev/null || true)
printf '%s' "$ST" | grep -q 'deploy check' \
  && ok "a custom status can be set" \
  || bad "status -> $(printf '%s' "$ST" | head -c 140)"
# Teammates are the audience; a status only the author can see is nothing.
curl -fsS --max-time 20 "$API/workspaces/$WS/presence" -H "$AUTH" 2>/dev/null | grep -q 'deploy check' \
  && ok "and teammates reading presence see it" \
  || bad "the status did not reach the workspace presence read"
curl -fsS --max-time 20 -X PUT "$API/presence/me/status" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"emoji":null,"text":null}' >/dev/null 2>&1 || true

MU=$(curl -fsS --max-time 20 -X POST "$API/notifications/mute" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"minutes":30}' 2>/dev/null || true)
printf '%s' "$MU" | grep -q 'mutedUntil' \
  && ok "notifications can be muted for a duration" \
  || bad "mute -> $(printf '%s' "$MU" | head -c 140)"
FOREVER=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X POST "$API/notifications/mute" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"minutes":43200}' 2>/dev/null || true)
[ "$FOREVER" = "400" ] \
  && ok "but not for a month — that is a preference, not a mute" \
  || bad "a month-long mute was accepted -> $FOREVER"
curl -fsS --max-time 20 -X POST "$API/notifications/mute" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"minutes":null}' >/dev/null 2>&1 || true

CALL=$(curl -fsS --max-time 20 -X POST "$API/support/tickets" -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"workspaceId":"'"$WS"'","subject":"deploy check call","kind":"call","requestedSlots":["'"$(date -u -d '+2 days' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+2d +%Y-%m-%dT%H:%M:%SZ)"'"]}' 2>/dev/null || true)
printf '%s' "$CALL" | grep -q '"kind":"call"' \
  && ok "Help can ask the team for a call" \
  || bad "call request -> $(printf '%s' "$CALL" | head -c 140)"
EMPTY=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X POST "$API/support/tickets" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"workspaceId":"'"$WS"'","subject":"no times","kind":"call","requestedSlots":[]}' 2>/dev/null || true)
[ "$EMPTY" = "400" ] \
  && ok "and a call with no times offered is refused" \
  || bad "a call with no times was accepted -> $EMPTY"

# ───────────── §G06 [05:35–06:35] the person profile panel (0118) ─────────
# The panel itself is a browser concern and checked there. What has to be true
# here is that the reads behind it answer — and that priorities, the only new
# data, are readable by a colleague and writable only by their owner.
say "A person's profile can be read (0118)"
check_sql "user_priorities table exists (0118)" \
  "SELECT to_regclass('public.user_priorities') IS NOT NULL;" "t"
check_sql "and a task cannot be a priority twice" \
  "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='user_priorities_unique_task');" "t"
# Partial, so typed lines may repeat — "chase the invoice" twice in a week is
# somebody doing it twice, not a duplicate.
check_sql "only for the rows that point at a task" \
  "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='user_priorities_unique_task' AND indexdef ILIKE '%task_id IS NOT NULL%');" "t"

PROF=$(curl -fsS --max-time 20 "$API/workspaces/$WS/people/$ME" -H "$AUTH" 2>/dev/null || true)
printf '%s' "$PROF" | grep -q '"person"' \
  && ok "a profile answers" \
  || bad "profile -> $(printf '%s' "$PROF" | head -c 140)"
# §G06 [05:46] — the column the roster read never selected, so no surface could
# show a colleague's local time even though the app knew it.
printf '%s' "$PROF" | grep -q '"timezone"' \
  && ok "carrying the timezone a local clock needs" \
  || bad "the profile does not carry a timezone"
printf '%s' "$PROF" | grep -q '"reporting"' \
  && ok "and the person's own reporting line" \
  || bad "the profile does not carry a reporting line"
curl -fsS --max-time 20 "$API/workspaces/$WS/people/$ME/activity" -H "$AUTH" 2>/dev/null | grep -q '"data"' \
  && ok "activity can be asked for by WHO did it" \
  || bad "activity-by-actor did not answer"
curl -fsS --max-time 20 "$API/workspaces/$WS/people/$ME/calendar" -H "$AUTH" 2>/dev/null | grep -q '"meetings"' \
  && ok "and a person has a calendar" \
  || bad "the person calendar did not answer"

PR=$(curl -fsS --max-time 20 -X POST "$API/workspaces/$WS/priorities" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"title":"deploy check priority"}' 2>/dev/null || true)
PRID=$(printf '%s' "$PR" | jget id)
if [ -n "$PRID" ]; then
  ok "a typed line can be a priority — no task required"
  NOTHING=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X POST "$API/workspaces/$WS/priorities" -H "$AUTH" \
    -H 'Content-Type: application/json' -d '{}' 2>/dev/null || true)
  [ "$NOTHING" = "400" ] \
    && ok "but a priority about nothing is refused" \
    || bad "an empty priority was accepted -> $NOTHING"
  curl -fsS --max-time 20 -X DELETE "$API/workspaces/$WS/priorities/$PRID" -H "$AUTH" >/dev/null 2>&1 || true
else
  bad "priority -> $(printf '%s' "$PR" | head -c 140)"
fi

say "A meeting is a record, not a link"
MT=$(curl -fsS --max-time 20 -X POST "$API/workspaces/$WS/meetings" -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Deploy check meeting","notes":"Someone must ship the thing by Friday.","recordingUrl":"https://example.invalid/rec.mp4"}' 2>/dev/null || true)
MID=$(printf '%s' "$MT" | jget id)
if [ -n "$MID" ]; then ok "a meeting can be recorded"; else bad "create -> $MT"; fi
if [ -n "$MID" ]; then
  printf '%s' "$MT" | grep -q 'example.invalid' \
    && ok "the recording link is kept" || bad "recordingUrl was dropped on create"
  BACK=$(curl -fsS --max-time 20 "$API/workspaces/$WS/meetings/$MID" -H "$AUTH" 2>/dev/null || true)
  printf '%s' "$BACK" | grep -q 'by Friday' \
    && ok "the notes survive being read back" || bad "notes lost -> $BACK"
  printf '%s' "$BACK" | grep -q '"attendees"' \
    && ok "it carries an attendee list" || bad "no attendees on the record"
  # Refusal: a meeting with nothing written down must say so rather than
  # answering "no action items", which reads as a working extraction.
  EMPTY=$(curl -fsS --max-time 20 -X POST "$API/workspaces/$WS/meetings" -H "$AUTH" \
    -H 'Content-Type: application/json' -d '{"title":"Deploy check empty"}' 2>/dev/null || true)
  EID=$(printf '%s' "$EMPTY" | jget id)
  if [ -n "$EID" ]; then
    CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 -X POST \
      "$API/workspaces/$WS/meetings/$EID/action-items" -H "$AUTH" \
      -H 'Content-Type: application/json' -d '{}' || true)
    [ "$CODE" = "400" ] && ok "a meeting with no notes is refused (400)" \
      || bad "an empty meeting answered $CODE instead of refusing"
    curl -sS -o /dev/null --max-time 20 -X DELETE "$API/workspaces/$WS/meetings/$EID" -H "$AUTH" || true
  fi
  curl -sS -o /dev/null --max-time 20 -X DELETE "$API/workspaces/$WS/meetings/$MID" -H "$AUTH" || true
  ok "and deleted again"
fi

say "The DM Calendar and Tasks tabs have a source"
if [ -n "$PEER" ]; then
  SH=$(curl -fsS --max-time 20 "$API/workspaces/$WS/people/$PEER/shared" -H "$AUTH" 2>/dev/null || true)
  printf '%s' "$SH" | grep -q '"meetings"' && printf '%s' "$SH" | grep -q '"tasks"' \
    && ok "shared-with answers with both halves" || bad "shared -> $SH"
  SELF=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 \
    "$API/workspaces/$WS/people/$ME/shared" -H "$AUTH" || true)
  [ "$SELF" = "400" ] && ok "asking what you share with yourself is refused (400)" \
    || bad "self-share answered $SELF"
  STRANGER=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 \
    "$API/workspaces/$WS/people/00000000-0000-0000-0000-000000000000/shared" -H "$AUTH" || true)
  [ "$STRANGER" = "404" ] && ok "someone outside the workspace is 404, not an empty answer" \
    || bad "a stranger answered $STRANGER"
elif [ -n "$ME" ]; then
  echo "  (one member — no pair to share with, but the refusals still apply)"
  SELF=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 \
    "$API/workspaces/$WS/people/$ME/shared" -H "$AUTH" || true)
  [ "$SELF" = "400" ] && ok "asking what you share with yourself is refused (400)" \
    || bad "self-share answered $SELF"
  STRANGER=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 \
    "$API/workspaces/$WS/people/00000000-0000-0000-0000-000000000000/shared" -H "$AUTH" || true)
  [ "$STRANGER" = "404" ] && ok "someone outside the workspace is 404, not an empty answer" \
    || bad "a stranger answered $STRANGER"
  # The route itself has to be mounted even with nobody to pair with. A 404
  # here would mean the whole endpoint is missing, which reads identically to
  # "no second member" unless it is checked separately.
  [ "$SELF" != "404" ] && ok "the shared route is mounted (not 404)" \
    || bad "the shared route appears to be missing entirely"
else
  bad "could not find this account on the roster — checked for $EMAIL"
fi

say "No task carries a password hash"
# The fix that stopped assignees, watchers and comment authors from dragging
# users.password_hash out through GET /tasks/:id. Checked here because a leak
# is not something to learn about from a customer.
TL=$(curl -fsS --max-time 20 "$API/tasks/workspace/$WS/timeline" -H "$AUTH" 2>/dev/null || true)
TASK_ID=$(printf '%s' "$TL" | grep -o '"id":"[0-9a-f-]\{36\}"' | head -1 | sed 's/.*://;s/"//g' || true)
if [ -n "$TASK_ID" ]; then
  FULL=$(curl -fsS --max-time 20 "$API/tasks/$TASK_ID" -H "$AUTH" 2>/dev/null || true)
  case "$FULL" in
    *passwordHash*|*password_hash*) bad "a password hash came back on GET /tasks/$TASK_ID" ;;
    "") bad "could not read a task back to check it" ;;
    *) ok "an embedded user carries no password hash" ;;
  esac
  # Prove the payload really does embed users, or the check above passes on a
  # response that never had the chance to leak.
  case "$FULL" in
    *'"assignees"'*|*'"creator"'*|*'"watchers"'*) ok "and the payload does embed user rows (so that was a real test)" ;;
    *) bad "no embedded users in the task payload — the leak check proved nothing" ;;
  esac
else
  printf '  \033[2mSKIP\033[0m no task in this workspace to read back\n'
fi

say "Meeting notes become tasks that name their meeting"
AI_OK=$(curl -fsS --max-time 20 "$API/ai/status" -H "$AUTH" 2>/dev/null | grep -o '"available":[a-z]*' | sed 's/.*://' || true)
if [ "$AI_OK" != "true" ]; then
  printf '  \033[2mSKIP\033[0m AI is not configured on this deploy (ai/status says available=%s)\n' "${AI_OK:-unknown}"
else
  TARGET=$(curl -fsS --max-time 20 "$API/spaces/workspace/$WS" -H "$AUTH" 2>/dev/null \
    | grep -o '"id":"[0-9a-f-]\{36\}"' | head -1 | sed 's/.*://;s/"//g' || true)
  TPROJ=$(curl -fsS --max-time 20 "$API/projects/space/$TARGET" -H "$AUTH" 2>/dev/null \
    | grep -o '"id":"[0-9a-f-]\{36\}"' | head -1 | sed 's/.*://;s/"//g' || true)
  TLIST=$(curl -fsS --max-time 20 "$API/lists/project/$TPROJ" -H "$AUTH" 2>/dev/null \
    | grep -o '"id":"[0-9a-f-]\{36\}"' | head -1 | sed 's/.*://;s/"//g' || true)
  if [ -z "$TLIST" ]; then
    printf '  \033[2mSKIP\033[0m no list in this workspace to create action items in\n'
  else
    AM=$(curl -fsS --max-time 20 -X POST "$API/workspaces/$WS/meetings" -H "$AUTH" \
      -H 'Content-Type: application/json' \
      -d '{"title":"Deploy check extraction","notes":"Ali must write the migration by Thursday. Sara must review the export path on Friday."}' 2>/dev/null || true)
    AMID=$(printf '%s' "$AM" | jget id)
    if [ -n "$AMID" ]; then
      RES=$(curl -fsS --max-time 120 -X POST "$API/workspaces/$WS/meetings/$AMID/action-items" -H "$AUTH" \
        -H 'Content-Type: application/json' -d "{\"createIn\":\"$TLIST\"}" 2>/dev/null || true)
      NEW_ID=$(printf '%s' "$RES" | grep -o '"created":\[{"id":"[0-9a-f-]\{36\}"' | sed 's/.*"id":"//;s/"//' || true)
      if [ -n "$NEW_ID" ]; then
        ok "the notes became real tasks"
        MADE=$(curl -fsS --max-time 20 "$API/tasks/$NEW_ID" -H "$AUTH" 2>/dev/null || true)
        printf '%s' "$MADE" | grep -q 'From meeting: Deploy check extraction' \
          && ok "and each one says which meeting it came from" \
          || bad "the task does not name its meeting"
        curl -sS -o /dev/null --max-time 20 -X DELETE "$API/tasks/$NEW_ID" -H "$AUTH" || true
      else
        bad "extraction created nothing -> $(printf '%s' "$RES" | head -c 200)"
      fi
      curl -sS -o /dev/null --max-time 20 -X DELETE "$API/workspaces/$WS/meetings/$AMID" -H "$AUTH" || true
    else
      bad "could not create the meeting to extract from -> $AM"
    fi
  fi
fi

say "The web build that shipped contains this release's UI"
# The API and the SPA are built separately, and a stale dist is the failure
# mode that leaves every endpoint green while the browser shows yesterday's
# app. Reads the built bundle rather than asking the browser, which cannot be
# reached from here.
DIST="apps/web/dist"
if [ ! -d "$DIST" ]; then
  bad "no $DIST — the SPA was not built by this deploy"
else
  for NEEDLE in "Meeting record" "does not transcribe" "Open tasks with" "Meetings with" \
                "Ask AI about this draft" "Link a task, doc or channel"; do
    if grep -rqF "$NEEDLE" "$DIST" 2>/dev/null; then
      ok "the bundle contains \"$NEEDLE\""
    else
      bad "\"$NEEDLE\" is missing from the shipped bundle — the SPA looks stale"
    fi
  done
  NEWEST=$(find "$DIST" -name '*.js' -newermt '-1 day' 2>/dev/null | head -1 || true)
  [ -n "$NEWEST" ] && ok "and it was built within the last day" \
    || bad "no bundle file is newer than a day — this dist predates the deploy"
fi

say "A work day outside 1–7 is refused, not silently dropped"
# JavaScript's getDay() calls Sunday 0. Accepting it and discarding it returns a
# 200 and a schedule the caller did not ask for, which surfaces much later as
# Workload capacity nobody can explain.
BEFORE=$(curl -fsS --max-time 20 "$API/workspaces/$WS/work-schedule" -H "$AUTH" 2>/dev/null || true)
for BAD_DAYS in '[1,2,0]' '[1,2,8]'; do
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X PATCH \
    "$API/workspaces/$WS/work-schedule" -H "$AUTH" \
    -H 'Content-Type: application/json' -d "{\"workDays\":$BAD_DAYS}" || true)
  [ "$CODE" = "400" ] && ok "workDays=$BAD_DAYS refused (400)" \
    || bad "workDays=$BAD_DAYS answered $CODE — the day was discarded silently"
done
AFTER=$(curl -fsS --max-time 20 "$API/workspaces/$WS/work-schedule" -H "$AUTH" 2>/dev/null || true)
[ "$BEFORE" = "$AFTER" ] && ok "and the schedule is unchanged by the rejected calls" \
  || bad "a rejected call still modified the schedule"

# ---------------------------------------------------------------------------
say "The top bar is a member preference, bell off by default (§1.5)"
ME=$(curl -fsS --max-time 20 "$API/users/me" -H "$AUTH" 2>/dev/null || true)
printf '%s' "$ME" | grep -q 'topbarHidden' \
  && ok "the profile carries a top bar preference" \
  || bad "no topbarHidden on /users/me -> $(printf '%s' "$ME" | head -c 160)"
printf '%s' "$ME" | grep -o '"topbarHidden":\[[^]]*\]' | grep -q 'notifications' \
  && ok "and the bell starts hidden" \
  || bad "the bell is not hidden by default -> $(printf '%s' "$ME" | grep -o '"topbarHidden":\[[^]]*\]')"
BADITEM=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X PATCH "$API/users/me" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"topbarHidden":["search"]}' || true)
[ "$BADITEM" = "400" ] \
  && ok "an unknown top bar item is refused (400)" \
  || bad "topbarHidden=[search] answered $BADITEM — arbitrary values reach a jsonb column"

say "Archived work is still findable, and Drive is offered (her items 2 and 4)"
# Two of her seventeen had no check anywhere. Both turned out to be built —
# which is exactly why they needed one: "it works" and "we know it works" are
# different claims, and only the second survives somebody editing the search
# filters six months from now.
ARCH_SPACE=$(curl -fsS --max-time 20 "$API/spaces/workspace/$WS" -H "$AUTH" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*://;s/"//g' || true)
ARCH_PROJ=$(curl -fsS --max-time 20 "$API/projects/space/$ARCH_SPACE" -H "$AUTH" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*://;s/"//g' || true)
ARCH_LIST=$(curl -fsS --max-time 20 "$API/lists/project/$ARCH_PROJ" -H "$AUTH" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*://;s/"//g' || true)
if [ -z "$ARCH_LIST" ]; then
  bad "no list to seed the archived-search probe in"
else
  ARCH_NEEDLE="deploycheck$(date +%s)"
  ARCH_TID=$(curl -fsS --max-time 20 -X POST "$API/tasks" -H "$AUTH" -H 'content-type: application/json' \
    -d "{\"listId\":\"$ARCH_LIST\",\"title\":\"$ARCH_NEEDLE archived probe\"}" | jget id)
  sleep 2
  # Findable while it is alive — otherwise the two checks below both "pass"
  # against a task the index never had, which proves nothing at all.
  curl -fsS --max-time 20 "$API/search/$WS?q=$ARCH_NEEDLE&types=task" -H "$AUTH" | grep -q "$ARCH_TID" \
    && ok "a live task is findable (so the checks below mean something)" \
    || bad "the seeded task was never findable — the archived checks prove nothing"

  curl -fsS --max-time 20 -X DELETE "$API/tasks/$ARCH_TID" -H "$AUTH" >/dev/null 2>&1 || true
  sleep 2
  if curl -fsS --max-time 20 "$API/search/$WS?q=$ARCH_NEEDLE&types=task" -H "$AUTH" | grep -q "$ARCH_TID"; then
    bad "archived work shows up in an ordinary search unasked"
  else
    ok "an archived task is hidden from an ordinary search"
  fi
  # §2 — "archived cheezein bhi search mein".
  curl -fsS --max-time 20 "$API/search/$WS?q=$ARCH_NEEDLE&types=task&includeArchived=true" -H "$AUTH" | grep -q "$ARCH_TID" \
    && ok "and comes back with includeArchived" \
    || bad "includeArchived does not bring an archived task back"
  curl -fsS --max-time 20 -X DELETE "$API/workspaces/$WS/trash/task/$ARCH_TID" -H "$AUTH" >/dev/null 2>&1 || true
fi

# The Meili post-filter queries Postgres by task id. A Meili document id is
# `task-<uuid>`, not a uuid, so handing it over unstripped is a 22P02 and a 400
# for the whole search. That only bites a caller the filter actually runs for,
# which is why it needs asking as somebody who is NOT a manager.
PEER_LOGIN=$(curl -fsS --max-time 20 -X POST "$API/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"${PEER_EMAIL:-org-admin@rundesk.internal}\",\"password\":\"${PEER_PASSWORD:-OrgAdmin@123!}\"}" 2>/dev/null || true)
PEER_TOKEN=$(printf '%s' "$PEER_LOGIN" | jget accessToken)
if [ -z "$PEER_TOKEN" ]; then
  ok "no second account here, so the non-manager search path was not exercised"
else
  PEER_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
    "$API/search/$WS?q=zzsearchprobe&types=task" -H "authorization: Bearer $PEER_TOKEN" || true)
  [ "$PEER_CODE" = "200" ] \
    && ok "search answers for a non-manager, not a 400 from the visibility filter" \
    || bad "search answered $PEER_CODE for a non-manager — the Meili id/uuid path"
fi

# §4 — "Google Drive … link kar ke drive se bhi search results aayein."
DRIVE_PROVIDERS=$(curl -fsS --max-time 20 "$API/workspaces/$WS/integrations/connections/providers" -H "$AUTH" || true)
printf '%s' "$DRIVE_PROVIDERS" | grep -q 'google-drive' \
  && ok "Google Drive is offered as a connectable provider" \
  || bad "Google Drive is not in the provider catalog: $(printf '%s' "$DRIVE_PROVIDERS" | head -c 160)"
printf '%s' "$(curl -fsS --max-time 20 "$API/search/$WS?q=zzz&types=drive" -H "$AUTH" -o /dev/null -w '%{http_code}')" | grep -q '200' \
  && ok "and search accepts drive as an entity type" \
  || bad "the drive entity type is refused by search"
# Whether it is CONNECTED is a deployment fact, not a build one. Said out loud
# either way, so a run never quietly implies Drive results are flowing.
DRIVE_STATUS=$(curl -fsS --max-time 20 "$API/workspaces/$WS/integrations/connections/providers/status" -H "$AUTH" || true)
DRIVE_REASON=$(printf '%s' "$DRIVE_STATUS" | grep -o '"provider":"google-drive"[^}]*' | head -1)
case "$DRIVE_REASON" in
  *'"available":true'*) ok "and this deployment has Drive credentials configured" ;;
  *)                    ok "Drive is built but not credentialled here — ${DRIVE_REASON:-no status reported}" ;;
esac

say "A task in the bin is not an editable task"
# The third video1 pass found PATCH answering 200 and a comment answering 201
# on a task in the bin — a row no list, no search and no deep link will show
# you. Deleting is a soft delete and every READ path filtered on it; the write
# paths never did. Checked here because the callers who could still reach such
# a task are exactly the ones that cannot see the bin: a stale tab, a queued
# request, an integration holding an id from before the delete.
BIN_LIST=$(curl -fsS --max-time 20 "$API/spaces/workspace/$WS" -H "$AUTH" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*://;s/"//g' || true)
BIN_PROJ=$(curl -fsS --max-time 20 "$API/projects/space/$BIN_LIST" -H "$AUTH" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*://;s/"//g' || true)
BIN_LID=$(curl -fsS --max-time 20 "$API/lists/project/$BIN_PROJ" -H "$AUTH" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*://;s/"//g' || true)
if [ -z "$BIN_LID" ]; then
  bad "no list to create a bin-probe task in"
else
  BIN_TID=$(curl -fsS --max-time 20 -X POST "$API/tasks" -H "$AUTH" -H 'content-type: application/json' \
    -d "{\"listId\":\"$BIN_LID\",\"title\":\"deploy check — bin probe\"}" | jget id)
  # Alive: it must still behave completely normally. A gate that refuses too
  # much is the same defect wearing the other hat.
  ALIVE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X PATCH "$API/tasks/$BIN_TID" \
    -H "$AUTH" -H 'content-type: application/json' -d '{"title":"deploy check — alive"}' || true)
  [ "$ALIVE" = "200" ] \
    && ok "a live task still edits (200)" \
    || bad "editing a live task answered $ALIVE — the bin gate is refusing too much"

  curl -fsS --max-time 20 -X DELETE "$API/tasks/$BIN_TID" -H "$AUTH" >/dev/null 2>&1 || true
  BINNED=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X PATCH "$API/tasks/$BIN_TID" \
    -H "$AUTH" -H 'content-type: application/json' -d '{"title":"deploy check — edited from the bin"}' || true)
  [ "$BINNED" = "409" ] \
    && ok "and refuses edits once it is in the bin (409)" \
    || bad "editing a binned task answered $BINNED — expected 409"
  BINCOM=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST "$API/tasks/$BIN_TID/comments" \
    -H "$AUTH" -H 'content-type: application/json' -d '{"body":"deploy check — from the bin"}' || true)
  [ "$BINCOM" = "409" ] \
    && ok "and refuses comments too (409)" \
    || bad "commenting on a binned task answered $BINCOM — expected 409"

  # A refusal has to be a refusal, not a 409 over a write that already landed.
  # Also not jget, and here the failure mode is the dangerous direction: a
  # mangled title matches nothing and this reports the refusal as having held.
  STILL=$(curl -fsS --max-time 20 "$API/tasks/$BIN_TID" -H "$AUTH" \
    | grep -o '"title":"[^"]*"' | head -1 || true)
  case "$STILL" in
    *"edited from the bin"*) bad "the refused edit was written anyway — title is now '$STILL'" ;;
    *)                       ok "and wrote nothing while refusing" ;;
  esac

  # The two operations that exist FOR binned tasks must be untouched.
  RESTORED=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST "$API/tasks/$BIN_TID/restore" -H "$AUTH" || true)
  case "$RESTORED" in
    2*) ok "restore still works on a binned task ($RESTORED)" ;;
    *)  bad "restoring a binned task answered $RESTORED" ;;
  esac
  AFTER=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X PATCH "$API/tasks/$BIN_TID" \
    -H "$AUTH" -H 'content-type: application/json' -d '{"title":"deploy check — after restore"}' || true)
  [ "$AFTER" = "200" ] \
    && ok "and it edits again once restored" \
    || bad "a restored task answered $AFTER to an edit"

  # A due time survives the round trip — the column carries one, and until this
  # release the UI could only ever write midnight over it.
  curl -fsS --max-time 20 -X PATCH "$API/tasks/$BIN_TID" -H "$AUTH" -H 'content-type: application/json' \
    -d '{"dueDate":"2026-09-15T17:30:00.000Z"}' >/dev/null 2>&1 || true
  # NOT jget: its `sed 's/.*://'` is greedy, so the colons inside an ISO
  # timestamp eat the value and 17:30:00.000Z reads back as "00.000Z".
  DUE=$(curl -fsS --max-time 20 "$API/tasks/$BIN_TID" -H "$AUTH" \
    | grep -o '"dueDate":"[^"]*"' | head -1 || true)
  case "$DUE" in
    *T17:30*) ok "a due date keeps its time ($DUE)" ;;
    *)        bad "a due time did not survive: $DUE" ;;
  esac

  curl -fsS --max-time 20 -X DELETE "$API/tasks/$BIN_TID" -H "$AUTH" >/dev/null 2>&1 || true
  curl -fsS --max-time 20 -X DELETE "$API/workspaces/$WS/trash/task/$BIN_TID" -H "$AUTH" >/dev/null 2>&1 || true
fi

say "A dashboard counts your work, not a window it might not be in"
# The dashboard asked for the 500 most-recently-updated tasks in the whole
# workspace and then kept the viewer's in the browser. Those 500 are
# everyone's, so one person's share of them can be none — and overdue work is
# hit hardest, because a task is overdue precisely when nobody has touched it,
# which is what sorts it out of a recently-updated window. The card then
# reported "Overdue: 0" as a fact. The predicate belongs in SQL.
MINE=$(curl -fsS --max-time 30 "$API/tasks/workspace/$WS?limit=500&assigneeId=me" -H "$AUTH" || echo '')
if [ -z "$MINE" ]; then
  bad "assigneeId=me was refused, so the dashboard cannot ask for its own tasks"
else
  ok "the workspace listing can be narrowed to the caller in SQL"
  # Every row it returns must actually be the caller's. Counted by asking for
  # the same rows a second way: the member-scoped endpoint.
  MINE_N=$(printf '%s' "$MINE" | grep -o '"id":"' | wc -l | tr -d ' ')
  # NOT $ME: that holds the caller's id at the top of this file but is
  # reassigned to a whole /users/me payload further up, so by here it is JSON.
  SELF_ID=$(curl -fsS --max-time 20 "$API/users/me" -H "$AUTH" 2>/dev/null | jget id)
  MEMBER_N=$(curl -fsS --max-time 30 "$API/tasks/workspace/$WS/members/$SELF_ID" -H "$AUTH" 2>/dev/null | grep -o '"id":"' | wc -l | tr -d ' ')
  [ -n "$MINE_N" ] && [ -n "$MEMBER_N" ] && [ "$MINE_N" -le "$MEMBER_N" ] \
    && ok "and it never returns more than the member-scoped endpoint does ($MINE_N <= $MEMBER_N)" \
    || bad "assigneeId=me returned $MINE_N rows against the member endpoint's $MEMBER_N"
fi
# `assigneeId` takes the literal "me" and nothing else. Accepting an arbitrary
# id would turn a workspace listing into a way to read a colleague's workload
# without the permission check the member-scoped endpoint carries.
OTHER=$(curl -fsS --max-time 30 "$API/tasks/workspace/$WS?limit=5&assigneeId=00000000-0000-4000-8000-000000000000" -H "$AUTH" | grep -o '"id":"' | wc -l | tr -d ' ')
ALL_N=$(curl -fsS --max-time 30 "$API/tasks/workspace/$WS?limit=5" -H "$AUTH" | grep -o '"id":"' | wc -l | tr -d ' ')
[ "$OTHER" = "$ALL_N" ] \
  && ok "an arbitrary assigneeId is ignored rather than honoured ($OTHER = $ALL_N unfiltered)" \
  || bad "assigneeId accepted a raw user id: $OTHER rows vs $ALL_N unfiltered"

say "Binning a task takes it out of the search index, restoring puts it back"
# There was no removal path anywhere: indexTask wrote on create and on edit and
# nothing ever deleted, so a binned task stayed in Meili for good and the index
# only ever grew. Those documents can never be returned — a search for archived
# work skips Meili entirely — so they were pure dead weight sitting in the
# result pages that live work needed.
#
# The crowding this caused is NOT checked here on purpose. Removal is the fix
# for it, so with removal in place the scenario cannot be built through the API
# any more, and a check trying to would pass without exercising the paging that
# actually protects against it. That belongs in a unit test that can control
# the index directly, and lives in search.service.test.ts.
if [ -z "$ARCH_LIST" ]; then
  bad "no list to seed the index-lifecycle probe in"
else
  CROWD="lifecycleprobe$(date +%s)"
  CROWD_TID=$(curl -fsS --max-time 20 -X POST "$API/tasks" -H "$AUTH" -H 'content-type: application/json' \
    -d "{\"listId\":\"$ARCH_LIST\",\"title\":\"$CROWD subject\"}" | jget id)
  sleep 3
  # Findable while alive, or the two checks below prove nothing.
  curl -fsS --max-time 20 "$API/search/$WS?q=$CROWD&types=task&limit=5" -H "$AUTH" | grep -q "$CROWD_TID" \
    && ok "a freshly created task is findable (so the checks below mean something)" \
    || bad "the seeded task was never findable — the lifecycle checks prove nothing"

  curl -fsS --max-time 20 -X DELETE "$API/tasks/$CROWD_TID" -H "$AUTH" >/dev/null 2>&1 || true
  sleep 3
  if curl -fsS --max-time 20 "$API/search/$WS?q=$CROWD&types=task&limit=5" -H "$AUTH" | grep -q "$CROWD_TID"; then
    bad "a binned task is still returned by search"
  else
    ok "binning it takes it back out"
  fi
  # …and restoring puts it back, or a restored task would look fine everywhere
  # except search, where it would be unfindable for good.
  curl -fsS --max-time 20 -X POST "$API/tasks/$CROWD_TID/restore" -H "$AUTH" >/dev/null 2>&1 || true
  sleep 3
  curl -fsS --max-time 20 "$API/search/$WS?q=$CROWD&types=task&limit=5" -H "$AUTH" | grep -q "$CROWD_TID" \
    && ok "and restoring it makes it findable again" \
    || bad "a restored task never came back to the index"
  curl -fsS --max-time 20 -X DELETE "$API/tasks/$CROWD_TID" -H "$AUTH" >/dev/null 2>&1 || true
  curl -fsS --max-time 20 -X DELETE "$API/workspaces/$WS/trash/task/$CROWD_TID" -H "$AUTH" >/dev/null 2>&1 || true
fi

say "The shipped bundle carries this release's UI (§G, §2.8)"
# The two fixes above are half server, half browser. These are the browser
# halves, asserted against the bundle that actually shipped: a datetime control
# on the task sheet, and an output picker in the pre-join.
BUNDLE_DIR="${WEB_DIST:-/opt/rundesk/apps/web/dist}"
if [ -d "$BUNDLE_DIR" ]; then
  for NEEDLE in 'task-due-date' 'task-start-date' 'call-prejoin-speaker-select' 'setSinkId'; do
    if grep -rqs -- "$NEEDLE" "$BUNDLE_DIR"; then
      ok "the bundle contains \"$NEEDLE\""
    else
      bad "the bundle does not contain \"$NEEDLE\" — the browser half did not ship"
    fi
  done
else
  bad "no web bundle at $BUNDLE_DIR to check — set WEB_DIST"
fi

say "Cleared notifications age out after 30 days (§2.5)"
# The purge itself runs at 4am, which is a long time to wait to find out
# whether a deploy wired it up. The service logs its policy on boot instead.
RETENTION_LOG=$(docker logs rundesk-api 2>&1 | grep -c 'notification retention active' || true)
[ "${RETENTION_LOG:-0}" -gt 0 ] \
  && ok "the retention job is registered on this release" \
  || bad "no retention line in the API log — the job did not start"
docker logs rundesk-api 2>&1 | grep -o 'deleted after [0-9]* days' | tail -1 | grep -q 'after 30 days' \
  && ok "and the window is 30 days" \
  || bad "the retention window is not 30 days"

echo
printf '\033[1m%s passed, %s failed\033[0m\n' "$PASS" "$FAIL"
if [ "$FAIL" -eq 0 ]; then
  printf '\033[32m─── this release is live and working ───\033[0m\n'
else
  printf '\033[31m─── %s check(s) failed — send me the output above ───\033[0m\n' "$FAIL"
  exit 1
fi
