#!/bin/bash
# The lane schema gate, on a planted database (`lane_schema_drift`, lane-env.sh;
# `found-25-sep/lane-databases-drift-from-the-migrations`).
#
#   bash scripts/e2e-lanes/schema-drift-selfcheck.sh
#
# A copy of the reference must read as no drift. Then each defect the item was
# found by is planted in a fresh copy and must be named: a dropped unique index,
# a default the migrations dropped put back, a foreign key gone. A foreign key
# renamed (push's `_fk` against a migration's `_fkey`) must NOT read as drift.
# Local only: it needs the lanes' Postgres. The copy is dropped at the end.
# READ WHOLE BEFORE IT RUNS (`lane-scripts-read-as-they-run`).
{
set -u
. /home/user/rundesk/scripts/e2e-lanes/lane-env.sh
export PGPASSWORD=rundesk
PROBE=rundesk_drift_selfcheck
PASS=0; FAIL=0
chk () { if [ "$1" = yes ]; then PASS=$((PASS + 1)); echo "  PASS $2"; else FAIL=$((FAIL + 1)); echo "  FAIL $2 — $3"; fi; }
fresh () {
  sudo -u postgres psql -q -c "DROP DATABASE IF EXISTS $PROBE WITH (FORCE)" >/dev/null 2>&1
  sudo -u postgres psql -q -c "CREATE DATABASE $PROBE TEMPLATE $SCHEMA_REF_DB OWNER rundesk" >/dev/null 2>&1
}
sql () { psql -h 127.0.0.1 -U rundesk -d "$PROBE" -qtA -v ON_ERROR_STOP=1 -c "$1" >/dev/null; }

if ! schema_ref_ensure; then echo "FAIL the reference could not be built"; exit 1; fi

fresh
OUT=$(lane_schema_drift "$PROBE"); RC=$?
chk "$([ $RC = 0 ] && [ -z "$OUT" ] && echo yes)" "a copy of the reference reads as no drift" "rc $RC: $OUT"

sql "DROP INDEX uq_folders_space_name_active"
OUT=$(lane_schema_drift "$PROBE"); RC=$?
chk "$([ $RC = 1 ] && grep -q '^missing: index folders CREATE UNIQUE INDEX ON public.folders' <<< "$OUT" && echo yes)" \
  "a dropped unique index is drift, and named" "rc $RC: $OUT"

fresh
sql "ALTER TABLE user_dock_configs ALTER COLUMN pinned_links SET DEFAULT '[]'::jsonb"
OUT=$(lane_schema_drift "$PROBE"); RC=$?
chk "$([ $RC = 1 ] && grep -q "^extra: column user_dock_configs.pinned_links jsonb YES default '\[\]'::jsonb" <<< "$OUT" && echo yes)" \
  "a default the migrations dropped, put back, is drift, and named" "rc $RC: $OUT"

fresh
FK=$(psql -h 127.0.0.1 -U rundesk -d "$PROBE" -tAc "select conname from pg_constraint where conrelid='workspace_member_custom_roles'::regclass and contype='f' and pg_get_constraintdef(oid) like '%workspace_members%' limit 1")
sql "ALTER TABLE workspace_member_custom_roles DROP CONSTRAINT \"$FK\""
OUT=$(lane_schema_drift "$PROBE"); RC=$?
chk "$([ -n "$FK" ] && [ $RC = 1 ] && grep -q '^missing: constraint workspace_member_custom_roles FOREIGN KEY (workspace_member_id) REFERENCES workspace_members(id)' <<< "$OUT" && echo yes)" \
  "a foreign key gone is drift, and named" "fk '$FK', rc $RC: $OUT"

fresh
sql "ALTER TABLE workspace_member_custom_roles RENAME CONSTRAINT \"$FK\" TO wmcr_renamed_fkey"
OUT=$(lane_schema_drift "$PROBE"); RC=$?
chk "$([ $RC = 0 ] && echo yes)" "the same foreign key under another name is not drift" "rc $RC: $OUT"

OUT=$(lane_schema_drift rundesk_no_such_database 2>&1); RC=$?
chk "$([ $RC = 2 ] && echo yes)" "a database that cannot be read is not a pass" "rc $RC: $OUT"

sudo -u postgres psql -q -c "DROP DATABASE IF EXISTS $PROBE WITH (FORCE)" >/dev/null 2>&1
echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
exit
}
