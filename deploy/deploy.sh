#!/usr/bin/env bash
# Rundesk deploy script — run on the production host from the repo root.
# Usage:
#   ./deploy/deploy.sh up        # build + start everything
#   ./deploy/deploy.sh migrate   # apply DB schema (drizzle push) + seed
#   ./deploy/deploy.sh nginx     # install nginx vhost + certbot SSL
#   ./deploy/deploy.sh rebuild   # pull latest, rebuild, restart api + web
#   ./deploy/deploy.sh logs      # tail api logs
#   ./deploy/deploy.sh down      # stop all containers (data persists)
set -euo pipefail

cd "$(dirname "$0")/.."

CMD="${1:-up}"

ensure_env() {
  if [ ! -f .env ]; then
    echo "❌ .env missing at repo root. Copy deploy/env.production.template to .env first."
    exit 1
  fi
}

required_table_missing() {
  docker exec rundesk-postgres pg_isready -U "${POSTGRES_USER:-rundesk}" >/dev/null 2>&1 || return 0
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

database_is_empty() {
  docker exec rundesk-postgres pg_isready -U "${POSTGRES_USER:-rundesk}" >/dev/null 2>&1 || return 1
  local users_missing
  users_missing="$(docker exec rundesk-postgres psql -U "${POSTGRES_USER:-rundesk}" -d "${POSTGRES_DB:-rundesk}" -tAc \
    "SELECT to_regclass('public.users') IS NULL;" | tr -d '[:space:]')"
  [ "$users_missing" = "t" ]
}

# First-time bootstrap for an empty database. This is non-destructive (there is
# nothing to lose) so it does NOT require ALLOW_SCHEMA_RESET. `push` creates the
# full schema from the TypeScript source of truth, then the migration journal is
# recorded as applied so a later `migrate` only runs genuinely-new migrations.
bootstrap_fresh_schema() {
  echo "▶ Fresh database detected — creating schema with drizzle-kit push"
  docker exec rundesk-api sh -lc "cd /app/packages/db && pnpm exec drizzle-kit push --force"
  echo "▶ Recording migration journal as applied (so later 'migrate' only runs new migrations)"
  docker exec rundesk-api sh -lc "cd /app/packages/db && pnpm exec tsx src/mark-migrations-applied.ts"
}

apply_schema() {
  if database_is_empty; then
    bootstrap_fresh_schema
    return
  fi

  echo "▶ Applying schema with drizzle-kit migrate"
  if ! docker exec rundesk-api sh -lc "cd /app/packages/db && pnpm exec drizzle-kit migrate"; then
    handle_schema_drift_or_failure "drizzle-kit migrate failed."
    return
  fi

  local missing_table
  local missing_constraint
  missing_table="$(required_table_missing)"
  missing_constraint="$(required_constraint_missing)"
  if [ "$missing_table" = "t" ] || [ "$missing_constraint" = "t" ]; then
    handle_schema_drift_or_failure "required schema objects are missing after migrate."
  fi
}

build_web() {
  echo "▶ Building web SPA → apps/web/dist"
  rm -rf apps/web/dist
  local show_seeded="${VITE_SHOW_SEEDED_LOGINS:-false}"
  echo "▶ VITE_SHOW_SEEDED_LOGINS=$show_seeded"
  docker buildx build \
    --build-arg VITE_SHOW_SEEDED_LOGINS="$show_seeded" \
    -f deploy/Dockerfile.web \
    --target export \
    --output type=local,dest=apps/web/dist \
    .
  # nginx (www-data) needs traverse + read on the dist tree
  chmod -R o+rX apps/web/dist
  chmod o+x apps/web/dist /opt/rundesk/apps/web /opt/rundesk/apps /opt/rundesk 2>/dev/null || true
}

case "$CMD" in
  up)
    ensure_env
    build_web
    echo "▶ Building API image"
    docker compose -f deploy/docker-compose.prod.yml --env-file .env build api
    echo "▶ Starting stack"
    docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d
    echo "▶ Waiting for postgres healthy…"
    for i in $(seq 1 30); do
      if docker exec rundesk-postgres pg_isready -U "${POSTGRES_USER:-rundesk}" >/dev/null 2>&1; then
        echo "✓ postgres healthy"
        break
      fi
      sleep 1
    done
    echo "✓ Stack is up."
    echo "  Run './deploy/deploy.sh migrate' if this is the first deploy."
    echo "  Run './deploy/deploy.sh nginx' to install the public vhost + SSL."
    ;;
  migrate)
    ensure_env
    apply_schema
    echo "▶ Running seed (idempotent)"
    docker exec rundesk-api sh -lc "cd /app/packages/db && pnpm exec tsx src/seed.ts" || true
    echo "✓ Done."
    ;;
  nginx)
    DOMAIN=rundesk.theaura.agency
    echo "▶ Installing nginx vhost for $DOMAIN"
    cp deploy/nginx/rundesk.theaura.agency.conf "/etc/nginx/sites-available/$DOMAIN"
    ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
    nginx -t
    systemctl reload nginx
    echo "▶ Issuing SSL cert via certbot"
    if ! command -v certbot >/dev/null; then
      apt-get update -qq && apt-get install -y -qq certbot python3-certbot-nginx
    fi
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@theaura.agency" --redirect
    echo "✓ https://$DOMAIN is live."
    ;;
  rebuild)
    ensure_env
    echo "▶ Pulling latest from git"
    git pull
    build_web
    docker compose -f deploy/docker-compose.prod.yml --env-file .env build api
    docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d --force-recreate api
    systemctl reload nginx
    echo "✓ Rebuild complete."
    ;;
  logs)
    docker compose -f deploy/docker-compose.prod.yml --env-file .env logs -f --tail=200 api
    ;;
  down)
    docker compose -f deploy/docker-compose.prod.yml --env-file .env down
    ;;
  *)
    echo "Unknown command: $CMD"
    echo "Commands: up | migrate | nginx | rebuild | logs | down"
    exit 1
    ;;
esac
