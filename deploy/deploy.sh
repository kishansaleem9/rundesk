#!/usr/bin/env bash
# Rundesk deploy script — run on the production host from the repo root.
# Usage:
#   ./deploy/deploy.sh           # build + start everything
#   ./deploy/deploy.sh migrate   # apply DB schema (drizzle push) + seed
#   ./deploy/deploy.sh logs      # tail caddy + api logs
set -euo pipefail

cd "$(dirname "$0")/.."

CMD="${1:-up}"

ensure_env() {
  if [ ! -f .env ]; then
    echo "❌ .env missing at repo root. Copy .env.example to .env and fill in production values first."
    exit 1
  fi
}

case "$CMD" in
  up)
    ensure_env
    echo "▶ Building web SPA → apps/web/dist"
    rm -rf apps/web/dist
    docker build -f deploy/Dockerfile.web --target export --output type=local,dest=apps/web/dist .
    echo "▶ Building API image"
    docker compose -f deploy/docker-compose.prod.yml --env-file .env build api
    echo "▶ Starting stack"
    docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d
    echo "▶ Waiting for postgres healthy…"
    until docker exec rundesk-postgres pg_isready -U "${POSTGRES_USER:-rundesk}" >/dev/null 2>&1; do
      sleep 1
    done
    echo "✓ Stack is up. Run './deploy/deploy.sh migrate' if this is the first deploy."
    ;;
  migrate)
    ensure_env
    echo "▶ Applying schema with drizzle-kit push"
    docker exec -e CI=1 rundesk-api sh -lc "cd /app/packages/db && pnpm exec drizzle-kit push --force"
    echo "▶ Running seed"
    docker exec rundesk-api sh -lc "cd /app/packages/db && pnpm exec tsx src/seed.ts" || true
    echo "✓ Done."
    ;;
  rebuild)
    ensure_env
    echo "▶ Rebuilding web + api from latest source"
    rm -rf apps/web/dist
    docker build -f deploy/Dockerfile.web --target export --output type=local,dest=apps/web/dist .
    docker compose -f deploy/docker-compose.prod.yml --env-file .env build api
    docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d --force-recreate api caddy
    echo "✓ Rebuild complete."
    ;;
  logs)
    docker compose -f deploy/docker-compose.prod.yml --env-file .env logs -f --tail=100 api caddy
    ;;
  down)
    docker compose -f deploy/docker-compose.prod.yml --env-file .env down
    ;;
  *)
    echo "Unknown command: $CMD"
    echo "Commands: up | migrate | rebuild | logs | down"
    exit 1
    ;;
esac
