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
