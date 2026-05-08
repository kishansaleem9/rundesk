#!/usr/bin/env bash
# One-command production deployment script (separate from deploy/deploy.sh)
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "❌ .env missing at repo root. Copy deploy/env.production.template to .env first."
  exit 1
fi

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

echo "▶ Applying schema with drizzle-kit migrate"
docker exec rundesk-api sh -lc "cd /app/packages/db && pnpm exec drizzle-kit migrate"

echo "▶ Running seed (idempotent)"
docker exec rundesk-api sh -lc "cd /app/packages/db && pnpm exec tsx src/seed.ts" || true

systemctl reload nginx
echo "✓ Deploy complete."
