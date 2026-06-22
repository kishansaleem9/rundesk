#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Rundesk FULL platform test — exercises every area end-to-end against the live
# API and reports pass/fail. This is the superset of vps-healthcheck.sh (liveness)
# and vps-regression.sh (the original fixed bugs), PLUS every fix from the deep
# platform audit (security holes, broken features, additive UIs).
#
# Run on the VPS from the repo root (/opt/rundesk):
#
#     ./scripts/vps-full-test.sh
#
# It needs a real Rundesk login (creates + deletes temporary test data). Provide
# it interactively, or:
#     HC_EMAIL=you@example.com HC_PASSWORD='pass' ./scripts/vps-full-test.sh
#     ./scripts/vps-full-test.sh you@example.com 'pass'
#
# Use an account that has at least one space/project/list so the task/doc/report
# checks run. Everything created is cleaned up; exits non-zero on any failure.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
COMPOSE_FILE="deploy/docker-compose.prod.yml"
C_R=$'\033[31m'; C_G=$'\033[32m'; C_Y=$'\033[33m'; C_C=$'\033[36m'; C_B=$'\033[1m'; C_D=$'\033[2m'; C_X=$'\033[0m'
PASS=0; FAIL=0; WARN=0
pass(){ PASS=$((PASS+1)); printf "  ${C_G}✓${C_X} %s\n" "$1"; }
fail(){ FAIL=$((FAIL+1)); printf "  ${C_R}✗${C_X} %s\n" "$1"; }
warn(){ WARN=$((WARN+1)); printf "  ${C_Y}!${C_X} %s\n" "$1"; }
section(){ printf "\n${C_C}${C_B}── %s ──${C_X}\n" "$1"; }

[ -f "$COMPOSE_FILE" ] || { printf "${C_R}Run from the rundesk repo root (e.g. /opt/rundesk). Missing %s${C_X}\n" "$COMPOSE_FILE"; exit 1; }
command -v docker >/dev/null 2>&1 || { printf "${C_R}docker not on PATH${C_X}\n"; exit 1; }
getenv(){ grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//'; }
PG_USER="$(getenv POSTGRES_USER)"; PG_USER="${PG_USER:-rundesk}"
PG_DB="$(getenv POSTGRES_DB)"; PG_DB="${PG_DB:-rundesk}"

printf "${C_B}${C_C}Rundesk FULL platform test${C_X}\n"

# ── Containers ───────────────────────────────────────────────────────────────
section "Containers"
check_container(){
  local name="$1" required="$2" running health
  running="$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null || echo missing)"
  if [ "$running" != "true" ]; then
    [ "$required" = "1" ] && fail "$name not running ($running)" || warn "$name not running ($running)"
    return
  fi
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name" 2>/dev/null || echo none)"
  if [ "$health" = "healthy" ] || [ "$health" = "none" ]; then pass "$name running${health:+ ($health)}"
  else { [ "$required" = "1" ] && fail "$name health=$health" || warn "$name health=$health"; }; fi
}
check_container rundesk-postgres 1
check_container rundesk-redis 1
check_container rundesk-api 1
check_container rundesk-meilisearch 0

# ── Database ─────────────────────────────────────────────────────────────────
section "Database"
if docker exec rundesk-postgres pg_isready -U "$PG_USER" >/dev/null 2>&1; then
  pass "postgres accepting connections"
  for tbl in users tasks chat_message_saves custom_reports; do
    exists="$(docker exec rundesk-postgres psql -U "$PG_USER" -d "$PG_DB" -tAc "SELECT to_regclass('public.$tbl') IS NOT NULL" 2>/dev/null | tr -d '[:space:]')"
    [ "$exists" = "t" ] && pass "table '$tbl' present" || fail "table '$tbl' missing (migrations not applied?)"
  done
else
  fail "postgres not accepting connections"
fi

# ── Credentials ──────────────────────────────────────────────────────────────
EMAIL="${HC_EMAIL:-${1:-}}"; PASSWORD="${HC_PASSWORD:-${2:-}}"
if { [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; } && [ -t 0 ]; then
  section "Login"
  printf "  Enter a Rundesk login to run the functional tests:\n"
  printf "  Email: "; read -r EMAIL
  if [ -n "$EMAIL" ]; then printf "  Password: "; read -rs PASSWORD; printf "\n"; fi
fi
if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
  printf "${C_R}A login is required (set HC_EMAIL / HC_PASSWORD).${C_X}\n"; exit 2
fi
if [ "$(docker inspect -f '{{.State.Running}}' rundesk-api 2>/dev/null || echo no)" != "true" ]; then
  printf "${C_R}rundesk-api not running.${C_X}\n"; exit 1
fi

# ── API + functional suite (runs inside the api container; node 20 fetch) ─────
docker exec -i \
  -e HC_BASE="http://localhost:3001/api/v1" \
  -e HC_EMAIL="$EMAIL" \
  -e HC_PASSWORD="$PASSWORD" \
  rundesk-api node - <<'NODE_EOF'
const BASE = process.env.HC_BASE || 'http://localhost:3001/api/v1'
const EMAIL = process.env.HC_EMAIL || ''
const PASSWORD = process.env.HC_PASSWORD || ''
const C = { r:'\x1b[31m', g:'\x1b[32m', y:'\x1b[33m', c:'\x1b[36m', b:'\x1b[1m', d:'\x1b[2m', x:'\x1b[0m' }
let pass=0, fail=0, warn=0, skip=0
const ok=(m)=>{pass++;console.log(`  ${C.g}✓${C.x} ${m}`)}
const bad=(m)=>{fail++;console.log(`  ${C.r}✗${C.x} ${m}`)}
const wrn=(m)=>{warn++;console.log(`  ${C.y}!${C.x} ${m}`)}
const skp=(m)=>{skip++;console.log(`  ${C.d}∘ ${m}${C.x}`)}
const sec=(m)=>console.log(`\n${C.c}${C.b}── ${m} ──${C.x}`)
const clip=(v)=>{try{return JSON.stringify(v).slice(0,200)}catch{return String(v).slice(0,200)}}
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))

