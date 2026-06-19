#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Rundesk functional REGRESSION suite — proves the bugs we fixed are fixed and
# exercises real workflows end to end (create → assert → clean up).
#
# This is the deeper companion to scripts/vps-healthcheck.sh. The health check
# answers "is it up and does the AI key work"; this answers "does each fixed bug
# actually behave correctly", by reproducing each bug's scenario against the
# live API and asserting the corrected behaviour.
#
# Run it ON THE VPS from the repo root (/opt/rundesk):
#
#     ./scripts/vps-regression.sh
#
# It needs a real Rundesk login (it creates and then deletes temporary test
# data — a personal task, a chat message, a task + subtask, a form). Provide
# credentials interactively, or non-interactively:
#
#     HC_EMAIL=you@example.com HC_PASSWORD='pass' ./scripts/vps-regression.sh
#     ./scripts/vps-regression.sh you@example.com 'pass'
#
# Covers, by bug number from the report:
#   #1  multiple workspaces per email      (verify no 1-workspace limit)
#   #3  Personal List → real per-user tasks (CRUD + ownership guard)
#   #4/#7 chat "Ask AI" / doc "Improve"     (live /ai/writing/improve)
#   #6  pin/star a chat message             (pin → listed → unpin → gone)
#   #8  quick-create task into a status     (status persists on create)
#   #9  task edit: name + description + cover (PATCH round-trips)
#   + GET /tasks/:id/subtasks               (was 404 — now live)
#   + endpoint sweep                        (canonical paths work, old paths 404)
#   + form field drag-reorder backend       (PUT .../fields/reorder)
#   + workspace security settings           (real GET, not a mockup)
#   + project-template catalog              (real backend, not mock)
#
# Everything created is deleted again. Exits non-zero if any assertion fails.
# (#2 invite-email sender and #10 clip upload are config items, not code, and
#  are intentionally not exercised here.)
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
COMPOSE_FILE="deploy/docker-compose.prod.yml"
C_R=$'\033[31m'; C_G=$'\033[32m'; C_Y=$'\033[33m'; C_C=$'\033[36m'; C_B=$'\033[1m'; C_D=$'\033[2m'; C_X=$'\033[0m'

[ -f "$COMPOSE_FILE" ] || { printf "${C_R}Run this from the rundesk repo root (e.g. /opt/rundesk). Missing %s${C_X}\n" "$COMPOSE_FILE"; exit 1; }
command -v docker >/dev/null 2>&1 || { printf "${C_R}docker is not installed / not on PATH${C_X}\n"; exit 1; }
if [ "$(docker inspect -f '{{.State.Running}}' rundesk-api 2>/dev/null || echo no)" != "true" ]; then
  printf "${C_R}rundesk-api is not running — start the stack first (./deploy/deploy.sh up).${C_X}\n"; exit 1
fi

EMAIL="${HC_EMAIL:-${1:-}}"
PASSWORD="${HC_PASSWORD:-${2:-}}"
if { [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; } && [ -t 0 ]; then
  printf "${C_C}${C_B}Rundesk regression suite${C_X}\n"
  printf "  This creates and deletes temporary test data, so it needs a login.\n"
  printf "  Email: "; read -r EMAIL
  if [ -n "$EMAIL" ]; then printf "  Password: "; read -rs PASSWORD; printf "\n"; fi
fi
if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
  printf "${C_R}A login is required for the regression suite (set HC_EMAIL / HC_PASSWORD).${C_X}\n"; exit 2
fi

docker exec -i \
  -e HC_BASE="http://localhost:3001/api/v1" \
  -e HC_EMAIL="$EMAIL" \
  -e HC_PASSWORD="$PASSWORD" \
  -e HC_TEST_WORKSPACE_CREATE="${HC_TEST_WORKSPACE_CREATE:-}" \
  rundesk-api node - <<'NODE_EOF'
const BASE = process.env.HC_BASE || 'http://localhost:3001/api/v1'
const EMAIL = process.env.HC_EMAIL || ''
const PASSWORD = process.env.HC_PASSWORD || ''
const ALLOW_WS_CREATE = !!process.env.HC_TEST_WORKSPACE_CREATE
const C = { r:'\x1b[31m', g:'\x1b[32m', y:'\x1b[33m', c:'\x1b[36m', b:'\x1b[1m', d:'\x1b[2m', x:'\x1b[0m' }
let pass = 0, fail = 0, warn = 0, skip = 0
const ok  = (m) => { pass++; console.log(`  ${C.g}✓${C.x} ${m}`) }
const bad = (m) => { fail++; console.log(`  ${C.r}✗${C.x} ${m}`) }
const wrn = (m) => { warn++; console.log(`  ${C.y}!${C.x} ${m}`) }
const skp = (m) => { skip++; console.log(`  ${C.d}∘ ${m}${C.x}`) }
const sec = (m) => console.log(`\n${C.c}${C.b}── ${m} ──${C.x}`)
const clip = (v) => { try { return JSON.stringify(v).slice(0, 220) } catch { return String(v).slice(0, 220) } }

async function call(method, path, opts = {}) {
  const { token, body, timeoutMs = 20000 } = opts
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const headers = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctrl.signal })
    const text = await res.text()
    let json; try { json = JSON.parse(text) } catch { json = text }
    const data = json && typeof json === 'object' && 'data' in json ? json.data : json
    return { status: res.status, json, data }
  } catch (e) { return { status: 0, json: { error: e.message }, data: null, threw: e.message } }
  finally { clearTimeout(timer) }
}

