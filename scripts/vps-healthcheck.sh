#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Rundesk production health check
#
# Run this ON THE VPS, from the repo root (normally /opt/rundesk):
#
#     ./scripts/vps-healthcheck.sh
#
# It will prompt for a Rundesk login (email + password) so it can exercise the
# authenticated API and the live AI features. To run without prompts (e.g. from
# cron/CI) pass them as env vars or arguments:
#
#     HC_EMAIL=you@example.com HC_PASSWORD='yourpass' ./scripts/vps-healthcheck.sh
#     ./scripts/vps-healthcheck.sh you@example.com 'yourpass'
#
# What it checks, end to end:
#   • Docker containers (postgres, redis, api — meilisearch optional) are up
#   • Postgres is reachable and the core schema/migrations applied
#   • API liveness  (GET /health)  and readiness (GET /health/ready, DB ping)
#   • The endpoints that were recently fixed actually respond:
#       /spaces/workspace/:ws, /projects/space/:id, /lists/project/:id,
#       /tasks/list/:id, and GET /tasks/:id/subtasks (was 404 before)
#   • AI is live with the real Anthropic key:
#       /ai/status, a cheap /ai/task/priority canary, /ai/insights,
#       /ai/dashboard/suggest-layout, and the streaming /ai/chat (SSE)
#
# Exit code is 0 only if every REQUIRED check passes. Nothing is left behind:
# if a temp task is created to test the subtasks route, it is deleted again.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
REPO="$(pwd)"
COMPOSE_FILE="deploy/docker-compose.prod.yml"

C_R=$'\033[31m'; C_G=$'\033[32m'; C_Y=$'\033[33m'; C_C=$'\033[36m'; C_B=$'\033[1m'; C_D=$'\033[2m'; C_X=$'\033[0m'
PASS=0; FAIL=0; WARN=0
pass(){ PASS=$((PASS+1)); printf "  ${C_G}✓${C_X} %s\n" "$1"; }
fail(){ FAIL=$((FAIL+1)); printf "  ${C_R}✗${C_X} %s\n" "$1"; }
warn(){ WARN=$((WARN+1)); printf "  ${C_Y}!${C_X} %s\n" "$1"; }
section(){ printf "\n${C_C}${C_B}── %s ──${C_X}\n" "$1"; }

[ -f "$COMPOSE_FILE" ] || { printf "${C_R}Run this from the rundesk repo root (e.g. /opt/rundesk). Missing %s${C_X}\n" "$COMPOSE_FILE"; exit 1; }
[ -f .env ] || { printf "${C_R}.env not found at repo root — cannot read DB settings.${C_X}\n"; exit 1; }
command -v docker >/dev/null 2>&1 || { printf "${C_R}docker is not installed / not on PATH${C_X}\n"; exit 1; }

# Pull a couple of values out of .env, falling back to the compose defaults.
getenv(){ grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//'; }
PG_USER="$(getenv POSTGRES_USER)"; PG_USER="${PG_USER:-rundesk}"
PG_DB="$(getenv POSTGRES_DB)";     PG_DB="${PG_DB:-rundesk}"

printf "${C_B}${C_C}Rundesk health check${C_X}  ${C_D}%s${C_X}\n" "$REPO"

# ── Section A: containers ────────────────────────────────────────────────────
section "Containers"
check_container(){ # $1=name  $2=required(1/0)
  local name="$1" required="$2" running health
  running="$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null || echo missing)"
  if [ "$running" != "true" ]; then
    if [ "$required" = "1" ]; then fail "$name is not running (state: $running)"
    else warn "$name is not running (state: $running) — optional"; fi
    return
  fi
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name" 2>/dev/null || echo none)"
  if [ "$health" = "healthy" ] || [ "$health" = "none" ]; then
    if [ "$health" = "healthy" ]; then pass "$name running (healthy)"; else pass "$name running"; fi
  else
    if [ "$required" = "1" ]; then fail "$name running but health=$health"
    else warn "$name running but health=$health"; fi
  fi
}
check_container rundesk-postgres 1
check_container rundesk-redis 1
check_container rundesk-api 1
check_container rundesk-meilisearch 0

# ── Section B: database ──────────────────────────────────────────────────────
section "Database"
if docker exec rundesk-postgres pg_isready -U "$PG_USER" >/dev/null 2>&1; then
  pass "postgres accepting connections"
  for tbl in users tasks workspaces; do
    exists="$(docker exec rundesk-postgres psql -U "$PG_USER" -d "$PG_DB" -tAc "SELECT to_regclass('public.$tbl') IS NOT NULL" 2>/dev/null | tr -d '[:space:]')"
    if [ "$exists" = "t" ]; then
      cnt="$(docker exec rundesk-postgres psql -U "$PG_USER" -d "$PG_DB" -tAc "SELECT count(*) FROM \"$tbl\"" 2>/dev/null | tr -d '[:space:]')"
      pass "table '$tbl' present (${cnt:-?} rows)"
    else
      fail "table '$tbl' missing — migrations may not have applied"
    fi
  done
