#!/usr/bin/env bash
#
# Check that the search type filter really narrows results, from the VPS shell.
# No browser needed.
#
#   bash deploy/verify-search-types.sh
#
# This one matters because it cannot be proven anywhere else: with Meilisearch
# running, search takes a different code path from the Postgres fallback used in
# development. A filter bug there is invisible until you test against a live
# Meili — which is what this does.
set -euo pipefail

cd "$(dirname "$0")/.."

ovr_port="${API_HOST_PORT:-}"
ovr_email="${RUNDESK_EMAIL:-}"
ovr_pass="${RUNDESK_PASSWORD:-}"
if [ -f .env ]; then set -a; . ./.env; set +a; fi

PORT="${ovr_port:-${API_HOST_PORT:-3010}}"
API="http://127.0.0.1:${PORT}/api/v1"
EMAIL="${ovr_email:-${RUNDESK_EMAIL:-admin@rundesk.internal}}"
PASSWORD="${ovr_pass:-${RUNDESK_PASSWORD:-Admin@123!}}"
Q="${SEARCH_QUERY:-a}"

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
ok()  { printf '  \033[32mPASS\033[0m %s\n' "$*"; }
bad() { printf '  \033[31mFAIL\033[0m %s\n' "$*"; }

api_container() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -iE '(^|-)api$|rundesk-api' | head -1 || true
}

say "API health"
for _ in $(seq 1 45); do
  curl -fsS --max-time 5 "$API/health" >/dev/null 2>&1 && break
  printf '.'; sleep 2
done
curl -fsS --max-time 5 "$API/health" >/dev/null 2>&1 || die "API not answering on $API"
echo "  ok"

say "Is Meilisearch actually connected?"
# The whole point of this script. If Meili is down the search silently uses the
# Postgres path, which filters correctly — so a pass would prove nothing.
MEILI=unknown
if command -v docker >/dev/null 2>&1; then
  C="$(api_container)"; C="${C:-rundesk-api}"
  LOGS=$(docker logs "$C" 2>&1 | grep -iE "Meilisearch (connected|init failed)" | tail -1 || true)
  if printf '%s' "$LOGS" | grep -qi "connected"; then MEILI=yes
  elif printf '%s' "$LOGS" | grep -qi "init failed"; then MEILI=no
  fi
  echo "  ${LOGS:-(no Meilisearch line in the API log)}"
fi
case "$MEILI" in
  yes) echo "  → Meili is up, so this exercises the path that was broken." ;;
  no)  printf '\033[1;33m  → Meili is DOWN: search will use the Postgres fallback and this\n     test cannot tell you anything about the Meili filter.\033[0m\n' ;;
  *)   echo "  → could not tell; treat the result with that in mind." ;;
esac

say "Signing in as $EMAIL"
TOKEN=$(curl -fsS --max-time 20 -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | grep -o '"accessToken":"[^"]*"' | head -1 | sed 's/.*://;s/"//g')
[ -n "$TOKEN" ] || die "login rejected — set RUNDESK_EMAIL / RUNDESK_PASSWORD if the admin password was rotated"
WS=$(curl -fsS --max-time 20 "$API/workspaces" -H "Authorization: Bearer $TOKEN" \
  | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*://;s/"//g')
[ -n "$WS" ] || die "no workspace visible for this account"
echo "  ok"

# Print the distinct entityTypes a search returns, one per line.
types_for() {
  curl -fsS --max-time 20 "$API/search/$WS?q=$Q${1:+&types=$1}" -H "Authorization: Bearer $TOKEN" \
    | tr ',' '\n' | grep -o '"entityType":"[^"]*"' | sed 's/.*://;s/"//g' | sort -u | tr '\n' ' '
}

say "Searching for \"$Q\""
ALL=$(types_for "")
echo "  no filter      -> ${ALL:-(nothing)}"
[ -n "$ALL" ] || die "search returned nothing at all — pick a query that matches with SEARCH_QUERY=..."

FAILED=0
for t in task doc file comment channel message user; do
  GOT=$(types_for "$t")
  GOT_TRIM=$(printf '%s' "$GOT" | xargs || true)
  if [ -z "$GOT_TRIM" ]; then
    printf '  \033[2mSKIP\033[0m types=%-8s no %s matches "%s"\n' "$t" "$t" "$Q"
  elif [ "$GOT_TRIM" = "$t" ]; then
    ok "types=$t returns only $t"
  else
    bad "types=$t returned: $GOT_TRIM"; FAILED=$((FAILED+1))
  fi
done

say "Multi-select — the case that was broken"
BOTH=$(types_for "task,message"); BOTH_TRIM=$(printf '%s' "$BOTH" | xargs || true)
echo "  types=task,message -> ${BOTH_TRIM:-(nothing)}"
case " $BOTH_TRIM " in
  *" doc "*|*" file "*|*" user "*|*" comment "*|*" channel "*)
    bad "leaked a type that was NOT selected — the Meili filter is not applying"; FAILED=$((FAILED+1)) ;;
  *) ok "no unselected types leaked" ;;
esac

echo
if [ "$FAILED" -eq 0 ]; then
  printf '\033[32m─── search type filtering is correct ───\033[0m\n'
else
  printf '\033[31m─── %s check(s) failed — send me the output above ───\033[0m\n' "$FAILED"
  exit 1
fi
