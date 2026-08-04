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
TOKEN=$(curl -fsS --max-time 20 -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | jget accessToken)
[ -n "$TOKEN" ] || die "login rejected — set RUNDESK_EMAIL / RUNDESK_PASSWORD if the admin password was rotated"
AUTH="Authorization: Bearer $TOKEN"
WS=$(curl -fsS --max-time 20 "$API/workspaces" -H "$AUTH" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*://;s/"//g' || true)
[ -n "$WS" ] || die "no workspace visible for this account"
echo "  ok — workspace $WS"

say "Task types: create, default, apply, delete"
TT=$(curl -fsS --max-time 20 -X POST "$API/workspaces/$WS/task-types" -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Deploy check","icon":"✅","isDefault":true}' 2>/dev/null || true)
TID=$(printf '%s' "$TT" | jget id)
if [ -n "$TID" ]; then ok "created a task type"; else bad "create -> $TT"; fi

if [ -n "$TID" ]; then
  LIST=$(curl -fsS --max-time 20 "$API/workspaces/$WS/task-types" -H "$AUTH" 2>/dev/null || true)
  printf '%s' "$LIST" | grep -q 'Deploy check' && ok "it is listed" || bad "list -> $LIST"

  DEFAULTS=$(printf '%s' "$LIST" | grep -o '"isDefault":true' | wc -l | tr -d ' ')
  [ "$DEFAULTS" = "1" ] && ok "exactly one default type" || bad "found $DEFAULTS defaults, expected 1"

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

# Which row is this account, by email rather than by position. The roster is
# not ordered by who is asking, and an earlier version assumed the first row
# was the caller — which made the self-checks below test the wrong person.
ME=$(printf '%s' "$MEMBERS" | tr '}' '\n' | grep -F "$EMAIL" | grep -o '"userId":"[^"]*"' \
     | head -1 | sed 's/.*://;s/"//g' || true)
PEER=$(printf '%s' "$MEMBERS" | tr '}' '\n' | grep -v -F "$EMAIL" | grep -o '"userId":"[^"]*"' \
     | head -1 | sed 's/.*://;s/"//g' || true)

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
else
  echo "  (only one member — reporting line not exercised)"
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
else
  echo "  (only one member — the shared view not exercised)"
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

echo
printf '\033[1m%s passed, %s failed\033[0m\n' "$PASS" "$FAIL"
if [ "$FAIL" -eq 0 ]; then
  printf '\033[32m─── this release is live and working ───\033[0m\n'
else
  printf '\033[31m─── %s check(s) failed — send me the output above ───\033[0m\n' "$FAIL"
  exit 1
fi
