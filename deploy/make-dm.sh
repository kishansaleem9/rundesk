#!/usr/bin/env bash
#
# Open a DM between this account and the first other workspace member, so the
# §A3.9 Chat / Calendar / Tasks strip has something to render:
#
#   bash deploy/make-dm.sh && node deploy/verify-ui.mjs
#
# It creates an empty channel and sends nothing. `ensureDmChannel` is
# idempotent — running it twice returns the same DM rather than a second one.
# Reads .env for the API port and credentials, same as the other scripts here.
set -uo pipefail
cd "$(dirname "$0")/.." 2>/dev/null || true
if [ -f .env ]; then set -a; . ./.env; set +a; fi
PORT="${API_HOST_PORT:-3010}"; API="http://127.0.0.1:${PORT}/api/v1"
EMAIL="${RUNDESK_EMAIL:-admin@rundesk.internal}"; PASS="${RUNDESK_PASSWORD:-Admin@123!}"
LOGIN=$(curl -fsS -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOK=$(printf '%s' "$LOGIN" | grep -o '"accessToken":"[^"]*"' | sed 's/.*://;s/"//g')
ME=$(printf '%s' "$LOGIN" | awk -F'"user":\\{' '{print $2}' | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*://;s/"//g')
WS=$(curl -fsS "$API/workspaces" -H "Authorization: Bearer $TOK" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*://;s/"//g')
PEER=$(curl -fsS "$API/workspaces/$WS/members" -H "Authorization: Bearer $TOK" \
  | grep -o '"userId":"[^"]*"' | sed 's/.*://;s/"//g' | grep -v -x "$ME" | head -1)
if [ -z "$PEER" ]; then echo "only one member in $WS — invite someone first"; exit 1; fi
OUT=$(curl -fsS -X POST "$API/workspaces/$WS/chat/dms" -H "Authorization: Bearer $TOK" \
  -H 'Content-Type: application/json' -d "{\"peerUserId\":\"$PEER\"}")
printf '%s' "$OUT" | grep -q '"id"' \
  && echo "✓ DM ready between $ME and $PEER — re-run: node deploy/verify-ui.mjs" \
  || { echo "✗ $OUT"; exit 1; }