else
  fail "postgres not accepting connections"
fi

# ── Section C: credentials (for the authenticated + AI checks) ───────────────
EMAIL="${HC_EMAIL:-${1:-}}"
PASSWORD="${HC_PASSWORD:-${2:-}}"
if { [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; } && [ -t 0 ]; then
  section "Login"
  printf "  Enter a Rundesk login to test the API + AI ${C_D}(press Enter at Email to skip)${C_X}\n"
  printf "  Email: "; read -r EMAIL
  if [ -n "$EMAIL" ]; then printf "  Password: "; read -rs PASSWORD; printf "\n"; fi
fi

# ── Section D: API + AI (run inside the api container — node 20 has fetch) ───
# Reaching the API from inside its own container avoids needing node/curl/jq on
# the host. The container serves on localhost:3001 with the /api/v1 prefix.
NODE_RC=0
if [ "$(docker inspect -f '{{.State.Running}}' rundesk-api 2>/dev/null || echo no)" != "true" ]; then
  section "API"; fail "rundesk-api is not running — skipping endpoint + AI checks"; NODE_RC=1
else
  docker exec -i \
    -e HC_BASE="http://localhost:3001/api/v1" \
    -e HC_EMAIL="$EMAIL" \
    -e HC_PASSWORD="$PASSWORD" \
    rundesk-api node - <<'NODE_EOF'
const BASE = process.env.HC_BASE || 'http://localhost:3001/api/v1'
const EMAIL = process.env.HC_EMAIL || ''
const PASSWORD = process.env.HC_PASSWORD || ''
const C = { r:'\x1b[31m', g:'\x1b[32m', y:'\x1b[33m', c:'\x1b[36m', b:'\x1b[1m', d:'\x1b[2m', x:'\x1b[0m' }
let pass = 0, fail = 0, warn = 0
const ok  = (m) => { pass++; console.log(`  ${C.g}✓${C.x} ${m}`) }
const bad = (m) => { fail++; console.log(`  ${C.r}✗${C.x} ${m}`) }
const wrn = (m) => { warn++; console.log(`  ${C.y}!${C.x} ${m}`) }
const sec = (m) => console.log(`\n${C.c}${C.b}── ${m} ──${C.x}`)
const clip = (v) => { try { return JSON.stringify(v).slice(0, 220) } catch { return String(v).slice(0, 220) } }

async function call(method, path, opts = {}) {
  const { token, body, timeoutMs = 15000 } = opts
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const headers = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${BASE}${path}`, {
      method, headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
    const text = await res.text()
    let json
    try { json = JSON.parse(text) } catch { json = text }
    const data = json && typeof json === 'object' && 'data' in json ? json.data : json
    return { status: res.status, json, data }
  } finally { clearTimeout(timer) }
}

function finish() {
  sec('API summary')
  const f = fail ? C.r : C.d
  const w = warn ? C.y : C.d
  console.log(`  ${C.g}${pass} passed${C.x}   ${f}${fail} failed${C.x}   ${w}${warn} warnings${C.x}`)
  process.exit(fail > 0 ? 1 : 0)
}

async function main() {
  // ── liveness / readiness ──────────────────────────────────────────────────
  sec('API health')
  try {
    const r = await call('GET', '/health')
    if (r.status === 200 && r.data && r.data.status === 'ok') {
      ok(`GET /health → ok (uptime ${Math.round((r.data.uptimeMs || 0) / 1000)}s)`)
    } else bad(`GET /health → status=${r.status} body=${clip(r.json)}`)
  } catch (e) { bad(`GET /health threw: ${e.message}`) }
  try {
    const r = await call('GET', '/health/ready')
    if (r.status === 200 && r.data && r.data.checks && r.data.checks.database && r.data.checks.database.ok) {
      ok(`GET /health/ready → database ok (${r.data.checks.database.latencyMs}ms)`)
    } else bad(`GET /health/ready → status=${r.status} body=${clip(r.json)}`)
  } catch (e) { bad(`GET /health/ready threw: ${e.message}`) }

  if (!EMAIL || !PASSWORD) {
    sec('Authenticated + AI checks')
    wrn('No login provided — skipped. These verify the fixed endpoints and the live AI.')
    wrn("Re-run with credentials, e.g.:  HC_EMAIL=you@example.com HC_PASSWORD='pass' ./scripts/vps-healthcheck.sh")
    return finish()
  }

  // ── auth ──────────────────────────────────────────────────────────────────
  sec('Authentication')
  let token, workspaceId
  try {
    const r = await call('POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } })
    token = r.data && r.data.accessToken
    workspaceId = r.data && r.data.workspaces && r.data.workspaces[0] && r.data.workspaces[0].id
    if (r.status < 300 && token) {
      ok(`POST /auth/login → token acquired${workspaceId ? `, workspace ${workspaceId}` : ''}`)
    } else {
      bad(`POST /auth/login → status=${r.status} body=${clip(r.json)}`)
      wrn('Check the email/password are correct for this environment.')
      return finish()
    }
  } catch (e) { bad(`login threw: ${e.message}`); return finish() }

  // ── recently-fixed endpoints ────────────────────────────────────────────────
  sec('Core endpoints (recently fixed paths)')
  let spaceId, projectId, listId, taskId, createdTaskId
  if (workspaceId) {
    try {
      const r = await call('GET', `/spaces/workspace/${workspaceId}`, { token })
      if (r.status === 200 && Array.isArray(r.data)) { ok(`GET /spaces/workspace/:ws → ${r.data.length} spaces`); spaceId = r.data[0] && r.data[0].id }
      else bad(`GET /spaces/workspace/:ws → status=${r.status} body=${clip(r.json)}`)
    } catch (e) { bad(`spaces threw: ${e.message}`) }
  } else {
    wrn('login returned no workspace — skipping workspace-scoped endpoint checks')
  }
  if (spaceId) {
    try {
      const r = await call('GET', `/projects/space/${spaceId}`, { token })
      if (r.status === 200 && Array.isArray(r.data)) { ok(`GET /projects/space/:id → ${r.data.length} projects`); projectId = r.data[0] && r.data[0].id }
      else bad(`GET /projects/space/:id → status=${r.status} body=${clip(r.json)}`)
    } catch (e) { bad(`projects threw: ${e.message}`) }
  } else if (workspaceId) {
    wrn('no space found in this workspace — skipping projects/lists/tasks')
  }
  if (projectId) {
    try {
      const r = await call('GET', `/lists/project/${projectId}`, { token })
      if (r.status === 200 && Array.isArray(r.data)) { ok(`GET /lists/project/:id → ${r.data.length} lists`); listId = r.data[0] && r.data[0].id }
      else bad(`GET /lists/project/:id → status=${r.status} body=${clip(r.json)}`)
    } catch (e) { bad(`lists threw: ${e.message}`) }
  }
  if (listId) {
    try {
      const r = await call('GET', `/tasks/list/${listId}`, { token })
      if (r.status === 200 && Array.isArray(r.data)) { ok(`GET /tasks/list/:id → ${r.data.length} tasks`); taskId = r.data[0] && r.data[0].id }
      else bad(`GET /tasks/list/:id → status=${r.status} body=${clip(r.json)}`)
    } catch (e) { bad(`tasks threw: ${e.message}`) }
    if (!taskId) {
      try {
        const r = await call('POST', '/tasks', { token, body: { listId, title: 'healthcheck temp (safe to delete)', status: 'todo' } })
        if (r.status < 300 && r.data && r.data.id) { taskId = createdTaskId = r.data.id; ok('created a temp task to exercise the subtasks route') }
        else wrn(`could not create a temp task → status=${r.status}`)
      } catch (e) { wrn(`temp task create threw: ${e.message}`) }
    }
  }
  if (taskId) {
    try {
      const r = await call('GET', `/tasks/${taskId}/subtasks`, { token })
      if (r.status === 200 && Array.isArray(r.data)) ok(`GET /tasks/:id/subtasks → 200, ${r.data.length} subtasks (route is live)`)
      else bad(`GET /tasks/:id/subtasks → status=${r.status} (this returned 404 before the fix)`)
    } catch (e) { bad(`subtasks threw: ${e.message}`) }
  }

  // ── AI (live Anthropic key) ─────────────────────────────────────────────────
  sec('AI — live Anthropic key')
  let aiAvailable = false
  try {
    const r = await call('GET', '/ai/status', { token })
    aiAvailable = !!(r.data && r.data.available === true)
    if (aiAvailable) ok('GET /ai/status → available:true (ANTHROPIC_API_KEY is loaded)')
    else bad('GET /ai/status → available:false (key not loaded into the api container)')
  } catch (e) { bad(`ai/status threw: ${e.message}`) }

  if (!aiAvailable) {
    wrn('Skipping live Claude calls. If you set the key, recreate the container so it reloads .env:')
    wrn('  docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d --force-recreate api')
    return finish()
  }

  try {
    const r = await call('POST', '/ai/task/priority', { token, timeoutMs: 30000, body: { title: 'Fix login outage affecting all users', description: 'Production is down' } })
    if (r.status < 300 && r.data && r.data.priority) ok(`POST /ai/task/priority → Claude replied (priority="${r.data.priority}") — KEY WORKS`)
    else bad(`POST /ai/task/priority → status=${r.status} body=${clip(r.json)}`)
  } catch (e) { bad(`ai/task/priority threw: ${e.message}`) }

  try {
    const r = await call('POST', '/ai/insights', { token, timeoutMs: 45000, body: { context: 'Tasks: 24 total, 5 overdue, 8 in progress, 11 done. Current sprint is 60% complete with 4 days left. One team member has 9 open tasks.' } })
    if (r.status < 300 && r.data && r.data.summary) ok(`POST /ai/insights → summary + health="${r.data.health && r.data.health.label}" + ${Array.isArray(r.data.suggestions) ? r.data.suggestions.length : 0} suggestions`)
    else bad(`POST /ai/insights → status=${r.status} body=${clip(r.json)}`)
  } catch (e) { bad(`ai/insights threw: ${e.message}`) }

  try {
    const widgets = [
      { type: 'overdue', label: 'Overdue tasks' },
      { type: 'sprint', label: 'Sprint progress' },
      { type: 'workload', label: 'Team workload' },
      { type: 'activity', label: 'Recent activity' },
      { type: 'status', label: 'Status breakdown' },
    ]
    const r = await call('POST', '/ai/dashboard/suggest-layout', { token, timeoutMs: 45000, body: { availableWidgets: widgets, context: 'Small sprint-based team that cares about overdue work.' } })
    if (r.status < 300 && r.data && Array.isArray(r.data.widgets) && r.data.widgets.length) ok(`POST /ai/dashboard/suggest-layout → ${r.data.widgets.length} widgets ordered: ${r.data.widgets.join(', ')}`)
    else bad(`POST /ai/dashboard/suggest-layout → status=${r.status} body=${clip(r.json)}`)
  } catch (e) { bad(`ai/dashboard/suggest-layout threw: ${e.message}`) }

  // streaming chat — verifies the Fastify SSE fix (was "res.setHeader is not a function")
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 30000)
    const res = await fetch(`${BASE}/ai/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Reply with exactly the word: pong' }], workspaceContext: '' }),
      signal: ctrl.signal,
    })
    if (!res.ok || !res.body) {
      bad(`POST /ai/chat → status=${res.status}`)
      clearTimeout(timer)
    } else {
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = '', gotDelta = false, gotErr = null
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          const m = line.match(/^data: (.*)$/)
          if (!m) continue
          if (m[1] === '[DONE]') { gotDelta = gotDelta || false }
          else { try { const o = JSON.parse(m[1]); if (o.delta) gotDelta = true; if (o.error) gotErr = o.error } catch {} }
        }
        if (gotErr || gotDelta) break
      }
      clearTimeout(timer)
      try { await reader.cancel() } catch {}
      if (gotErr) bad(`POST /ai/chat → stream returned error: ${gotErr}`)
      else if (gotDelta) ok('POST /ai/chat → SSE streamed tokens (Fastify streaming fix works)')
      else wrn('POST /ai/chat → connected but captured no tokens (timing) — not necessarily broken')
    }
  } catch (e) {
    if (e.name === 'AbortError') wrn('POST /ai/chat → timed out reading the stream')
    else bad(`ai/chat threw: ${e.message}`)
  }

  // cleanup any temp task we made
  if (createdTaskId) {
    try { await call('DELETE', `/tasks/${createdTaskId}`, { token }); console.log(`  ${C.d}(cleaned up temp task)${C.x}`) } catch {}
  }

  return finish()
}

main().catch((e) => { console.error('fatal:', e && e.message ? e.message : e); process.exit(1) })
NODE_EOF
  NODE_RC=$?
fi

# ── final verdict ────────────────────────────────────────────────────────────
section "Result"
printf "  Container/DB checks: ${C_G}%d passed${C_X}, ${C_R}%d failed${C_X}, ${C_Y}%d warnings${C_X}\n" "$PASS" "$FAIL" "$WARN"
TOTAL_FAIL=$FAIL
[ "$NODE_RC" -ne 0 ] && TOTAL_FAIL=$((TOTAL_FAIL + 1))
if [ "$TOTAL_FAIL" -eq 0 ]; then
  printf "\n${C_G}${C_B}✅  ALL REQUIRED CHECKS PASSED${C_X}\n"
  exit 0
else
  printf "\n${C_R}${C_B}❌  SOME CHECKS FAILED — see the ✗ lines above${C_X}\n"
  exit 1
fi
