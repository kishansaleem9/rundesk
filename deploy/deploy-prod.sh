#!/usr/bin/env bash
# One-command production deployment script (separate from deploy/deploy.sh)
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "❌ .env missing at repo root. Copy deploy/env.production.template to .env first."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

required_table_missing() {
  docker exec rundesk-postgres psql -U "${POSTGRES_USER:-rundesk}" -d "${POSTGRES_DB:-rundesk}" -tAc \
    "SELECT to_regclass('public.organization_members') IS NULL;" | tr -d '[:space:]'
}

required_constraint_missing() {
  docker exec rundesk-postgres psql -U "${POSTGRES_USER:-rundesk}" -d "${POSTGRES_DB:-rundesk}" -tAc \
    "SELECT NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uq_workspace_members_workspace_user');" | tr -d '[:space:]'
}

reinit_database_schema() {
  echo "⚠️  Schema drift detected. Reinitializing DB schema (destructive reset)."
  docker exec rundesk-postgres psql -U "${POSTGRES_USER:-rundesk}" -d "${POSTGRES_DB:-rundesk}" -v ON_ERROR_STOP=1 -c \
    "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
  echo "▶ Applying schema baseline with drizzle-kit push"
  docker exec rundesk-api sh -lc "cd /app/packages/db && pnpm exec drizzle-kit push --force"
}

should_allow_schema_reset() {
  [ "${ALLOW_SCHEMA_RESET:-false}" = "true" ]
}

handle_schema_drift_or_failure() {
  local reason="$1"
  echo "⚠️  $reason"
  if should_allow_schema_reset; then
    reinit_database_schema
    return
  fi
  echo "❌ Refusing destructive schema reset because ALLOW_SCHEMA_RESET is not true."
  echo "   Set ALLOW_SCHEMA_RESET=true only if you explicitly want to drop/recreate schema."
  echo "   Current DB is preserved. Exiting deploy so issue can be investigated safely."
  exit 1
}

drizzle_legacy_baseline_needed() {
  local count has_users
  count="$(
    docker exec rundesk-postgres psql -U "${POSTGRES_USER:-rundesk}" -d "${POSTGRES_DB:-rundesk}" -tAc \
      "SELECT COUNT(*)::text FROM drizzle.__drizzle_migrations;" | tr -d '[:space:]'
  )"
  has_users="$(
    docker exec rundesk-postgres psql -U "${POSTGRES_USER:-rundesk}" -d "${POSTGRES_DB:-rundesk}" -tAc \
      "SELECT (to_regclass('public.users') IS NOT NULL)::text;" | tr -d '[:space:]'
  )"
  [[ "${count}" == "0" && "${has_users}" == "t" ]]
}

run_drizzle_migrate() {
  docker exec rundesk-api sh -lc "cd /app/packages/db && pnpm exec drizzle-kit migrate"
}

apply_schema() {
  if drizzle_legacy_baseline_needed; then
    echo "▶ Legacy DB: drizzle journal empty but schema present — inserting baseline hashes 0000–0008"
    docker exec -i rundesk-postgres psql -U "${POSTGRES_USER:-rundesk}" -d "${POSTGRES_DB:-rundesk}" -v ON_ERROR_STOP=1 \
      < deploy/baseline-drizzle-0000-0008.sql
  fi

  echo "▶ Applying schema with drizzle-kit migrate"
  if ! run_drizzle_migrate; then
    echo "⚠ First migrate attempt failed (common on legacy DBs where SQL was applied outside Drizzle). Running hash backfill…"
  fi

  echo "▶ Syncing Drizzle migration hashes for already-applied SQL (idempotent)"
  node deploy/drizzle-backfill-missing-hashes.mjs

  if ! run_drizzle_migrate; then
    handle_schema_drift_or_failure "drizzle-kit migrate failed after journal hash backfill."
  fi

  local missing_table
  local missing_constraint
  missing_table="$(required_table_missing)"
  missing_constraint="$(required_constraint_missing)"

  if [ "$missing_table" = "t" ] || [ "$missing_constraint" = "t" ]; then
    handle_schema_drift_or_failure "required schema objects are missing after migrate."
  fi
}

echo "▶ Starting one-command production deploy"
echo "▶ Pulling latest from git"
git pull --ff-only

echo "▶ Building web SPA → apps/web/dist"
# Build into a staging dir, then publish. Every file under /assets/ is
# content-hashed, and the previous release's chunks are kept: a tab that was
# open when we deploy is still running the old index.html, and if the chunks it
# names disappear, every lazy import 404s and the whole app is replaced by the
# error boundary (see apps/web/src/lib/chunk-reload.ts). Keeping one release's
# worth of chunks costs a few MB and means those tabs never break at all.
rm -rf apps/web/dist.new
docker buildx build -f deploy/Dockerfile.web --target export --output type=local,dest=apps/web/dist.new .
if [ ! -s apps/web/dist.new/index.html ]; then
  echo "✗ web build produced no index.html — refusing to publish over the live dist"
  rm -rf apps/web/dist.new
  exit 1
fi
rm -rf apps/web/assets.prev
[ -d apps/web/dist/assets ] && mv apps/web/dist/assets apps/web/assets.prev
rm -rf apps/web/dist
mv apps/web/dist.new apps/web/dist
if [ -d apps/web/assets.prev ]; then
  # -n: the new build always wins; only chunks unique to the old one are added.
  cp -an apps/web/assets.prev/. apps/web/dist/assets/ 2>/dev/null || true
  rm -rf apps/web/assets.prev
fi
# Chunks no release has published in two weeks belong to no live tab.
find apps/web/dist/assets -type f -mtime +14 -delete 2>/dev/null || true
chmod -R o+rX apps/web/dist
chmod o+x apps/web/dist /opt/rundesk/apps/web /opt/rundesk/apps /opt/rundesk 2>/dev/null || true

echo "▶ Building API image"
docker compose -f deploy/docker-compose.prod.yml --env-file .env build api

echo "▶ Restarting API container"
docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d --force-recreate api

echo "▶ Waiting for postgres healthy…"
for i in $(seq 1 30); do
  if docker exec rundesk-postgres pg_isready -U "${POSTGRES_USER:-rundesk}" >/dev/null 2>&1; then
    echo "✓ postgres healthy"
    break
  fi
  sleep 1
done

apply_schema

echo "▶ Running seed (idempotent)"
docker exec rundesk-api sh -lc "cd /app/packages/db && pnpm exec tsx src/seed.ts" || true

systemctl reload nginx

# The installed vhost is a *copy* (deploy/deploy.sh nginx), and certbot has
# since rewritten it with the SSL block — so this script must not overwrite it.
# But a vhost that still caches index.html hands returning users a manifest
# naming chunks this deploy has deleted, which is the crash in §0 of
# docs/video1-rundesk-gap-audit.md. Say so loudly rather than deploying quietly
# on top of it.
installed_vhost="/etc/nginx/sites-enabled/rundesk.theaura.agency"
if [ -f "$installed_vhost" ] && ! grep -q 'Cache-Control "no-cache"' "$installed_vhost"; then
  echo
  echo "⚠ The live nginx vhost still caches index.html and sw.js."
  echo "  Tabs opened before a deploy will 404 on their chunks. To fix, merge the"
  echo "  no-cache location block from deploy/nginx/rundesk.theaura.agency.conf"
  echo "  into $installed_vhost (keep certbot's SSL lines), then:"
  echo "      nginx -t && systemctl reload nginx"
  echo
fi

echo "✓ Deploy complete."
