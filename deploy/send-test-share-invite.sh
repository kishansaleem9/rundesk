#!/usr/bin/env bash
#
# Send a real "shared with you" invite email, entirely from the VPS shell.
# No browser needed — useful when the machine you're on can't reach the site.
#
#   bash deploy/send-test-share-invite.sh someone@example.com
#
# Talks to the API on its loopback port (the same one nginx proxies to), logs in
# as an admin, shares a space with that address, then shows what the mail layer
# actually did.
#
# Credentials default to the seeded admin; override if you've rotated them:
#   RUNDESK_EMAIL=you@example.com RUNDESK_PASSWORD='...' bash deploy/send-test-share-invite.sh dest@example.com
set -euo pipefail

TO="${1:-}"
if [ -z "$TO" ]; then
  echo "usage: bash deploy/send-test-share-invite.sh <email-to-invite>" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

# Anything you export on the command line beats what .env says.
ovr_port="${API_HOST_PORT:-}"
ovr_email="${RUNDESK_EMAIL:-}"
ovr_pass="${RUNDESK_PASSWORD:-}"
if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

PORT="${ovr_port:-${API_HOST_PORT:-3010}}"
API="http://127.0.0.1:${PORT}/api/v1"
EMAIL="${ovr_email:-${RUNDESK_EMAIL:-admin@rundesk.internal}}"
PASSWORD="${ovr_pass:-${RUNDESK_PASSWORD:-Admin@123!}}"
LEVEL="${SHARE_LEVEL:-view}"

# Pull one value out of a JSON blob without needing jq/node on the host.
jget() { grep -o "\"$1\":\"[^\"]*\"" | head -1 | sed "s/\"$1\":\"//;s/\"$//"; }

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# The API container is usually still booting when this runs right after a
# deploy. Docker binds the host port immediately, so an early probe gets
# "connection reset by peer" rather than "refused" — that is not a failure yet.
api_container() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -iE '(^|-)api$|rundesk-api' | head -1 || true
}

say "API health"
HEALTHY=no
for _ in $(seq 1 45); do
  if curl -fsS --max-time 5 "$API/health" >/dev/null 2>&1; then HEALTHY=yes; break; fi
  printf '.'
  sleep 2
done
if [ "$HEALTHY" != yes ]; then
  printf '\n'
  printf '\033[1;31m✗ API still not answering on %s after 90s.\033[0m\n' "$API" >&2
  if command -v docker >/dev/null 2>&1; then
    C="$(api_container)"; C="${C:-rundesk-api}"
    printf '\n--- docker ps ---\n'
    docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>&1 | head -12 || true
    printf '\n--- last 40 lines of %s ---\n' "$C"
    docker logs --tail 40 "$C" 2>&1 || true
    printf '\n'
  fi
  die "The API is not serving — the log above says why. Restart it with:
     docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d --force-recreate api"
fi
echo "  ok"

say "Signing in as $EMAIL"
LOGIN=$(curl -fsS --max-time 20 -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}") || die "login request failed"
TOKEN=$(printf '%s' "$LOGIN" | jget accessToken)
[ -n "$TOKEN" ] || die "login rejected. Set RUNDESK_EMAIL / RUNDESK_PASSWORD if the admin password was rotated."
echo "  ok"

say "Finding a workspace + space to share"
WS=$(curl -fsS --max-time 20 "$API/workspaces" -H "Authorization: Bearer $TOKEN" | jget id)
[ -n "$WS" ] || die "no workspace visible for this account"
SPACES=$(curl -fsS --max-time 20 "$API/spaces/workspace/$WS" -H "Authorization: Bearer $TOKEN")
SPACE=$(printf '%s' "$SPACES" | jget id)
SPACE_NAME=$(printf '%s' "$SPACES" | jget name)
[ -n "$SPACE" ] || die "no space found in workspace $WS — create one first"
echo "  workspace $WS"
echo "  space     $SPACE (${SPACE_NAME:-unnamed})"

say "Sharing that space with $TO (level: $LEVEL)"
RESP=$(curl -sS --max-time 30 -X POST "$API/shares/space/$SPACE" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$TO\",\"level\":\"$LEVEL\"}")
echo "  response: $RESP"
printf '%s' "$RESP" | grep -q '"ok":true' || die "the share call failed — see the response above"

say "Reading the share back"
curl -fsS --max-time 20 "$API/shares/space/$SPACE" -H "Authorization: Bearer $TOKEN" \
  | tr ',' '\n' | grep -iE "invitedEmail|\"level\"" | head -6 || true

say "What the mail layer did"
if command -v docker >/dev/null 2>&1; then
  CONTAINER="$(api_container)"
  CONTAINER="${CONTAINER:-rundesk-api}"
  LOGS=$(docker logs --since 5m "$CONTAINER" 2>&1 | grep -iE "EMAIL SENT|DEV EMAIL|SMTP|notification email failed" | tail -8 || true)
  if [ -n "$LOGS" ]; then printf '%s\n' "$LOGS"; else echo "  (nothing from the mail layer in the last 5 minutes of $CONTAINER)"; fi
else
  echo "  docker not on PATH — check your API logs for 'EmailService'"
fi

ENVPATH="$(pwd)/.env"
cat <<EOF

────────────────────────────────────────────────────────────
How to read the mail-layer lines above:

  [EMAIL SENT] To: $TO
      Sent for real. It left the server — check the inbox, then spam.

  [DEV EMAIL] To: $TO
      SMTP is NOT configured, so the message was only logged, never sent.
      Put SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM in
      $ENVPATH and re-run:  bash deploy/deploy-prod.sh
      (a plain 'docker restart' will not reload .env)

  notification email failed: ...
      SMTP is configured but the mail server rejected it. The reason is
      printed on that same line — usually auth or a blocked From address.

  nothing at all
      The API container has a different name. Find it with 'docker ps',
      then: docker logs --since 5m <name> | grep -i email

The share grant itself is saved either way — the read-back above is the proof.
Only delivery depends on SMTP.
────────────────────────────────────────────────────────────
EOF
