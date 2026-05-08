#!/usr/bin/env bash
# One-command production deployment script (separate from deploy/deploy.sh)
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "❌ .env missing at repo root. Copy deploy/env.production.template to .env first."
  exit 1
fi

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

apply_schema() {
  echo "▶ Applying schema with drizzle-kit migrate"
  if ! docker exec rundesk-api sh -lc "cd /app/packages/db && pnpm exec drizzle-kit migrate"; then
    reinit_database_schema
    return
  fi

  local missing_table
  local missing_constraint
  missing_table="$(required_table_missing)"
  missing_constraint="$(required_constraint_missing)"

  if [ "$missing_table" = "t" ] || [ "$missing_constraint" = "t" ]; then
    reinit_database_schema
  fi
}

echo "▶ Starting one-command production deploy"
echo "▶ Pulling latest from git"
git pull

echo "▶ Building web SPA → apps/web/dist"
rm -rf apps/web/dist
docker buildx build -f deploy/Dockerfile.web --target export --output type=local,dest=apps/web/dist .
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
echo "✓ Deploy complete."
