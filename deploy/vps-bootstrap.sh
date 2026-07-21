#!/usr/bin/env bash
#
# Rundesk — one-command bootstrap for a FRESH Ubuntu/Debian VPS.
#
# Takes a bare server to a running, TLS-terminated Rundesk:
#   • installs Docker (+ buildx/compose plugin), git, nginx, certbot
#   • clones (or updates) the repo at $APP_DIR
#   • generates a production .env with strong, unique secrets
#   • builds the web SPA + API image and starts postgres/redis/meilisearch/api
#   • applies the DB schema + idempotent seed
#   • installs an nginx vhost for $DOMAIN and issues a Let's Encrypt cert
#
# The container ports stay on 127.0.0.1 (nginx on the host terminates TLS and
# proxies to the API), so this coexists with other apps on the box.
#
# Re-running is safe: existing .env is never overwritten, the DB is preserved,
# and only genuinely-new migrations are applied.
#
# ─── Usage ────────────────────────────────────────────────────────────────────
#   sudo DOMAIN=app.example.com \
#        REPO_URL=https://github.com/iamreebskhan/rundesk.git \
#        LE_EMAIL=you@example.com \
#        bash deploy/vps-bootstrap.sh
#
# Options (environment variables):
#   DOMAIN        (required)  public hostname, DNS A-record must already point here
#   REPO_URL      (required first run) git URL to clone; ignored if $APP_DIR exists
#   LE_EMAIL      (required unless SKIP_TLS=true) email for Let's Encrypt
#   BRANCH        git branch to deploy                       [default: main]
#   APP_DIR       install location                           [default: /opt/rundesk]
#   API_HOST_PORT loopback port nginx proxies to             [default: 3010]
#   ANTHROPIC_API_KEY  enable AI features                    [default: empty]
#   SKIP_TLS      set to "true" to install HTTP-only (no certbot)   [default: false]
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="${DOMAIN:-}"
REPO_URL="${REPO_URL:-}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/rundesk}"
API_HOST_PORT="${API_HOST_PORT:-3010}"
LE_EMAIL="${LE_EMAIL:-}"
SKIP_TLS="${SKIP_TLS:-false}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"