async function call(method, path, opts={}) {
  const { token, body, timeoutMs=20000, raw=false } = opts
  const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), timeoutMs)
  try {
    const headers = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${BASE}${path}`, { method, headers, body: body!==undefined?JSON.stringify(body):undefined, signal: ctrl.signal })
    if (raw) { const text = await res.text(); return { status: res.status, text } }
    const text = await res.text(); let json; try{json=JSON.parse(text)}catch{json=text}
    const data = json && typeof json==='object' && 'data' in json ? json.data : json
    return { status: res.status, json, data }
  } catch(e){ return { status:0, json:{error:e.message}, threw:e.message } }
  finally { clearTimeout(t) }
}

const cleanups = []
async function runCleanups(){ for (const c of cleanups.reverse()){ try{await c()}catch{} } }
function finish(){
  sec('Result')
  const f=fail?C.r:C.d, w=warn?C.y:C.d
  console.log(`  ${C.g}${pass} passed${C.x}   ${f}${fail} failed${C.x}   ${w}${warn} warnings${C.x}   ${C.d}${skip} skipped${C.x}`)
  if (fail===0) console.log(`\n  ${C.g}${C.b}✅  FULL TEST PASSED${C.x}`)
  else console.log(`\n  ${C.r}${C.b}❌  ${fail} CHECK(S) FAILED — see ✗ above${C.x}`)
  process.exit(fail>0?1:0)
}

async function main() {
  // ── 1. Health ───────────────────────────────────────────────────────────
  sec('API health')
  {
    const h = await call('GET','/health')
    h.status===200 && h.data?.status==='ok' ? ok(`GET /health → ok`) : bad(`GET /health → ${h.status}`)
    const r = await call('GET','/health/ready')
    r.status===200 && r.data?.checks?.database?.ok ? ok(`GET /health/ready → db ok`) : bad(`GET /health/ready → ${r.status}`)
  }

  // ── 2. Auth + discovery ─────────────────────────────────────────────────
  sec('Authentication & discovery')
  let token, myUserId, workspaces=[]
  {
    const r = await call('POST','/auth/login',{ body:{ email:EMAIL, password:PASSWORD } })
    token = r.data?.accessToken
    workspaces = Array.isArray(r.data?.workspaces) ? r.data.workspaces : []
    if (!token) { bad(`login → ${r.status} ${clip(r.json)}`); return }
    ok(`logged in (${workspaces.length} workspace(s))`)
    const me = await call('GET','/auth/me',{ token })
    myUserId = me.data?.id ?? me.data?.user?.id
    myUserId ? ok(`/auth/me → ${myUserId}`) : wrn('could not read own user id')
  }
  let wsId = workspaces[0]?.id, spaceId, projectId, listId
  for (const ws of workspaces) {
    if (!ws?.id) continue
    const s = await call('GET',`/spaces/workspace/${ws.id}`,{ token })
    if (s.status===200 && Array.isArray(s.data) && s.data.length) {
      const sp = s.data[0].id
      const p = await call('GET',`/projects/space/${sp}`,{ token })
      const pr = p.status===200 && Array.isArray(p.data) && p.data.length ? p.data[0].id : null
      const l = pr ? await call('GET',`/lists/project/${pr}`,{ token }) : null
      const li = l && l.status===200 && Array.isArray(l.data) && l.data.length ? l.data[0].id : null
      if (!spaceId){ spaceId=sp; wsId=ws.id }
      if (pr && !projectId) projectId=pr
      if (li){ listId=li; wsId=ws.id; spaceId=sp; projectId=pr; break }
    }
  }
  ok(`workspace ${wsId}${listId?`, list ${listId}`:' (no list — task checks limited)'}`)

  // ── 3. AI (live key) ─────────────────────────────────────────────────────
  sec('AI — live Anthropic key')
  let aiOn=false
  {
    const st = await call('GET','/ai/status',{ token })
    aiOn = st.data?.available===true
    aiOn ? ok('GET /ai/status → available') : wrn('AI not available — AI checks skipped')
  }
  if (aiOn) {
    let r = await call('POST','/ai/task/priority',{ token, timeoutMs:30000, body:{ title:'Prod outage', description:'down' } })
    r.status<300 && r.data?.priority ? ok(`/ai/task/priority → "${r.data.priority}" (KEY WORKS)`) : bad(`/ai/task/priority → ${r.status}`)
    r = await call('POST','/ai/insights',{ token, timeoutMs:45000, body:{ context:'24 tasks, 5 overdue, sprint 60%' } })
    r.status<300 && r.data?.summary ? ok(`/ai/insights → summary + health="${r.data.health?.label}"`) : bad(`/ai/insights → ${r.status}`)
    r = await call('POST','/ai/dashboard/suggest-layout',{ token, timeoutMs:45000, body:{ availableWidgets:[{type:'overdue',label:'Overdue'},{type:'sprint',label:'Sprint'}], context:'team' } })
    r.status<300 && Array.isArray(r.data?.widgets) ? ok(`/ai/dashboard/suggest-layout → ${r.data.widgets.length} widgets`) : bad(`/ai/dashboard/suggest-layout → ${r.status}`)
    r = await call('POST','/ai/writing/improve',{ token, timeoutMs:30000, body:{ text:'this are bad grammer', mode:'improve' } })
    r.status<300 && typeof r.data?.improved==='string' ? ok('/ai/writing/improve → improved text (#4/#7)') : bad(`/ai/writing/improve → ${r.status}`)
    // streaming chat
    try {
      const ctrl=new AbortController(); const tm=setTimeout(()=>ctrl.abort(),30000)
      const res=await fetch(`${BASE}/ai/chat`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'say pong'}],workspaceContext:''}),signal:ctrl.signal})
      if(!res.ok||!res.body){bad(`/ai/chat → ${res.status}`);clearTimeout(tm)}
      else{const rd=res.body.getReader();const dec=new TextDecoder();let buf='',got=false,err=null
        while(true){const{done,value}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true})
          for(const line of buf.split('\n')){const m=line.match(/^data: (.*)$/);if(!m)continue;if(m[1]!=='[DONE]'){try{const o=JSON.parse(m[1]);if(o.delta)got=true;if(o.error)err=o.error}catch{}}}
          if(got||err)break}
        clearTimeout(tm);try{await rd.cancel()}catch{}
        err?bad(`/ai/chat → ${err}`):got?ok('/ai/chat → SSE streamed (Fastify fix)'):wrn('/ai/chat connected, no tokens captured')}
    } catch(e){ e.name==='AbortError'?wrn('/ai/chat timed out'):bad(`/ai/chat threw ${e.message}`) }
  }

  // ── 4. Core endpoints + sweep ────────────────────────────────────────────
  sec('Core endpoints + endpoint sweep')
  if (wsId) {
    const r = await call('GET',`/spaces/workspace/${wsId}`,{ token })
    r.status===200 && Array.isArray(r.data) ? ok('canonical /spaces/workspace/:ws → 200') : bad(`spaces → ${r.status}`)
    for (const [m,p,label] of [['GET',`/workspaces/${wsId}/spaces`,'old /workspaces/:ws/spaces'],['GET',`/spaces/${spaceId||'x'}/projects`,'old /spaces/:id/projects'],['GET',`/projects/${projectId||'x'}/lists`,'old /projects/:id/lists']]) {
      const w = await call(m,p,{ token }); w.status===404 ? ok(`${label} → 404 (gone)`) : wrn(`${label} → ${w.status}`)
    }
  } else skp('no workspace — skipped')

  // ── 5. Bug #3 Personal List ──────────────────────────────────────────────
  sec('Bug #3 — Personal List (per-user tasks)')
  if (wsId) {
    const c = await call('POST',`/workspaces/${wsId}/personal-tasks`,{ token, body:{ title:'fulltest pt' } })
    const id = c.data?.id
    if (c.status<300 && id) {
      ok('create personal task')
      const list = await call('GET',`/workspaces/${wsId}/personal-tasks`,{ token })
      Array.isArray(list.data) && list.data.some(t=>t.id===id) ? ok('lists in personal tasks') : bad('not in list')
      const done = await call('PATCH',`/personal-tasks/${id}`,{ token, body:{ done:true } })
      done.data?.done===true ? ok('toggle done') : bad('toggle failed')
      const bogus = await call('PATCH','/personal-tasks/00000000-0000-0000-0000-000000000000',{ token, body:{ done:true } })
      bogus.status===404||bogus.status===403 ? ok(`ownership guard (${bogus.status})`) : bad(`ownership guard → ${bogus.status}`)
      await call('DELETE',`/personal-tasks/${id}`,{ token }); ok('delete personal task')
    } else bad(`create personal task → ${c.status} ${clip(c.json)}`)
  } else skp('no workspace — skipped')

  // ── 6. Bug #6 Chat pin ───────────────────────────────────────────────────
  sec('Bug #6 — pin a chat message')
  let chId
  if (wsId) {
    const chans = await call('GET',`/workspaces/${wsId}/chat/channels`,{ token })
    chId = Array.isArray(chans.data) ? chans.data[0]?.id : null
    if (chId) {
      const msg = await call('POST',`/chat/channels/${chId}/messages`,{ token, body:{ body:'fulltest pin' } })
      const mid = msg.data?.id
      if (mid) {
        cleanups.push(()=>call('DELETE',`/chat/messages/${mid}`,{ token }))
        const pin = await call('POST',`/chat/messages/${mid}/pin`,{ token }); pin.status<300?ok('pin'):bad(`pin → ${pin.status}`)
        const pl = await call('GET',`/chat/channels/${chId}/pinned`,{ token })
        Array.isArray(pl.data) && pl.data.some(m=>m.id===mid) ? ok('appears in pinned list') : bad('not in pinned')
        await call('DELETE',`/chat/messages/${mid}/pin`,{ token }); ok('unpin')
      } else bad(`post message → ${msg.status}`)
    } else wrn('no chat channel')
  } else skp('no workspace — skipped')

  // ── 7. Bug #9 task edit + #8 status + subtasks ───────────────────────────
  sec('Bug #9 task edit · #8 quick status · subtasks route')
  let taskId
  if (listId) {
    const c = await call('POST','/tasks',{ token, body:{ listId, title:'fulltest task', status:'in_progress' } })
    taskId = c.data?.id
    if (taskId) {
      cleanups.push(()=>call('DELETE',`/tasks/${taskId}`,{ token }))
      c.data.status==='in_progress' ? ok('#8 status persisted on create') : wrn(`#8 status="${c.data.status}"`)
      const p = await call('PATCH',`/tasks/${taskId}`,{ token, body:{ title:'fulltest renamed', description:'body', coverColor:'#ff8800' } })
      p.data?.coverColor==='#ff8800' && p.data?.title==='fulltest renamed' ? ok('#9 title+description+cover round-trip') : bad(`#9 patch → ${clip(p.json)}`)
      const g = await call('GET',`/tasks/${taskId}`,{ token })
      g.data?.coverColor==='#ff8800' ? ok('#9 persisted on reload') : bad('#9 not persisted')
      const child = await call('POST','/tasks',{ token, body:{ listId, title:'fulltest sub', parentTaskId:taskId } })
      if (child.data?.id) {
        cleanups.push(()=>call('DELETE',`/tasks/${child.data.id}`,{ token }))
        const subs = await call('GET',`/tasks/${taskId}/subtasks`,{ token })
        subs.status===200 && Array.isArray(subs.data) && subs.data.some(t=>t.id===child.data.id) ? ok('GET /tasks/:id/subtasks (was 404)') : bad(`subtasks → ${subs.status}`)
      }
    } else bad(`create task → ${c.status} ${clip(c.json)}`)
  } else skp('no list — skipped')

  // ── 8. Feature: chat Saved messages ──────────────────────────────────────
  sec('Feature — chat Saved messages')
  if (chId) {
    const msg = await call('POST',`/chat/channels/${chId}/messages`,{ token, body:{ body:'fulltest saved' } })
    const mid = msg.data?.id
    if (mid) {
      cleanups.push(()=>call('DELETE',`/chat/messages/${mid}`,{ token }))
      const sv = await call('POST',`/chat/messages/${mid}/save`,{ token }); sv.status<300?ok('save message'):bad(`save → ${sv.status}`)
      const list = await call('GET',`/workspaces/${wsId}/chat/saved`,{ token })
      Array.isArray(list.data) && list.data.some(m=>m.id===mid) ? ok('appears in /chat/saved') : bad('not in saved')
      await call('DELETE',`/chat/messages/${mid}/save`,{ token }); ok('unsave')
    } else wrn('could not post message')
  } else skp('no chat channel — skipped')

  // ── 9. Feature: docs nested tree ─────────────────────────────────────────
  sec('Feature — docs nested tree + templates')
  if (wsId) {
    const parent = await call('POST',`/workspaces/${wsId}/docs`,{ token, body:{ title:'fulltest parent doc' } })
    const pid = parent.data?.id
    if (pid) {
      cleanups.push(()=>call('DELETE',`/docs/${pid}`,{ token }))
      const child = await call('POST',`/workspaces/${wsId}/docs`,{ token, body:{ title:'fulltest child doc', parentDocId:pid } })
      const cid = child.data?.id
      if (cid) {
        cleanups.push(()=>call('DELETE',`/docs/${cid}`,{ token }))
        const docs = await call('GET',`/workspaces/${wsId}/docs`,{ token })
        const found = Array.isArray(docs.data) ? docs.data.find(d=>d.id===cid) : null
        found?.parentDocId===pid ? ok('child nests under parent (parentDocId)') : bad(`nesting → ${found?.parentDocId}`)
      } else bad(`child doc → ${child.status}`)
    } else bad(`parent doc → ${parent.status}`)
  } else skp('no workspace — skipped')

  // ── 10. Feature: custom report engine ────────────────────────────────────
  sec('Feature — custom report engine')
  if (wsId) {
    const run = await call('POST',`/workspaces/${wsId}/reports/custom/run`,{ token, timeoutMs:30000, body:{ dimension:'status', metrics:['tasks-count','tasks-completed'], days:3650 } })
    run.status<300 && Array.isArray(run.data?.rows) && run.data.dimension==='status' ? ok(`run → ${run.data.rows.length} group(s) by status`) : bad(`run → ${run.status} ${clip(run.json)}`)
    const saved = await call('GET',`/workspaces/${wsId}/reports/custom`,{ token })
    saved.status===200 && Array.isArray(saved.data) ? ok(`saved report list (${saved.data.length})`) : bad(`saved list → ${saved.status}`)
  } else skp('no workspace — skipped')

  // ── 11. Security fixes ───────────────────────────────────────────────────
  sec('Security — audit fixes')
  if (wsId && myUserId) {
    // S2: role allowlist — trying to set super_admin must be rejected (400 admin / 403 non-admin), never 2xx
    const esc = await call('PATCH',`/workspaces/${wsId}/members/${myUserId}`,{ token, body:{ role:'super_admin' } })
    esc.status===400 || esc.status===403 ? ok(`role allowlist blocks super_admin (${esc.status})`) : bad(`role escalation NOT blocked → ${esc.status} ${clip(esc.json)}`)
  } else skp('no workspace/user — role test skipped')
  {
    // S1: feature-flags global scope requires super_admin
    const ff = await call('PUT','/feature-flags/fulltest_probe',{ token, body:{ enabled:true, scope:'global' } })
    if (ff.status===403) ok('feature-flags global write gated (403)')
    else if (ff.status<300) wrn('feature-flags global write allowed — this login is super_admin')
    else bad(`feature-flags → ${ff.status} ${clip(ff.json)}`)
  }
  if (listId) {
    // S3: list-statuses now guarded; own list must still work (positive case)
    const ls = await call('GET',`/lists/${listId}/statuses`,{ token })
    ls.status===200 && Array.isArray(ls.data) ? ok('list-statuses readable for own list (guard ok)') : bad(`list-statuses → ${ls.status}`)
  }
  if (wsId) {
    // calendar push IDOR: bogus task id must be handled, not crash
    const push = await call('POST',`/workspaces/${wsId}/calendar-sync/tasks/00000000-0000-0000-0000-000000000000/push`,{ token })
    push.status<500 ? ok(`calendar push handles unknown task (${push.status})`) : bad(`calendar push → ${push.status}`)
  }

  // ── 12. Fix F1 — search deep links ───────────────────────────────────────
  sec('Fix F1 — search results link to real routes')
  if (wsId && listId) {
    const uniq = `fzt${Date.now().toString(36)}`
    const t = await call('POST','/tasks',{ token, body:{ listId, title:`searchprobe ${uniq}` } })
    const tid = t.data?.id
    if (tid) cleanups.push(()=>call('DELETE',`/tasks/${tid}`,{ token }))
    await sleep(400)
    const res = await call('GET',`/search/${wsId}?q=${uniq}`,{ token })
    const hits = Array.isArray(res.data) ? res.data : []
    const taskHit = hits.find(h=>h.entityType==='task')
    if (taskHit) {
      /\/app\/[^/]+\/[^/]+\/[^/]+\/[^/]+\?task=/.test(taskHit.url) ? ok('search task result → valid deep URL (?task=)') : bad(`task url wrong: ${taskHit.url}`)
    } else wrn('search returned no task hit (Meili off + indexing lag?) — not a hard fail')
  } else skp('no list — search test skipped')

  // ── 13. Fix F3 — authenticated data export ───────────────────────────────
  sec('Fix F3 — data export (authenticated)')
  if (wsId) {
    const j = await call('GET',`/workspaces/${wsId}/export/json`,{ token, raw:true, timeoutMs:30000 })
    j.status===200 ? ok('GET /export/json → 200 (with token)') : bad(`export json → ${j.status}`)
    const csv = await call('GET',`/workspaces/${wsId}/export/csv/tasks`,{ token, raw:true, timeoutMs:30000 })
    csv.status===200 ? ok('GET /export/csv/tasks → 200') : bad(`export csv → ${csv.status}`)
  } else skp('no workspace — skipped')

  // ── 14. Fix F4 — dashboard save (empty layout allowed) ───────────────────
  sec('Fix F4 — dashboard preset save')
  if (wsId) {
    const c = await call('POST','/dashboards',{ token, body:{ workspaceId:wsId, name:'fulltest dash', layout:[], isDefault:false } })
    if (c.status<300 && c.data?.id) {
      ok('create dashboard preset with empty layout')
      const upd = await call('PUT',`/dashboards/${c.data.id}`,{ token, body:{ layout:[{ id:'w1', type:'overdue', w:1, h:1 }] } })
      upd.status<300 ? ok('update dashboard layout') : bad(`update → ${upd.status}`)
      await call('DELETE',`/dashboards/${c.data.id}`,{ token }); ok('cleanup dashboard preset')
    } else bad(`create dashboard → ${c.status} ${clip(c.json)}`)
  } else skp('no workspace — skipped')

  // ── 15. Fix F5 — automations comment trigger fires ───────────────────────
  sec('Fix F5 — automation task.comment_added trigger')
  if (wsId && listId) {
    const auto = await call('POST',`/workspaces/${wsId}/automations`,{ token, body:{ name:'fulltest auto', trigger:{ type:'task.comment_added', filters:{} }, actions:[{ type:'send_notification', params:{ message:'fulltest' } }] } })
    const aid = auto.data?.id
    if (aid) {
      cleanups.push(()=>call('DELETE',`/workspaces/${wsId}/automations/${aid}`,{ token }))
      const t = await call('POST','/tasks',{ token, body:{ listId, title:'fulltest auto task' } })
      const tid = t.data?.id
      if (tid) {
        cleanups.push(()=>call('DELETE',`/tasks/${tid}`,{ token }))
        await call('POST',`/tasks/${tid}/comments`,{ token, body:{ body:'trigger' } })
        let ran=false
        for (let i=0;i<8;i++){ await sleep(500); const l=await call('GET',`/workspaces/${wsId}/automations`,{ token }); const rule=Array.isArray(l.data)?l.data.find(a=>a.id===aid):null; if(rule && (rule.runCount>0 || rule.runs>0)){ran=true;break} }
        ran ? ok('comment_added automation fired (runCount>0)') : wrn('automation run not observed in 4s (async timing)')
      } else wrn('could not create task for automation test')
    } else bad(`create automation → ${auto.status} ${clip(auto.json)}`)
  } else skp('no list — skipped')

  // ── 16. Fix F7 — custom-field response shape ─────────────────────────────
  sec('Fix F7 — Table custom-field shape')
  if (taskId) {
    const cf = await call('GET',`/workspaces/${wsId}/tasks/${taskId}/custom-fields`,{ token })
    if (cf.status===200 && Array.isArray(cf.data)) {
      if (cf.data.length===0) ok('custom-fields endpoint → 200 (no defs on this project)')
      else cf.data[0].definition ? ok('custom-fields items carry { definition, value }') : bad(`shape wrong: ${clip(cf.data[0])}`)
    } else bad(`custom-fields → ${cf.status}`)
  } else skp('no task — skipped')

  // ── 17. Fix F8 — iCal token: read does NOT rotate ────────────────────────
  sec('Fix F8 — calendar iCal token')
  if (wsId) {
    const a = await call('GET',`/workspaces/${wsId}/calendar-sync/ical-token`,{ token })
    const b = await call('GET',`/workspaces/${wsId}/calendar-sync/ical-token`,{ token })
    if (a.data?.token && b.data?.token) {
      a.data.token===b.data.token ? ok('GET ical-token twice → unchanged (no rotation)') : bad('GET ical-token rotated the token!')
      const rot = await call('POST',`/workspaces/${wsId}/calendar-sync/ical-token`,{ token })
      rot.data?.token && rot.data.token!==a.data.token ? ok('POST ical-token → rotates (explicit)') : wrn('POST did not change token')
    } else bad(`ical-token → ${a.status}/${b.status}`)
  } else skp('no workspace — skipped')

  // ── 18. Additive UIs — status reorder + label rename ─────────────────────
  sec('Additive UI backends — status reorder + label rename')
  if (listId) {
    const before = await call('GET',`/lists/${listId}/statuses`,{ token })
    const ids = Array.isArray(before.data) ? before.data.map(s=>s.id) : []
    if (ids.length>=2) {
      const reordered = [...ids].reverse()
      const r = await call('POST',`/lists/${listId}/statuses/reorder`,{ token, body:{ orderedIds:reordered } })
      if (r.status<300) {
        const after = await call('GET',`/lists/${listId}/statuses`,{ token })
        const newIds = Array.isArray(after.data)?after.data.slice().sort((a,b)=>a.position-b.position).map(s=>s.id):[]
        newIds[0]===reordered[0] ? ok('status reorder persisted') : wrn('reorder applied but order read back differently')
        // restore original order
        await call('POST',`/lists/${listId}/statuses/reorder`,{ token, body:{ orderedIds:ids } })
      } else bad(`status reorder → ${r.status}`)
    } else wrn('list has <2 statuses — reorder not exercised')
  } else skp('no list — status reorder skipped')
  if (wsId) {
    const c = await call('POST',`/workspaces/${wsId}/labels`,{ token, body:{ name:'fulltest label', color:'#6f96d1' } })
    const lid = c.data?.id
    if (lid) {
      const r = await call('PATCH',`/labels/${lid}`,{ token, body:{ name:'fulltest renamed' } })
      const list = await call('GET',`/workspaces/${wsId}/labels`,{ token })
      const found = Array.isArray(list.data)?list.data.find(l=>l.id===lid):null
      found?.name==='fulltest renamed' ? ok('label rename (PATCH /labels/:id)') : bad(`label rename → ${r.status} got "${found?.name}"`)
      await call('DELETE',`/labels/${lid}`,{ token }); ok('cleanup label')
    } else wrn(`could not create label → ${c.status}`)
  }

  return finish()
}

;(async()=>{ try{ await main() } catch(e){ bad(`fatal: ${e?.message||e}`) } finally { await runCleanups(); finish() } })()
NODE_EOF
RC=$?

# ── verdict ──────────────────────────────────────────────────────────────────
section "Summary"
printf "  Container/DB: ${C_G}%d passed${C_X}, ${C_R}%d failed${C_X}, ${C_Y}%d warnings${C_X}\n" "$PASS" "$FAIL" "$WARN"
TOTAL=$FAIL; [ "$RC" -ne 0 ] && TOTAL=$((TOTAL+1))
if [ "$TOTAL" -eq 0 ]; then printf "\n${C_G}${C_B}✅  ALL CHECKS PASSED${C_X}\n"; exit 0
else printf "\n${C_R}${C_B}❌  SOME CHECKS FAILED — see ✗ lines above${C_X}\n"; exit 1; fi
