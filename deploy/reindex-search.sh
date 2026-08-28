#!/usr/bin/env bash
#
# Rebuild the Meilisearch index from the database.
#
#   bash deploy/reindex-search.sh
#
# Why this exists as a script rather than a curl line: the endpoint needs a
# bearer token and a workspace id, and pasting a command with <placeholders>
# into bash makes it read `<workspaceId>` as a file redirect. This finds both
# for you, and does every workspace rather than only the one you remembered.
#
# When you need it
# ----------------
# The index is written when a task is created or edited, so anything that
# existed BEFORE Meilisearch was pointed at this database was never indexed and
# cannot be found by searching — no amount of fixing the read path can return a
# document that is not there. Run this once after enabling Meilisearch, and
# again any time the index and the database might have drifted apart.
#
# It is safe to re-run: each workspace's documents are cleared and rewritten
# from the database, so the result depends on the database alone.
set -uo pipefail

cd "$(dirname "$0")/.."

# Caller-supplied values win over .env — captured before sourcing, because
# `set -a` would otherwise overwrite them.
ovr_port="${API_HOST_PORT:-}"
ovr_email="${RUNDESK_EMAIL:-}"
ovr_pass="${RUNDESK_PASSWORD:-}"
if [ -f .env ]; then set -a; . ./.env; set +a; fi

PORT="${ovr_port:-${API_HOST_PORT:-3010}}"
API="http://127.0.0.1:${PORT}/api/v1"
EMAIL="${ovr_email:-${RUNDESK_EMAIL:-admin@rundesk.internal}}"
PASSWORD="${ovr_pass:-${RUNDESK_PASSWORD:-Admin@123!}}"

say()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m%s\033[0m\n' "$*"; }
warn() { printf '  \033[33m%s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "node is needed to read the API's JSON"

say "API is up"
for _ in $(seq 1 45); do
  curl -fsS --max-time 5 "$API/health" >/dev/null 2>&1 && break
  printf '.'; sleep 2
done
curl -fsS --max-time 5 "$API/health" >/dev/null 2>&1 || die "API not answering on $API"
ok "ok"

say "Signing in as $EMAIL"
LOGIN=$(curl -fsS --max-time 30 -X POST "$API/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" 2>/dev/null) \
  || die "could not sign in as $EMAIL — set RUNDESK_EMAIL / RUNDESK_PASSWORD"

# Parsed properly rather than with grep/sed: a JWT and a workspace name can
# both contain the characters a regex would key on.
TOKEN=$(printf '%s' "$LOGIN" | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    try { process.stdout.write(JSON.parse(s)?.data?.accessToken ?? "") } catch { }
  })')
[ -n "$TOKEN" ] || die "signed in but no access token came back"

WS_IDS=$(printf '%s' "$LOGIN" | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    try {
      const ws = JSON.parse(s)?.data?.workspaces ?? []
      process.stdout.write(ws.map((w) => w.id).filter(Boolean).join("\n"))
    } catch { }
  })')
[ -n "$WS_IDS" ] || die "this account is not a member of any workspace"
ok "$(printf '%s\n' "$WS_IDS" | grep -c .) workspace(s) to rebuild"

TOTAL=0
FAILED=0
SKIPPED=0
while IFS= read -r WS; do
  [ -n "$WS" ] || continue
  say "Rebuilding $WS"
  # Generous timeout: this reads every live task, doc and attachment in the
  # workspace and writes them all back.
  RES=$(curl -fsS --max-time 600 -X POST "$API/search/$WS/reindex" \
    -H "authorization: Bearer $TOKEN" 2>/dev/null) || RES=""
  if [ -z "$RES" ]; then
    warn "no answer — the rebuild failed for this workspace"
    FAILED=$((FAILED+1))
    continue
  fi
  N=$(printf '%s' "$RES" | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try {
        const n = JSON.parse(s)?.data?.indexed
        process.stdout.write(n === undefined || n === null ? "" : String(n))
      } catch { }
    })')
  if [ -z "$N" ]; then
    # reindexWorkspace returns nothing when Meilisearch is not configured, so
    # an empty answer is that — not a failure. Said plainly rather than
    # reported as a successful rebuild that never happened.
    warn "nothing was indexed: Meilisearch is not configured on this deployment"
    warn "search is using the Postgres path, which reads the database directly"
    warn "and needs no index — there is nothing to rebuild."
    SKIPPED=$((SKIPPED+1))
    continue
  fi
  ok "indexed $N document(s)"
  TOTAL=$((TOTAL + N))
done <<< "$WS_IDS"

printf '\n%s\n' "════════════════════════════════════════════════════════════"
if [ "$FAILED" -gt 0 ]; then
  printf '\033[31m%s workspace(s) failed to rebuild\033[0m\n' "$FAILED"
  exit 1
fi
printf '\033[1m%s document(s) indexed\033[0m\n' "$TOTAL"
# Never claim the index matches the database when there is no index. A closing
# line that reads as success regardless of what happened is how a run that did
# nothing gets remembered as a run that worked.
if [ "$SKIPPED" -gt 0 ] && [ "$TOTAL" -eq 0 ]; then
  printf '\033[33m─── nothing to do: this deployment has no search index ───\033[0m\n'
else
  printf '\033[32m─── the search index now matches the database ───\033[0m\n'
fi