log()  { printf '\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "Run as root (use sudo)."
[ -n "$DOMAIN" ]      || die "DOMAIN is required, e.g. DOMAIN=app.example.com"
if [ "$SKIP_TLS" != "true" ] && [ -z "$LE_EMAIL" ]; then
  die "LE_EMAIL is required for TLS. Set LE_EMAIL=you@example.com or SKIP_TLS=true."
fi

# ── 1. OS packages ────────────────────────────────────────────────────────────
log "Installing base packages (git, nginx, openssl, curl, certbot)…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git openssl nginx >/dev/null
if [ "$SKIP_TLS" != "true" ]; then
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
fi

# ── 2. Docker ─────────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker Engine…"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker buildx version >/dev/null 2>&1 || die "docker buildx missing; install Docker's buildx plugin."
ok "Docker $(docker --version | awk '{print $3}' | tr -d ,) ready"

# ── 3. Clone / update the repo ────────────────────────────────────────────────
if [ ! -d "$APP_DIR/.git" ]; then
  [ -n "$REPO_URL" ] || die "$APP_DIR does not exist and REPO_URL is not set."
  log "Cloning $REPO_URL → $APP_DIR ($BRANCH)"
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  log "Repo exists at $APP_DIR — fetching $BRANCH"
  git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
fi
cd "$APP_DIR"

# ── 4. .env with strong, unique secrets (never clobber an existing one) ───────
set_env() {
  local key="$1" val="$2" file="${3:-.env}"
  if grep -qE "^${key}=" "$file"; then
    local tmp; tmp="$(mktemp)"
    awk -v k="$key" -v v="$val" 'BEGIN{FS=OFS="="} $1==k{print k"="v; next} {print}' "$file" > "$tmp"
    mv "$tmp" "$file"
  else
    printf '%s=%s\n' "$key" "$val" >> "$file"
  fi
}

if [ -f .env ]; then
  ok ".env already present — leaving it untouched"
else
  log "Generating .env with fresh secrets"
  cp deploy/env.production.template .env
  DB_PW="$(openssl rand -hex 24)"   # hex → URL-safe, no encoding needed in DATABASE_URL
  set_env POSTGRES_PASSWORD             "$DB_PW"
  set_env DATABASE_URL                  "postgresql://rundesk:${DB_PW}@postgres:5432/rundesk"
  set_env JWT_ACCESS_SECRET             "$(openssl rand -hex 32)"
  set_env JWT_REFRESH_SECRET            "$(openssl rand -hex 32)"
  set_env MEILISEARCH_MASTER_KEY        "$(openssl rand -hex 24)"
  set_env INTEGRATIONS_OAUTH_STATE_SECRET "$(openssl rand -hex 32)"
  set_env APP_URL                       "https://${DOMAIN}"
  set_env API_URL                       "https://${DOMAIN}"
  set_env API_PUBLIC_URL                "https://${DOMAIN}"
  set_env OAUTH_CALLBACK_URL            "https://${DOMAIN}/api/v1/auth/callback"
  set_env SMTP_FROM                     "noreply@${DOMAIN}"
  set_env EMAIL_FROM                    "noreply@${DOMAIN}"
  set_env WEB_PUSH_SUBJECT              "mailto:admin@${DOMAIN}"
  set_env API_HOST_PORT                 "$API_HOST_PORT"
  [ -n "$ANTHROPIC_API_KEY" ] && set_env ANTHROPIC_API_KEY "$ANTHROPIC_API_KEY"
  chmod 600 .env
  ok "Wrote .env (DB password + JWT/Meili/OAuth secrets are unique to this host)"
fi

# ── 5. Build + start the stack, apply schema + seed ───────────────────────────
# deploy.sh handles: web build → dist, API image, compose up, drizzle schema,
# and the idempotent seed. VITE_SHOW_SEEDED_LOGINS stays false so the seeded
# demo-logins box never renders in the production bundle.
export VITE_SHOW_SEEDED_LOGINS=false
export API_HOST_PORT
log "Building + starting containers (postgres, redis, meilisearch, api)…"
bash deploy/deploy.sh up
log "Applying DB schema + seed…"
bash deploy/deploy.sh migrate

# ── 6. nginx vhost + TLS (rendered for THIS domain + APP_DIR) ─────────────────
VHOST="/etc/nginx/sites-available/${DOMAIN}"
log "Writing nginx vhost → $VHOST"
sed -e "s|rundesk\.theaura\.agency|${DOMAIN}|g" \
    -e "s|/opt/rundesk|${APP_DIR}|g" \
    -e "s|127\.0\.0\.1:3010|127.0.0.1:${API_HOST_PORT}|g" \
    deploy/nginx/rundesk.theaura.agency.conf > "$VHOST"
ln -sf "$VHOST" "/etc/nginx/sites-enabled/${DOMAIN}"
# nginx (www-data) must be able to traverse+read the built SPA
chmod -R o+rX "${APP_DIR}/apps/web/dist" 2>/dev/null || true
chmod o+x "$APP_DIR" "${APP_DIR}/apps" "${APP_DIR}/apps/web" 2>/dev/null || true
nginx -t
systemctl reload nginx

if [ "$SKIP_TLS" = "true" ]; then
  ok "HTTP-only vhost installed (SKIP_TLS=true). Run certbot later for HTTPS."
else
  log "Issuing Let's Encrypt certificate for ${DOMAIN}…"
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$LE_EMAIL" --redirect
  ok "TLS enabled"
fi

# ── 7. Smoke check + summary ──────────────────────────────────────────────────
SCHEME="https"; [ "$SKIP_TLS" = "true" ] && SCHEME="http"
sleep 2
HEALTH="$(curl -fsS --max-time 8 "${SCHEME}://${DOMAIN}/api/v1/health" 2>/dev/null || echo FAIL)"

echo
ok  "Rundesk is deployed → ${SCHEME}://${DOMAIN}"
echo "   API health: ${HEALTH}"
echo
echo "   Seeded admin login (CHANGE THE PASSWORD IMMEDIATELY):"
echo "     email:    admin@rundesk.internal"
echo "     password: Admin@123!"
echo
echo "   Next steps:"
echo "     • Log in, then rotate the admin password and delete/disable seed accounts."
echo "     • Fill OAuth/SMTP/AI keys in ${APP_DIR}/.env, then: ./deploy/deploy.sh rebuild"
echo "         (Microsoft SSO's button only appears once MICROSOFT_CLIENT_ID/SECRET are set.)"
echo "     • Update later with:  cd ${APP_DIR} && ./deploy/deploy.sh rebuild"
echo "     • Tail logs with:     cd ${APP_DIR} && ./deploy/deploy.sh logs"
[ "$HEALTH" = "FAIL" ] && echo "   ⚠ health check did not return yet — give the API a few seconds, then re-check."
exit 0
