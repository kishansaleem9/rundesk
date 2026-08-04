#!/usr/bin/env bash
#
# Rebuild the Meilisearch index for every workspace this account can see.
#
#   bash deploy/reindex-search.sh
#
# Required once after the release that added `updatedAt` to the indexed
# document. Documents written before it have no such field, and Meili's
# behaviour when sorting on a missing attribute is not something to rely on —
# a "last updated" search would quietly return them in an arbitrary order.
#
# Safe to re-run: indexing is an upsert keyed by document id, so this replaces
# documents rather than duplicating them, and nothing in Postgres is touched.
set -uo pipefail

cd "$(dirname "$0")/.."

ovr_port="${API_HOST_PORT:-}"
ovr_email="${RUNDESK_EMAIL:-}"
ovr_pass="${RUNDESK_PASSWORD:-}"
if [ -f .env ]; then set -a; . ./.env; set +a; fi

PORT="${ovr_port:-${API_HOST_PORT:-3010}}"
API="http://127.0.0.1:${PORT}/api/v1"
EMAIL="${ovr_email:-${RUNDESK_EMAIL:-admin@rundesk.internal}}"
PASSWORD="${ovr_pass:-${RUNDESK_PASSWORD:-Admin@123!}}"

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

say "API is up"
for _ in $(seq 1 45); do
  curl -fsS --max-time 5 "$API/health" >/dev/null 2>&1 && break
  printf '.'; sleep 2
done
curl -fsS --max-time 5 "$API/health" >/dev/null 2>&1 || die "API not answering on $API"
echo "  ok"

say "Is Meilisearch actually connected?"
# Without it the reindex is a silent no-op — the service returns early when
# search is running on the Postgres fallback. Better to say so than to print a
# reassuring tick over nothing.
if command -v docker >/dev/null 2>&1; then
  C="$(docker ps --format '{{.Names}}' 2>/dev/null | grep -iE '(^|-)api$|rundesk-api' | head -1 || true)"
  LOGS=$(docker logs "${C:-rundesk-api}" 2>&1 | grep -iE "Meilisearch (connected|init failed)" | tail -1 || true)
  echo "  ${LOGS:-(no Meilisearch line in the API log)}"
  if printf '%s' "$LOGS" | grep -qi "init failed"; then
    printf '\033[1;33m  Meili is DOWN — reindexing would do nothing. Fix that first.\033[0m\n'
    exit 1
  fi
fi

say "Signing in as $EMAIL"
TOKEN=$(curl -fsS --max-time 20 -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | grep -o '"accessToken":"[^"]*"' | head -1 | sed 's/.*://;s/"//g' || true)
[ -n "$TOKEN" ] || die "login rejected — set RUNDESK_EMAIL / RUNDESK_PASSWORD if the admin password was rotated"

WS_IDS=$(curl -fsS --max-time 20 "$API/workspaces" -H "Authorization: Bearer $TOKEN" \
  | grep -o '"id":"[0-9a-f-]\{36\}"' | sed 's/.*://;s/"//g' | sort -u || true)
[ -n "$WS_IDS" ] || die "no workspaces visible for this account"

say "Reindexing"
COUNT=0; FAILED=0
for ws in $WS_IDS; do
  # The endpoint returns an empty body on success; a non-2xx means it did not run.
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 180 -X POST \
    "$API/search/$ws/reindex" -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' -d '{}' || true)
  if [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; then
    printf '  \033[32mok\033[0m   %s\n' "$ws"; COUNT=$((COUNT+1))
  else
    printf '  \033[31mfail\033[0m %s (HTTP %s)\n' "$ws" "$CODE"; FAILED=$((FAILED+1))
  fi
done

echo
if [ "$FAILED" -eq 0 ]; then
  printf '\033[32m─── reindexed %s workspace(s) ───\033[0m\n' "$COUNT"
  echo "Now run: bash deploy/verify-release.sh"
else
  printf '\033[31m─── %s workspace(s) failed to reindex ───\033[0m\n' "$FAILED"
  exit 1
fi