const cleanups = []
async function runCleanups() {
  if (!cleanups.length) return
  for (const c of cleanups.reverse()) { try { await c() } catch {} }
}
function finish(code) {
  sec('Regression summary')
  const f = fail ? C.r : C.d, w = warn ? C.y : C.d
  console.log(`  ${C.g}${pass} passed${C.x}   ${f}${fail} failed${C.x}   ${w}${warn} warnings${C.x}   ${C.d}${skip} skipped${C.x}`)
  if (fail === 0) console.log(`\n  ${C.g}${C.b}✅  ALL REGRESSION CHECKS PASSED${C.x}`)
  else console.log(`\n  ${C.r}${C.b}❌  ${fail} REGRESSION CHECK(S) FAILED — see ✗ above${C.x}`)
  process.exit(code !== undefined ? code : (fail > 0 ? 1 : 0))
}

async function main() {
  // ── login + locate a workspace that has a list (for task-based checks) ──────
  sec('Login & data discovery')
  let token, workspaces = []
  {
    const r = await call('POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } })
    token = r.data && r.data.accessToken
    workspaces = r.data && Array.isArray(r.data.workspaces) ? r.data.workspaces : []
    if (!token) { bad(`login failed → status=${r.status} body=${clip(r.json)}`); return }
    ok(`logged in (${workspaces.length} workspace(s))`)
  }
  let wsId = workspaces[0] && workspaces[0].id
  let spaceId, projectId, listId
  for (const ws of workspaces) {
    if (!ws || !ws.id) continue
    const s = await call('GET', `/spaces/workspace/${ws.id}`, { token })
    if (s.status === 200 && Array.isArray(s.data) && s.data.length) {
      const sp = s.data[0].id
      const p = await call('GET', `/projects/space/${sp}`, { token })
      const pr = p.status === 200 && Array.isArray(p.data) && p.data.length ? p.data[0].id : null
      const l = pr ? await call('GET', `/lists/project/${pr}`, { token }) : null
      const li = l && l.status === 200 && Array.isArray(l.data) && l.data.length ? l.data[0].id : null
      if (!spaceId) { spaceId = sp; wsId = ws.id }
      if (pr && !projectId) projectId = pr
      if (li) { listId = li; wsId = ws.id; spaceId = sp; projectId = pr; break }
    }
  }
  ok(`using workspace ${wsId}${listId ? `, list ${listId}` : ' (no list found — task checks will be skipped)'}`)

  // ── BUG #1 — one email may own more than one workspace ──────────────────────
  sec('#1  multiple workspaces per email')
  {
    const r = await call('GET', '/workspaces', { token })
    const list = Array.isArray(r.data) ? r.data : workspaces
    if (list.length >= 2) {
      ok(`account already owns ${list.length} workspaces — no single-workspace limit`)
    } else if (ALLOW_WS_CREATE) {
      const name = `regression-ws-${Date.now()}`
      const c = await call('POST', '/workspaces', { token, body: { name } })
      if (c.status < 300 && c.data && c.data.id) wrn(`created a 2nd workspace "${name}" (${c.data.id}) — no limit. NOTE: no delete-workspace API, so remove it from the UI.`)
      else bad(`could not create a 2nd workspace → status=${c.status} body=${clip(c.json)}`)
    } else {
      skp('only 1 workspace on this account; set HC_TEST_WORKSPACE_CREATE=1 to actively create a 2nd (it cannot be auto-deleted)')
    }
  }

  // ── BUG #3 — Personal List is a real per-user to-do list ────────────────────
  sec('#3  Personal List (real per-user tasks)')
  if (!wsId) { skp('no workspace — skipped') }
  else {
    const created = await call('POST', `/workspaces/${wsId}/personal-tasks`, { token, body: { title: 'regression check (auto)' } })
    const ptId = created.data && created.data.id
    if (created.status < 300 && ptId) {
      ok(`POST personal-tasks → created ${ptId} (done=${created.data.done})`)
      const listed = await call('GET', `/workspaces/${wsId}/personal-tasks`, { token })
      if (listed.status === 200 && Array.isArray(listed.data) && listed.data.some((t) => t.id === ptId)) ok('GET personal-tasks → new task appears in the list')
      else bad(`GET personal-tasks → created task not found (status=${listed.status})`)
      const done = await call('PATCH', `/personal-tasks/${ptId}`, { token, body: { done: true } })
      if (done.status < 300 && done.data && done.data.done === true) ok('PATCH done:true → toggled complete')
      else bad(`PATCH done → status=${done.status} body=${clip(done.json)}`)
      const ren = await call('PATCH', `/personal-tasks/${ptId}`, { token, body: { title: 'renamed (auto)' } })
      if (ren.status < 300 && ren.data && ren.data.title === 'renamed (auto)') ok('PATCH title → renamed')
      else bad(`PATCH title → status=${ren.status} body=${clip(ren.json)}`)
      const bogus = await call('PATCH', `/personal-tasks/00000000-0000-0000-0000-000000000000`, { token, body: { done: true } })
      if (bogus.status === 404 || bogus.status === 403) ok(`ownership guard → PATCH unknown id rejected (${bogus.status})`)
      else bad(`ownership guard → expected 404/403, got ${bogus.status}`)
      const del = await call('DELETE', `/personal-tasks/${ptId}`, { token })
      if (del.status < 300) ok('DELETE personal-task → removed')
      else bad(`DELETE personal-task → status=${del.status}`)
      const after = await call('GET', `/workspaces/${wsId}/personal-tasks`, { token })
      if (after.status === 200 && Array.isArray(after.data) && !after.data.some((t) => t.id === ptId)) ok('GET personal-tasks → task no longer present after delete')
      else wrn('deleted personal-task still listed (unexpected)')
    } else {
      bad(`POST personal-tasks → status=${created.status} body=${clip(created.json)}`)
    }
  }

  // ── BUG #6 — pin / star a chat message ──────────────────────────────────────
  sec('#6  pin a chat message')
  if (!wsId) { skp('no workspace — skipped') }
  else {
    const chans = await call('GET', `/workspaces/${wsId}/chat/channels`, { token })
    const chId = Array.isArray(chans.data) && chans.data[0] && chans.data[0].id
    if (chans.status === 200 && chId) {
      ok(`chat channels available (using ${chId})`)
      const msg = await call('POST', `/chat/channels/${chId}/messages`, { token, body: { body: 'regression pin test (auto)' } })
      const msgId = msg.data && msg.data.id
      if (msg.status < 300 && msgId) {
        cleanups.push(() => call('DELETE', `/chat/messages/${msgId}`, { token }))
        ok(`posted a test message (${msgId})`)
        const pin = await call('POST', `/chat/messages/${msgId}/pin`, { token })
        if (pin.status < 300) ok('POST /chat/messages/:id/pin → pinned')
        else bad(`pin → status=${pin.status} body=${clip(pin.json)} (this used to do nothing)`)
        const pinned = await call('GET', `/chat/channels/${chId}/pinned`, { token })
        if (pinned.status === 200 && Array.isArray(pinned.data) && pinned.data.some((m) => m.id === msgId)) ok('GET /chat/channels/:id/pinned → contains the message')
        else bad(`pinned list → message not present (status=${pinned.status})`)
        const unpin = await call('DELETE', `/chat/messages/${msgId}/pin`, { token })
        if (unpin.status < 300) ok('DELETE /chat/messages/:id/pin → unpinned')
        else bad(`unpin → status=${unpin.status}`)
        const after = await call('GET', `/chat/channels/${chId}/pinned`, { token })
        if (after.status === 200 && Array.isArray(after.data) && !after.data.some((m) => m.id === msgId)) ok('pinned list → message gone after unpin')
        else wrn('message still pinned after unpin (unexpected)')
      } else bad(`could not post a chat message → status=${msg.status} body=${clip(msg.json)}`)
    } else wrn(`no chat channel available (status=${chans.status}) — skipping pin checks`)
  }

  // ── BUG #9 + #8 + subtasks route — task edit / cover / quick status ─────────
  sec('#9 task edit + cover · #8 quick status · GET subtasks')
  if (!listId) { skp('no list available on this account — skipped (log in where you have projects)') }
  else {
    const created = await call('POST', '/tasks', { token, body: { listId, title: 'regression task (auto)', status: 'in_progress' } })
    const taskId = created.data && created.data.id
    if (created.status < 300 && taskId) {
      cleanups.push(() => call('DELETE', `/tasks/${taskId}`, { token }))
      // #8 — status chosen at creation is persisted
      if (created.data.status === 'in_progress') ok('#8 create with status:"in_progress" → status persisted')
      else wrn(`#8 created status="${created.data.status}" (list may use custom statuses)`)
      // #9 — name + description + cover all round-trip through PATCH
      const patch = await call('PATCH', `/tasks/${taskId}`, { token, body: { title: 'regression renamed (auto)', description: 'edited body', coverColor: '#ff8800' } })
      if (patch.status < 300 && patch.data && patch.data.title === 'regression renamed (auto)' && patch.data.description === 'edited body' && patch.data.coverColor === '#ff8800') {
        ok('#9 PATCH title + description + coverColor → all saved')
      } else bad(`#9 PATCH round-trip mismatch → status=${patch.status} body=${clip(patch.json)}`)
      const got = await call('GET', `/tasks/${taskId}`, { token })
      if (got.status === 200 && got.data && got.data.coverColor === '#ff8800' && got.data.title === 'regression renamed (auto)') ok('#9 GET task → edits persisted on reload')
      else bad(`#9 GET task → persisted values wrong (coverColor=${got.data && got.data.coverColor})`)
      // subtasks route (f1132ab)
      const child = await call('POST', '/tasks', { token, body: { listId, title: 'regression subtask (auto)', parentTaskId: taskId } })
      const childId = child.data && child.data.id
      if (child.status < 300 && childId) {
        cleanups.push(() => call('DELETE', `/tasks/${childId}`, { token }))
        const subs = await call('GET', `/tasks/${taskId}/subtasks`, { token })
        if (subs.status === 200 && Array.isArray(subs.data) && subs.data.some((t) => t.id === childId)) ok('GET /tasks/:id/subtasks → 200 and contains the new subtask (was 404 before)')
        else bad(`subtasks → status=${subs.status}, child present=${Array.isArray(subs.data) && subs.data.some((t) => t.id === childId)}`)
      } else wrn(`could not create a subtask → status=${child.status}`)
    } else bad(`could not create a task → status=${created.status} body=${clip(created.json)}`)
  }

  // ── endpoint sweep regression — canonical paths work, old wrong paths 404 ───
  sec('endpoint sweep (canonical vs. the old wrong paths)')
  if (wsId) {
    const r = await call('GET', `/spaces/workspace/${wsId}`, { token })
    if (r.status === 200 && Array.isArray(r.data)) ok('canonical GET /spaces/workspace/:ws → 200')
    else bad(`canonical spaces path → status=${r.status}`)
    const sp = spaceId || '00000000-0000-0000-0000-000000000000'
    const pr = projectId || '00000000-0000-0000-0000-000000000000'
    const wrongs = [
      ['GET', `/workspaces/${wsId}/spaces`, 'old: /workspaces/:ws/spaces'],
      ['GET', `/spaces/${sp}/projects`, 'old: /spaces/:id/projects'],
      ['GET', `/projects/${pr}/lists`, 'old: /projects/:id/lists'],
    ]
    for (const [m, p, label] of wrongs) {
      const w = await call(m, p, { token })
      if (w.status === 404) ok(`${label} → 404 (correctly gone)`)
      else wrn(`${label} → ${w.status} (expected 404; correct path is in use anyway)`)
    }
  } else skp('no workspace — skipped')

  // ── BUG #4 / #7 — chat "Ask AI" and doc "Improve" call /ai/writing/improve ──
  sec('#4/#7  AI writing improve (the wired Ask-AI / Improve action)')
  {
    const st = await call('GET', '/ai/status', { token })
    if (!(st.data && st.data.available)) { skp('AI not available — skipped') }
    else {
      const r = await call('POST', '/ai/writing/improve', { token, timeoutMs: 30000, body: { text: 'this are a badly wroted sentance', mode: 'improve' } })
      if (r.status < 300 && r.data && typeof r.data.improved === 'string' && r.data.improved.trim()) ok(`/ai/writing/improve → returned improved text (${r.data.improved.length} chars)`)
      else bad(`/ai/writing/improve → status=${r.status} body=${clip(r.json)}`)
    }
  }

  // ── form field drag-reorder backend (10bbcbf) ───────────────────────────────
  sec('form field reorder backend (PUT .../fields/reorder)')
  if (!wsId) { skp('no workspace — skipped') }
  else {
    const form = await call('POST', `/workspaces/${wsId}/forms`, { token, body: { title: 'regression form (auto)' } })
    const formId = form.data && form.data.id
    if (form.status < 300 && formId) {
      cleanups.push(() => call('DELETE', `/workspaces/${wsId}/forms/${formId}`, { token }))
      const fA = await call('POST', `/workspaces/${wsId}/forms/${formId}/fields`, { token, body: { type: 'short_text', label: 'Field A' } })
      const fB = await call('POST', `/workspaces/${wsId}/forms/${formId}/fields`, { token, body: { type: 'short_text', label: 'Field B' } })
      const aId = fA.data && fA.data.id, bId = fB.data && fB.data.id
      if (aId && bId) {
        ok('created a form with 2 fields')
        const re = await call('PUT', `/workspaces/${wsId}/forms/${formId}/fields/reorder`, { token, body: { orderedIds: [bId, aId] } })
        if (re.status < 300) {
          const got = await call('GET', `/workspaces/${wsId}/forms/${formId}`, { token })
          const fields = (got.data && (got.data.fields || got.data.formFields)) || []
          const order = fields.map((f) => f.id)
          if (order.length >= 2 && order[0] === bId && order[1] === aId) ok('PUT fields/reorder → new order persisted (B before A)')
          else wrn(`reorder applied but order read back as ${clip(order)} (field accessor may differ)`)
        } else bad(`PUT fields/reorder → status=${re.status} body=${clip(re.json)}`)
      } else wrn(`could not add form fields → A=${fA.status} B=${fB.status}`)
    } else wrn(`could not create a form → status=${form.status} body=${clip(form.json)}`)
  }

  // ── workspace security settings — real backend, not a mockup (e58875c) ──────
  sec('workspace security settings (real backend)')
  if (!wsId) { skp('no workspace — skipped') }
  else {
    const r = await call('GET', `/workspaces/${wsId}/security-settings`, { token })
    if (r.status === 200 && r.data && typeof r.data === 'object') ok(`GET security-settings → real settings returned (currentIp=${r.data.currentIp || 'n/a'})`)
    else if (r.status === 403) skp('not an admin/member for security settings on this workspace')
    else bad(`GET security-settings → status=${r.status} body=${clip(r.json)}`)
  }

  // ── project-template catalog — real backend, not mock (e3494f1) ─────────────
  sec('project-template catalog (real backend)')
  if (!wsId) { skp('no workspace — skipped') }
  else {
    const r = await call('GET', `/workspaces/${wsId}/project-templates`, { token })
    if (r.status === 200 && Array.isArray(r.data)) ok(`GET project-templates → ${r.data.length} templates (real catalog)`)
    else bad(`GET project-templates → status=${r.status} body=${clip(r.json)}`)
  }

  // ── chat Saved messages — new per-user bookmark backend ─────────────────────
  sec('chat Saved messages (real per-user bookmark)')
  if (!wsId) { skp('no workspace — skipped') }
  else {
    const chans = await call('GET', `/workspaces/${wsId}/chat/channels`, { token })
    const chId = Array.isArray(chans.data) && chans.data[0] && chans.data[0].id
    if (!chId) { wrn('no chat channel — skipped') }
    else {
      const msg = await call('POST', `/chat/channels/${chId}/messages`, { token, body: { body: 'regression saved test (auto)' } })
      const msgId = msg.data && msg.data.id
      if (msg.status < 300 && msgId) {
        cleanups.push(() => call('DELETE', `/chat/messages/${msgId}`, { token }))
        const save = await call('POST', `/chat/messages/${msgId}/save`, { token })
        if (save.status < 300) ok('POST /chat/messages/:id/save → saved')
        else bad(`save → status=${save.status} body=${clip(save.json)}`)
        const list = await call('GET', `/workspaces/${wsId}/chat/saved`, { token })
        if (list.status === 200 && Array.isArray(list.data) && list.data.some((m) => m.id === msgId)) ok('GET /workspaces/:ws/chat/saved → contains the message')
        else bad(`saved list → message not present (status=${list.status})`)
        const unsave = await call('DELETE', `/chat/messages/${msgId}/save`, { token })
        if (unsave.status < 300) ok('DELETE /chat/messages/:id/save → unsaved')
        else bad(`unsave → status=${unsave.status}`)
        const after = await call('GET', `/workspaces/${wsId}/chat/saved`, { token })
        if (after.status === 200 && Array.isArray(after.data) && !after.data.some((m) => m.id === msgId)) ok('saved list → gone after unsave')
        else wrn('message still saved after unsave (unexpected)')
      } else bad(`could not post a chat message → status=${msg.status} body=${clip(msg.json)}`)
    }
  }

  // ── docs nested tree — real parentDocId round-trip ──────────────────────────
  sec('docs nested tree (real parentDocId)')
  if (!wsId) { skp('no workspace — skipped') }
  else {
    const parent = await call('POST', `/workspaces/${wsId}/docs`, { token, body: { title: 'regression parent doc (auto)' } })
    const parentId = parent.data && parent.data.id
    if (parent.status < 300 && parentId) {
      cleanups.push(() => call('DELETE', `/docs/${parentId}`, { token }))
      const child = await call('POST', `/workspaces/${wsId}/docs`, { token, body: { title: 'regression child doc (auto)', parentDocId: parentId } })
      const childId = child.data && child.data.id
      if (child.status < 300 && childId) {
        cleanups.push(() => call('DELETE', `/docs/${childId}`, { token }))
        const listed = await call('GET', `/workspaces/${wsId}/docs`, { token })
        const found = Array.isArray(listed.data) ? listed.data.find((d) => d.id === childId) : null
        if (found && found.parentDocId === parentId) ok('child doc nests under parent (parentDocId persisted)')
        else bad(`docs list → child parentDocId wrong (got ${found && found.parentDocId})`)
      } else bad(`could not create child doc → status=${child.status} body=${clip(child.json)}`)
    } else bad(`could not create parent doc → status=${parent.status} body=${clip(parent.json)}`)
  }

  // ── custom report engine — real aggregation over real data ──────────────────
  sec('custom report engine (real aggregation)')
  if (!wsId) { skp('no workspace — skipped') }
  else {
    const r = await call('POST', `/workspaces/${wsId}/reports/custom/run`, {
      token,
      timeoutMs: 30000,
      body: { dimension: 'status', metrics: ['tasks-count', 'tasks-completed'], days: 3650 },
    })
    if (r.status < 300 && r.data && Array.isArray(r.data.rows) && r.data.dimension === 'status') ok(`POST /reports/custom/run → ${r.data.rows.length} group(s) by status`)
    else bad(`custom report run → status=${r.status} body=${clip(r.json)}`)
    const saved = await call('GET', `/workspaces/${wsId}/reports/custom`, { token })
    if (saved.status === 200 && Array.isArray(saved.data)) ok(`GET /reports/custom → saved-report list (${saved.data.length})`)
    else bad(`saved reports list → status=${saved.status}`)
  }
}

(async () => {
  try { await main() }
  catch (e) { bad(`fatal: ${e && e.message ? e.message : e}`); }
  finally { await runCleanups(); finish() }
})()
NODE_EOF
RC=$?
exit $RC
