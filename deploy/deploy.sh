#!/usr/bin/env bash
# Rundesk deploy script — run on the production host from the repo root.
# Usage:
#   ./deploy/deploy.sh up        # build + start everything
#   ./deploy/deploy.sh migrate   # apply DB schema (drizzle push) + seed
#   ./deploy/deploy.sh nginx     # install nginx vhost + certbot SSL
#   ./deploy/deploy.sh rebuild   # pull latest, rebuild, apply new migrations, restart api + web
#   ./deploy/deploy.sh logs      # tail api logs
#   ./deploy/deploy.sh down      # stop all containers (data persists)
set -euo pipefail

cd "$(dirname "$0")/.."

CMD="${1:-up}"

# shellcheck source=lib/publish-web-dist.sh
source deploy/lib/publish-web-dist.sh

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

# True only when the drizzle migration ledger exists AND has at least one row.
# A populated DB with an empty ledger means the schema was materialised with
# `push` and never recorded — replaying migrations from zero would fail on
# already-existing objects, so we reconcile instead (see apply_schema).
migration_ledger_initialized() {
  docker exec rundesk-postgres pg_isready -U "${POSTGRES_USER:-rundesk}" >/dev/null 2>&1 || return 1
  local count
  count="$(docker exec rundesk-postgres psql -U "${POSTGRES_USER:-rundesk}" -d "${POSTGRES_DB:-rundesk}" -tAc \
    "SELECT count(*) FROM drizzle.__drizzle_migrations;" 2>/dev/null | tr -d '[:space:]')"
  [ -n "$count" ] && [ "$count" != "0" ]
}

# Bring a push-managed DB (no migration ledger) up to date without replaying
# history: push reconciles the live schema to the TypeScript source (additive
# for new tables/columns/indexes), then the ledger is recorded so future
# deploys use migrate. Non-destructive — no DROP SCHEMA, no data loss.
reconcile_pushed_schema() {
  echo "▶ Migration ledger empty (DB was created with 'push'). Reconciling schema with push, then recording ledger."
  docker exec rundesk-api sh -lc "cd /app/packages/db && pnpm exec drizzle-kit push --force"
  docker exec rundesk-api sh -lc "cd /app/packages/db && pnpm exec tsx src/mark-migrations-applied.ts"
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

  # Populated DB that predates migrate-based deploys (built with `push`, no
  # ledger): reconcile additively instead of replaying history from zero.
  if ! migration_ledger_initialized; then
    reconcile_pushed_schema
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
  local show_seeded="${VITE_SHOW_SEEDED_LOGINS:-false}"
  echo "▶ VITE_SHOW_SEEDED_LOGINS=$show_seeded"
  # Build into a staging dir; publish_web_dist swaps it in and carries the
  # previous release's chunks across (deploy/lib/publish-web-dist.sh).
  rm -rf apps/web/dist.new
  docker buildx build \
    --build-arg VITE_SHOW_SEEDED_LOGINS="$show_seeded" \
    -f deploy/Dockerfile.web \
    --target export \
    --output type=local,dest=apps/web/dist.new \
    .
  if [ ! -s apps/web/dist.new/index.html ]; then
    echo "✗ web build produced no index.html — refusing to publish over the live dist"
    rm -rf apps/web/dist.new
    exit 1
  fi
  publish_web_dist
  # nginx (www-data) needs traverse + read on the dist tree
  chmod -R o+rX apps/web/dist
  chmod o+x apps/web/dist /opt/rundesk/apps/web /opt/rundesk/apps /opt/rundesk 2>/dev/null || true
}

# The installed vhost is a *copy* (`./deploy/deploy.sh nginx`), and certbot has
# since rewritten it with the SSL block — so a rebuild must not overwrite it.
# But a vhost that still caches index.html hands returning users a manifest
# naming chunks this deploy has deleted, which is the crash in §0 of
# docs/video1-rundesk-gap-audit.md. Say so loudly rather than deploying quietly
# on top of it.
warn_if_vhost_caches_index() {
  local installed="/etc/nginx/sites-enabled/rundesk.theaura.agency"
  [ -f "$installed" ] || return 0
  grep -q 'Cache-Control "no-cache"' "$installed" && return 0
  echo
  echo "⚠ The live nginx vhost still caches index.html and sw.js."
  echo "  Tabs opened before a deploy will 404 on their chunks. Fix it with:"
  echo "      sudo ./deploy/patch-nginx-cache-headers.sh"
  echo "  (edits $installed in place, keeping certbot's SSL lines)"
  echo
}

# A DOMAIN ON THE PRIVATE BUCKET (`found-30-sep/domain-left-on-the-private-bucket`). Cloudflare serves
# every object of a bucket a custom domain is connected to, unsigned, by its key. The API checks the
# R2_PUBLIC_URL it is given at boot, refuses to send anybody there, and says so in its log; what it cannot
# do is disconnect the domain. So the deploy reads that log and says it where the deployer is looking,
# with the four steps, rather than leaving it in a log nobody opens. Nothing set, nothing said.
warn_if_public_domain_on_private_bucket() {
  local line=""
  for i in $(seq 1 30); do
    line=$(docker logs rundesk-api 2>&1 | grep -E "to anybody, unsigned|Could not check whether R2_PUBLIC_URL" | tail -1)
    [ -n "$line" ] && break
    docker logs rundesk-api 2>&1 | grep -q "Nest application successfully started" && break
    sleep 2
  done
  case "$line" in
    *"Could not check whether R2_PUBLIC_URL"*)
      echo
      echo "⚠ The API could not check whether R2_PUBLIC_URL serves the private bucket; pictures are signed until it can."
      echo "  ${line#*] }"
      echo
      ;;
    *"to anybody, unsigned"*)
      echo
      echo "⚠ R2_PUBLIC_URL is a domain of the private bucket: it serves every task file, chat file and recording to anybody with its key."
      echo "  The API sends nobody to it, but the domain still serves them until it is disconnected:"
      echo "    1. create the pictures' bucket, with the private bucket's CORS rule;"
      echo "    2. set R2_PUBLIC_BUCKET_NAME in .env to it;"
      echo "    3. connect the domain to that bucket, and disconnect it — and any r2.dev URL — from R2_BUCKET_NAME;"
      echo "    4. ./deploy/deploy.sh rebuild (the pictures move on boot)."
      echo "  The API's own words: ${line#*] }"
      echo
      ;;
  esac
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
    # release.sh has already put the exact commit on disk, and a bare `git pull`
    # after that either does nothing or drags in something nobody asked for.
    if [ "${SKIP_PULL:-0}" = "1" ]; then
      echo "▶ Deploying the checked-out commit ($(git rev-parse --short HEAD)) — not pulling"
    else
      echo "▶ Pulling latest from git"
      git pull
    fi
    build_web
    docker compose -f deploy/docker-compose.prod.yml --env-file .env build api
    docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d --force-recreate api
    echo "▶ Waiting for postgres healthy…"
    for i in $(seq 1 30); do
      if docker exec rundesk-postgres pg_isready -U "${POSTGRES_USER:-rundesk}" >/dev/null 2>&1; then
        echo "✓ postgres healthy"
        break
      fi
      sleep 1
    done
    # Apply any migrations that shipped with this build. A rebuild deploys new
    # code that may require new schema (e.g. new tables/columns referenced on the
    # login path), so skipping this would break the running app. apply_schema
    # only runs genuinely-new migrations and never resets without ALLOW_SCHEMA_RESET.
    echo "▶ Applying any new DB migrations"
    apply_schema
    systemctl reload nginx
    warn_if_vhost_caches_index
    warn_if_public_domain_on_private_bucket
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
