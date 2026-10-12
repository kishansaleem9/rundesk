#!/usr/bin/env bash
# What proves a lane's database is current (`newest_schema_witness` in
# scripts/e2e-lanes/lane-env.sh, read by `fleet-restart.sh`): the newest
# migration that leaves something to look for. Held to that:
#
#   a table       a newest migration that creates a table is its witness
#   a column      one that adds a column is, with the column
#   its own table a column is paired with the ALTER TABLE it is added under,
#                 not the file's first one, which can be another table's
#                 constraint (0186's was), and on the line before it too
#   walked past   a data-only migration names nothing and is skipped
#   nothing       no migration naming anything prints nothing
#   the script    `fleet-restart.sh` reads its witness from the helper, and
#                 checks a table as well as a column
#
# 0162 creates `outbound_email_messages` and adds no column, and the restart
# looked for columns only: its check stayed on 0160's, and a lane without the
# table would have passed it and 500'd on its first write.
#
# --mutate runs the cases against broken copies of the helper and the script.
#
#   bash scripts/check-schema-witness.sh [--mutate]
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mig () { mkdir -p "$TMP/$1"; printf '%s\n' "$3" > "$TMP/$1/$2"; }
mig created 0001_a.sql 'ALTER TABLE "t1" ADD COLUMN IF NOT EXISTS "c1" text;'
mig created 0002_b.sql 'UPDATE "t1" SET "c1" = 1;'
mig created 0003_c.sql 'CREATE TABLE IF NOT EXISTS "t3" ("id" uuid);'
mig added 0001_a.sql 'CREATE TABLE IF NOT EXISTS "t1" ("id" uuid);'
mig added 0002_b.sql 'ALTER TABLE "t2" ADD COLUMN IF NOT EXISTS "c2" text;'
mig added 0003_c.sql 'UPDATE "t2" SET "c2" = 2;'
mig none 0001_a.sql 'UPDATE "t" SET "x" = 1;'
mig paired 0001_a.sql 'CREATE TABLE IF NOT EXISTS "t5" ("id" uuid);
ALTER TABLE "t5" ADD CONSTRAINT "t5_fk" FOREIGN KEY ("x") REFERENCES "t6"("id");
ALTER TABLE "t7" ADD COLUMN IF NOT EXISTS "c7" uuid;'
mig split 0001_a.sql 'ALTER TABLE "t8"
  ADD COLUMN IF NOT EXISTS "c8" text;'

cases () {
  local env="$1" restart="$2" bad=0 out
  fail () { echo "  $1"; bad=$((bad + 1)); }
  out=$(bash -c ". '$env'; newest_schema_witness '$TMP/created'")
  [ "$out" = "$TMP/created/0003_c.sql t3" ] || fail "a table: '$out'"
  out=$(bash -c ". '$env'; newest_schema_witness '$TMP/added'")
  [ "$out" = "$TMP/added/0002_b.sql t2 c2" ] || fail "a column, past a data-only migration: '$out'"
  out=$(bash -c ". '$env'; newest_schema_witness '$TMP/paired'")
  [ "$out" = "$TMP/paired/0001_a.sql t7 c7" ] || fail "a column with its own table, not the first ALTER TABLE's: '$out'"
  out=$(bash -c ". '$env'; newest_schema_witness '$TMP/split'")
  [ "$out" = "$TMP/split/0001_a.sql t8 c8" ] || fail "a column added on the line after its ALTER TABLE: '$out'"
  out=$(bash -c ". '$env'; newest_schema_witness '$TMP/none'")
  [ -z "$out" ] || fail "nothing: '$out'"
  grep -q 'newest_schema_witness "$R/packages/db/src/migrations"' "$restart" || fail 'fleet-restart.sh: does not read its witness from the helper'
  grep -q "information_schema.tables where table_name='\$NEWEST_TBL'" "$restart" || fail 'fleet-restart.sh: checks a column only, never a table'
  return $bad
}

ENV="$REPO/scripts/e2e-lanes/lane-env.sh"
RESTART="$REPO/scripts/e2e-lanes/fleet-restart.sh"
if cases "$ENV" "$RESTART"; then
  echo "ok schema witness: the newest migration that creates a table or adds a column proves a lane current"
else
  echo "not ok schema witness"; exit 1
fi
[ "${1:-}" = --mutate ] || exit 0

MUTANTS=(
  # Columns only, as it was.
  'env|s/^    if \[ -n "\$created" \]; then echo "\$f \$created"; return 0; fi$/    :/'
  # Oldest first: the witness is a migration everybody has.
  'env|s/^  for f in \$\(ls "\$dir"\/\*\.sql 2>\/dev\/null \| sort -r\); do$/  for f in $(ls "$dir"\/*.sql 2>\/dev\/null | sort); do/'
  # A data-only migration stops the walk with nothing to check.
  'env|s/^    if \[ -n "\$pair" \]; then echo "\$f \$pair"; return 0; fi$/    echo "$f $pair"; return 0/'
  # The file's first ALTER TABLE is the column's, as it was (0186).
  'env|s/\{ t = substr\(l/{ if (t == "") t = substr(l/'
  # A column is paired only with an ALTER TABLE on its own line.
  'env|s/\{ l = tolower\(\$0\) \}/{ l = tolower($0); t = "" }/'
  # The script checks a column whatever the witness is.
  "restart|s/^        \"select count\\(\\*\\) from information_schema.tables where table_name='\\\$NEWEST_TBL'\" 2>\\/dev\\/null \\| tr -d ' '\\)\$/        \"select 1\" 2>\\/dev\\/null | tr -d ' ')/"
)
caught=0
for i in "${!MUTANTS[@]}"; do
  which="${MUTANTS[$i]%%|*}"
  expr="${MUTANTS[$i]#*|}"
  e="$ENV"; r="$RESTART"
  if [ "$which" = env ]; then orig="$ENV"; e="$TMP/env-$i.sh"; m="$e"; else orig="$RESTART"; r="$TMP/restart-$i.sh"; m="$r"; fi
  sed -E "$expr" "$orig" > "$m"
  if cmp -s "$m" "$orig"; then
    echo "  mutation $((i + 1)) CHANGED NOTHING — its pattern no longer matches"; continue
  fi
  if cases "$e" "$r" > /dev/null; then echo "  mutation $((i + 1)) SURVIVED: $expr"
  else caught=$((caught + 1)); fi
done
if [ "$caught" = "${#MUTANTS[@]}" ]; then
  echo "ok $caught of ${#MUTANTS[@]} mutations of the schema witness are caught"
else
  echo "not ok only $caught of ${#MUTANTS[@]} mutations are caught"; exit 1
fi
