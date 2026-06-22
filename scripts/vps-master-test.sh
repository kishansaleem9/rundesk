#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Rundesk — MASTER live test.
#
# One script that does a live ping against EVERY backend module (all 54
# controllers), not a subset. For each module it runs the real HTTP calls:
#
#   • Full CRUD modules        → create → verify → clean up after itself
#   • Aggregate / read modules → live GETs that must return 200
#   • Destructive / external   → reachability probe (expects the correct guard
#     or validation status, e.g. 403/400/409) so we exercise the route WITHOUT
#     causing side-effects (no emails sent, no real imports, no data seeded)
#   • Admin-gated writes       → run for real if you're an admin; if you run as
#     a plain member they're expected to return 403 (that's a PASS — the guard
#     works) and are skipped, not failed.
#
# Everything it creates, it deletes. Run on the VPS from the repo root:
#
#     ./scripts/vps-master-test.sh
#
# Credentials (any of these forms):
#     HC_EMAIL=you@x HC_PASSWORD=pw ./scripts/vps-master-test.sh
#     ./scripts/vps-master-test.sh you@x yourpassword
#     ./scripts/vps-master-test.sh           # prompts interactively
#
# Options:
#     HC_SKIP_AI=1   skip the live AI generation calls (status is still checked)
#
# Exits non-zero if any check fails.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
C_R=$'\033[31m'; C_G=$'\033[32m'; C_Y=$'\033[33m'; C_C=$'\033[36m'; C_B=$'\033[1m'; C_X=$'\033[0m'

[ -f deploy/docker-compose.prod.yml ] || { printf "${C_R}Run from the rundesk repo root (/opt/rundesk).${C_X}\n"; exit 1; }
if [ "$(docker inspect -f '{{.State.Running}}' rundesk-api 2>/dev/null || echo no)" != "true" ]; then
  printf "${C_R}rundesk-api container is not running.${C_X}\n"
  printf "Start it with: ${C_B}docker compose -f deploy/docker-compose.prod.yml up -d${C_X}\n"
  exit 1
fi

EMAIL="${HC_EMAIL:-${1:-}}"; PASSWORD="${HC_PASSWORD:-${2:-}}"
if { [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; } && [ -t 0 ]; then
  printf "${C_C}${C_B}Rundesk master test — login${C_X}\n  Email: "; read -r EMAIL
  [ -n "$EMAIL" ] && { printf "  Password: "; read -rs PASSWORD; printf "\n"; }
fi
[ -n "$EMAIL" ] && [ -n "$PASSWORD" ] || { printf "${C_R}A login is required.${C_X}\n"; exit 2; }

printf "\n${C_C}${C_B}Running the full live suite against http://localhost:3001/api/v1 ...${C_X}\n"

docker exec -i \
  -e HC_BASE="http://localhost:3001/api/v1" \
  -e HC_EMAIL="$EMAIL" -e HC_PASSWORD="$PASSWORD" \
  -e HC_SKIP_AI="${HC_SKIP_AI:-}" \
  rundesk-api node - <<'NODE_EOF'
const BASE = process.env.HC_BASE
const ORIGIN = BASE.replace(/\/api\/v1$/, '')
const SKIP_AI = !!process.env.HC_SKIP_AI
const C = { r:'\x1b[31m', g:'\x1b[32m', y:'\x1b[33m', c:'\x1b[36m', b:'\x1b[1m', d:'\x1b[2m', x:'\x1b[0m' }
let pass=0, fail=0, warn=0, skip=0
const ok =(m)=>{pass++;console.log(`  ${C.g}✓${C.x} ${m}`)}
const bad=(m)=>{fail++;console.log(`  ${C.r}✗${C.x} ${m}`)}
const wrn=(m)=>{warn++;console.log(`  ${C.y}!${C.x} ${m}`)}
const skp=(m)=>{skip++;console.log(`  ${C.d}∘ ${m}${C.x}`)}
const sec=(m)=>console.log(`\n${C.c}${C.b}── ${m} ──${C.x}`)
const clip=(v)=>{try{return JSON.stringify(v).slice(0,160)}catch{return String(v).slice(0,160)}}
const good=(r)=>r.status>=200 && r.status<300

async function call(method, path, opts={}) {
  const { token, body, timeoutMs=20000, origin=false } = opts
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),timeoutMs)
  try {
    const headers={}
    if(token) headers.Authorization=`Bearer ${token}`
    if(body!==undefined) headers['Content-Type']='application/json'
    const url = (origin?ORIGIN:BASE)+path
    const res=await fetch(url,{method,headers,body:body!==undefined?JSON.stringify(body):undefined,signal:ctrl.signal})
    const text=await res.text(); let json; try{json=JSON.parse(text)}catch{json=text}
    const data=json&&typeof json==='object'&&'data' in json?json.data:json
    return { status:res.status, json, data, text }
  } catch(e){ return { status:0, json:{error:e?.message||String(e)}, data:null } } finally { clearTimeout(t) }
}

const cleanups=[]
async function runCleanups(){
  if (cleanups.length) sec('Cleanup (removing everything this test created)')
  let removed=0
  for(const c of cleanups.reverse()){ try{ await c.fn(); removed++ }catch{} }
  if (cleanups.length) console.log(`  ${C.d}removed ${removed}/${cleanups.length} created resources${C.x}`)
}
const onCleanup=(label, fn)=>cleanups.push({label, fn})

function finish(){
  sec('Result')
  const f=fail?C.r:C.d, w=warn?C.y:C.d
  console.log(`  ${C.g}${pass} passed${C.x}   ${f}${fail} failed${C.x}   ${w}${warn} warnings${C.x}   ${C.d}${skip} gated/skipped${C.x}`)
  console.log(fail===0
    ? `\n  ${C.g}${C.b}✅  ALL LIVE CHECKS PASSED — every module responded correctly${C.x}`
    : `\n  ${C.r}${C.b}❌  ${fail} FAILED — see the ✗ lines above${C.x}`)
  process.exit(fail>0?1:0)
}

// state shared across modules
let TOKEN, ME, USER_ID, WS, WS_ID, WS_ROLE, ORG_ID, IS_SUPER=false, IS_WS_ADMIN=false
let spaceId, projectId, listId, taskId, task2Id

// ── reporting helpers ────────────────────────────────────────────────────────
function rep(label, r, accept){ // accept: array of ok statuses (default = any 2xx)
  const okk = accept ? accept.includes(r.status) : good(r)
  okk ? ok(label) : bad(`${label} → ${r.status} ${clip(r.json)}`)
  return okk
}
// admin-gated create: pass if 2xx; if non-admin and 403, it's a correctly-gated skip
function adminWrite(label, r, accept){
  const okk = accept ? accept.includes(r.status) : good(r)
  if (okk) { ok(label); return true }
  if (!IS_WS_ADMIN && r.status===403) { skp(`${label} — gated 403 (you're not an admin here) ✓`); return false }
  bad(`${label} → ${r.status} ${clip(r.json)}`); return false
}
// reachability probe for destructive/external routes we must not actually trigger
function reach(label, r, codes){
  codes.includes(r.status) ? ok(`${label} — reachable (${r.status})`)
    : bad(`${label} → ${r.status} (expected ${codes.join('/')}) ${clip(r.json)}`)
}

async function main() {
  // ═══ Preflight: health + auth ══════════════════════════════════════════════
  sec('health — service liveness/readiness')
  rep('GET /health', await call('GET','/health'))
  rep('GET /health/ready', await call('GET','/health/ready'))

  sec('auth — login + identity')
  const login = await call('POST','/auth/login',{ body:{ email:process.env.HC_EMAIL, password:process.env.HC_PASSWORD } })
  TOKEN = login.data?.accessToken
  if (!TOKEN) { bad(`login → ${login.status} ${clip(login.json)}`); return }
  ok('POST /auth/login')
  WS = Array.isArray(login.data?.workspaces) ? login.data.workspaces : []
  const ORGS = Array.isArray(login.data?.organizations) ? login.data.organizations : []
  ORG_ID = ORGS[0]?.id
  rep('GET /auth/me', (ME = await call('GET','/auth/me',{ token:TOKEN })))
  USER_ID = ME.data?.id ?? ME.data?.user?.id
  IS_SUPER = (ME.data?.role ?? ME.data?.user?.role) === 'super_admin'
  rep('GET /auth/sessions', await call('GET','/auth/sessions',{ token:TOKEN }))
  rep('GET /users/me', await call('GET','/users/me',{ token:TOKEN }))

  if (!WS.length) { bad('account has no workspace — cannot run the suite'); return }
  WS_ID = WS[0].id; WS_ROLE = WS[0].role
  IS_WS_ADMIN = IS_SUPER || ['workspace_admin','manager','super_admin'].includes(WS_ROLE)
  ok(`using workspace ${WS_ID} (your role: ${WS_ROLE||'?'}${IS_SUPER?', super_admin':''})`)

  // ═══ workspaces / organizations ════════════════════════════════════════════
  sec('workspaces')
  rep('GET /workspaces', await call('GET','/workspaces',{ token:TOKEN }))
  const wsOne = await call('GET',`/workspaces/${WS_ID}`,{ token:TOKEN })
  rep('GET /workspaces/:id', wsOne)
  rep('GET /workspaces/:id/members', await call('GET',`/workspaces/${WS_ID}/members`,{ token:TOKEN }))
  // idempotent self-rename (set the name to its current value)
  const curName = wsOne.data?.name ?? WS[0]?.name ?? 'Workspace'
  adminWrite('PATCH /workspaces/:id (idempotent rename)', await call('PATCH',`/workspaces/${WS_ID}`,{ token:TOKEN, body:{ name: curName } }))

  sec('organizations')
  if (IS_SUPER) rep('GET /organizations (super-admin)', await call('GET','/organizations',{ token:TOKEN }))
  else skp('GET /organizations — gated to super_admin')
  if (ORG_ID) {
    rep('GET /organizations/:id', await call('GET',`/organizations/${ORG_ID}`,{ token:TOKEN }))
    rep('GET /organizations/:id/members', await call('GET',`/organizations/${ORG_ID}/members`,{ token:TOKEN }))
    adminWrite('GET /organizations/:id/workspaces (admin)', await call('GET',`/organizations/${ORG_ID}/workspaces`,{ token:TOKEN }))
  } else skp('organization detail — no organization on the account payload')

  // ═══ custom-roles ══════════════════════════════════════════════════════════
  sec('custom-roles (RBAC)')
  rep('GET …/roles/catalog', await call('GET',`/workspaces/${WS_ID}/roles/catalog`,{ token:TOKEN }))
  rep('GET …/roles/me/permissions', await call('GET',`/workspaces/${WS_ID}/roles/me/permissions`,{ token:TOKEN }))
  rep('GET …/roles', await call('GET',`/workspaces/${WS_ID}/roles`,{ token:TOKEN }))
  {
    const cr = await call('POST',`/workspaces/${WS_ID}/roles`,{ token:TOKEN, body:{ name:`master-test role ${Date.now()}`, permissions:[] } })
    if (adminWrite('POST …/roles (admin)', cr)) {
      const roleId = cr.data?.id
      onCleanup('role', ()=>call('DELETE',`/workspaces/${WS_ID}/roles/${roleId}`,{ token:TOKEN }))
      rep('GET …/roles/:id', await call('GET',`/workspaces/${WS_ID}/roles/${roleId}`,{ token:TOKEN }))
      rep('GET …/roles/:id/assignees', await call('GET',`/workspaces/${WS_ID}/roles/${roleId}/assignees`,{ token:TOKEN }))
      // role assignment is keyed by the workspace MEMBER row id, not the user id
      const mem = await call('GET',`/workspaces/${WS_ID}/members`,{ token:TOKEN })
      const memberId = Array.isArray(mem.data) ? (mem.data.find(m=>m.userId===USER_ID)?.workspaceMemberId) : null
      if (memberId) {
        const asg = await call('POST',`/workspaces/${WS_ID}/members/${memberId}/roles/${roleId}`,{ token:TOKEN })
        if (good(asg)) { ok('POST …/members/:id/roles/:roleId (assign)')
          rep('GET …/members/:id/roles', await call('GET',`/workspaces/${WS_ID}/members/${memberId}/roles`,{ token:TOKEN }))
          rep('DELETE …/members/:id/roles/:roleId (unassign)', await call('DELETE',`/workspaces/${WS_ID}/members/${memberId}/roles/${roleId}`,{ token:TOKEN }))
        } else if (!IS_WS_ADMIN && asg.status===403) skp('member role assign — gated 403 ✓')
        else bad(`member role assign → ${asg.status} ${clip(asg.json)}`)
      } else skp('member role assign — could not resolve own workspace member id')
    }
  }

  // ═══ container tree: spaces → projects → lists ═════════════════════════════
  sec('spaces / projects / lists (container tree — created & owned by this test)')
  const sp = await call('POST','/spaces',{ token:TOKEN, body:{ workspaceId:WS_ID, name:'zz master-test space' } })
  spaceId = sp.data?.id
  if (!rep('POST /spaces', sp) || !spaceId) { wrn('cannot continue tree-dependent modules without a space'); }
  else {
    onCleanup('space', ()=>call('DELETE',`/spaces/${spaceId}`,{ token:TOKEN }))
    rep('GET /spaces/workspace/:ws', await call('GET',`/spaces/workspace/${WS_ID}`,{ token:TOKEN }))
    rep('GET /spaces/:id', await call('GET',`/spaces/${spaceId}`,{ token:TOKEN }))
    const pr = await call('POST','/projects',{ token:TOKEN, body:{ spaceId, name:'zz master-test project' } })
    projectId = pr.data?.id
    if (rep('POST /projects', pr) && projectId) {
      onCleanup('project', ()=>call('DELETE',`/projects/${projectId}`,{ token:TOKEN }))
      rep('GET /projects/space/:id', await call('GET',`/projects/space/${spaceId}`,{ token:TOKEN }))
      rep('GET /projects/:id', await call('GET',`/projects/${projectId}`,{ token:TOKEN }))
      const li = await call('POST','/lists',{ token:TOKEN, body:{ projectId, name:'zz master-test list' } })
      listId = li.data?.id
      if (rep('POST /lists', li) && listId) {
        onCleanup('list', ()=>call('DELETE',`/lists/${listId}`,{ token:TOKEN }))
        rep('GET /lists/project/:id', await call('GET',`/lists/project/${projectId}`,{ token:TOKEN }))
        rep('GET /lists/:id', await call('GET',`/lists/${listId}`,{ token:TOKEN }))
      }
    }
  }

  // ═══ list-statuses ═════════════════════════════════════════════════════════
  if (listId) {
    sec('list-statuses')
    rep('GET /lists/:id/statuses', await call('GET',`/lists/${listId}/statuses`,{ token:TOKEN }))
    const st = await call('POST',`/lists/${listId}/statuses`,{ token:TOKEN, body:{ name:'QA Review', color:'#8b5cf6' } })
    if (rep('POST /lists/:id/statuses', st)) {
      const statusId = st.data?.id
      const all = await call('GET',`/lists/${listId}/statuses`,{ token:TOKEN })
      const ids = Array.isArray(all.data) ? all.data.map(s=>s.id) : []
      rep('POST /lists/:id/statuses/reorder', await call('POST',`/lists/${listId}/statuses/reorder`,{ token:TOKEN, body:{ orderedIds: ids } }))
      rep('PATCH /lists/:id/statuses/:statusId', await call('PATCH',`/lists/${listId}/statuses/${statusId}`,{ token:TOKEN, body:{ name:'QA' } }))
      rep('DELETE /lists/:id/statuses/:statusId', await call('DELETE',`/lists/${listId}/statuses/${statusId}`,{ token:TOKEN }))
    }
  }

  // ═══ views ═════════════════════════════════════════════════════════════════
  if (listId) {
    sec('views')
    rep('GET /lists/:id/views', await call('GET',`/lists/${listId}/views`,{ token:TOKEN }))
    const vw = await call('POST',`/lists/${listId}/views`,{ token:TOKEN, body:{ name:'Board (master)', type:'board' } })
    if (rep('POST /lists/:id/views', vw)) {
      const viewId = vw.data?.id
      rep('PATCH /views/:id', await call('PATCH',`/views/${viewId}`,{ token:TOKEN, body:{ name:'Board' } }))
      rep('DELETE /views/:id', await call('DELETE',`/views/${viewId}`,{ token:TOKEN }))
    }
  }

  // ═══ tasks + everything hanging off a task ═════════════════════════════════
  if (listId) {
    sec('tasks (create with dates + priority, navigation, listings)')
    const due = new Date(Date.now()+7*864e5).toISOString()
    const t = await call('POST','/tasks',{ token:TOKEN, body:{ listId, title:'zz master-test task', priority:'high', dueDate:due, startDate:new Date().toISOString() } })
    taskId = t.data?.id
    if (rep('POST /tasks', t) && taskId) {
      onCleanup('task', ()=>call('DELETE',`/tasks/${taskId}`,{ token:TOKEN }))
      const g = await call('GET',`/tasks/${taskId}`,{ token:TOKEN })
      rep('GET /tasks/:id', g)
      ;(g.data?.priority==='high' && g.data?.dueDate && g.data?.startDate)
        ? ok('task persisted priority + due + start from creation')
        : bad(`task field persistence: priority=${g.data?.priority} due=${!!g.data?.dueDate} start=${!!g.data?.startDate}`)
      rep('GET /tasks/:id/navigation', await call('GET',`/tasks/${taskId}/navigation`,{ token:TOKEN }))
      rep('GET /tasks/:id/subtasks', await call('GET',`/tasks/${taskId}/subtasks`,{ token:TOKEN }))
      rep('GET /tasks/list/:id', await call('GET',`/tasks/list/${listId}`,{ token:TOKEN }))
      rep('GET /tasks/workspace/:ws', await call('GET',`/tasks/workspace/${WS_ID}`,{ token:TOKEN }))
      rep('GET /tasks/workspace/:ws/timeline', await call('GET',`/tasks/workspace/${WS_ID}/timeline`,{ token:TOKEN }))
      rep('PATCH /tasks/:id', await call('PATCH',`/tasks/${taskId}`,{ token:TOKEN, body:{ priority:'normal' } }))
      // a second task for dependency / sprint tests
      const t2 = await call('POST','/tasks',{ token:TOKEN, body:{ listId, title:'zz master-test task 2' } })
      task2Id = t2.data?.id
      if (task2Id) onCleanup('task2', ()=>call('DELETE',`/tasks/${task2Id}`,{ token:TOKEN }))

      sec('task › comments')
      const cm = await call('POST',`/tasks/${taskId}/comments`,{ token:TOKEN, body:{ body:'master test comment' } })
      if (rep('POST /tasks/:id/comments', cm)) {
        const commentId = cm.data?.id
        rep('GET /tasks/:id/comments', await call('GET',`/tasks/${taskId}/comments`,{ token:TOKEN }))
        rep('POST …/comments/:id/reactions', await call('POST',`/tasks/${taskId}/comments/${commentId}/reactions`,{ token:TOKEN, body:{ emoji:'👍' } }))
        rep('POST …/comments/:id/resolve', await call('POST',`/tasks/${taskId}/comments/${commentId}/resolve`,{ token:TOKEN, body:{ resolved:true } }))
        rep('DELETE …/comments/:id', await call('DELETE',`/tasks/${taskId}/comments/${commentId}`,{ token:TOKEN }))
      }

      sec('task › checklists')
      const ck = await call('POST',`/tasks/${taskId}/checklists`,{ token:TOKEN, body:{ title:'QA checklist' } })
      if (rep('POST /tasks/:id/checklists', ck)) {
        const checklistId = ck.data?.id
        const it = await call('POST',`/tasks/${taskId}/checklists/${checklistId}/items`,{ token:TOKEN, body:{ content:'verify it works' } })
        rep('POST …/checklists/:id/items', it)
        const itemId = it.data?.id
        if (itemId) rep('PATCH …/checklists/items/:id', await call('PATCH',`/tasks/${taskId}/checklists/items/${itemId}`,{ token:TOKEN, body:{ isDone:true } }))
        rep('DELETE …/checklists/:id', await call('DELETE',`/tasks/${taskId}/checklists/${checklistId}`,{ token:TOKEN }))
      }

      sec('task › dependencies')
      rep('GET /tasks/:id/dependencies/graph', await call('GET',`/tasks/${taskId}/dependencies/graph`,{ token:TOKEN }))
      if (task2Id) {
        const dep = await call('POST',`/tasks/${taskId}/dependencies`,{ token:TOKEN, body:{ relatedTaskId:task2Id, type:'blocks' } })
        if (rep('POST /tasks/:id/dependencies', dep)) {
          const depId = dep.data?.id
          if (depId) rep('DELETE /tasks/:id/dependencies/:depId', await call('DELETE',`/tasks/${taskId}/dependencies/${depId}`,{ token:TOKEN }))
        }
      } else skp('dependency create — no second task')

      sec('task › activity')
      rep('GET /tasks/:id/activity', await call('GET',`/tasks/${taskId}/activity`,{ token:TOKEN }))

      sec('task › time-entries')
      rep('GET /tasks/:id/time-entries', await call('GET',`/tasks/${taskId}/time-entries`,{ token:TOKEN }))
      const start = await call('POST',`/tasks/${taskId}/time-entries/start`,{ token:TOKEN, body:{ description:'master test timer' } })
      if (rep('POST …/time-entries/start', start)) {
        const entryId = start.data?.id
        rep('GET /time-entries/active', await call('GET','/time-entries/active',{ token:TOKEN }))
        if (entryId) rep('POST …/time-entries/stop/:id', await call('POST',`/tasks/${taskId}/time-entries/stop/${entryId}`,{ token:TOKEN }))
      }
      const man = await call('POST',`/tasks/${taskId}/time-entries/manual`,{ token:TOKEN, body:{ startedAt:new Date(Date.now()-3600e3).toISOString(), endedAt:new Date().toISOString(), description:'manual master' } })
      rep('POST …/time-entries/manual', man)

      sec('task › assignees / watchers')
      if (USER_ID) {
        rep('POST /tasks/:id/assignees', await call('POST',`/tasks/${taskId}/assignees`,{ token:TOKEN, body:{ userId:USER_ID } }))
        rep('DELETE /tasks/:id/assignees/:userId', await call('DELETE',`/tasks/${taskId}/assignees/${USER_ID}`,{ token:TOKEN }))
        rep('POST /tasks/:id/watchers', await call('POST',`/tasks/${taskId}/watchers`,{ token:TOKEN, body:{ userId:USER_ID } }))
        rep('DELETE /tasks/:id/watchers/:userId', await call('DELETE',`/tasks/${taskId}/watchers/${USER_ID}`,{ token:TOKEN }))
      }

      sec('labels (workspace) + task label attach/detach')
      rep('GET /workspaces/:ws/labels', await call('GET',`/workspaces/${WS_ID}/labels`,{ token:TOKEN }))
      const lab = await call('POST',`/workspaces/${WS_ID}/labels`,{ token:TOKEN, body:{ name:`master-${Date.now()}`, color:'#22c55e' } })
      if (rep('POST /workspaces/:ws/labels', lab)) {
        const labelId = lab.data?.id
        rep('POST /tasks/:id/labels/:labelId', await call('POST',`/tasks/${taskId}/labels/${labelId}`,{ token:TOKEN }))
        rep('DELETE /tasks/:id/labels/:labelId', await call('DELETE',`/tasks/${taskId}/labels/${labelId}`,{ token:TOKEN }))
        rep('PATCH /labels/:id', await call('PATCH',`/labels/${labelId}`,{ token:TOKEN, body:{ name:'master-renamed' } }))
        rep('DELETE /labels/:id', await call('DELETE',`/labels/${labelId}`,{ token:TOKEN }))
      }

      sec('custom-fields (project definition + task value)')
      if (projectId) {
        rep('GET …/projects/:id/custom-fields', await call('GET',`/workspaces/${WS_ID}/projects/${projectId}/custom-fields`,{ token:TOKEN }))
        const cf = await call('POST',`/workspaces/${WS_ID}/projects/${projectId}/custom-fields`,{ token:TOKEN, body:{ name:'Severity', type:'text' } })
        if (rep('POST …/projects/:id/custom-fields', cf)) {
          const fieldId = cf.data?.id
          rep('PUT …/tasks/:id/custom-fields/:fieldId', await call('PUT',`/workspaces/${WS_ID}/tasks/${taskId}/custom-fields/${fieldId}`,{ token:TOKEN, body:{ value:'high' } }))
          rep('GET …/tasks/:id/custom-fields', await call('GET',`/workspaces/${WS_ID}/tasks/${taskId}/custom-fields`,{ token:TOKEN }))
          rep('DELETE …/custom-fields/:fieldId', await call('DELETE',`/workspaces/${WS_ID}/custom-fields/${fieldId}`,{ token:TOKEN }))
        }
      }

      sec('attachments — presign (R2 storage)')
      const ap = await call('POST',`/tasks/${taskId}/attachments/presign`,{ token:TOKEN, body:{ fileName:'probe.png', contentType:'image/png' } })
      if (ap.status<300 && (ap.data?.uploadUrl||ap.data?.url)) ok('POST /tasks/:id/attachments/presign → 200 (R2 configured)')
      else if (ap.status===400) wrn('attachment presign → 400 (R2 not configured — set R2_* env + bucket CORS)')
      else bad(`attachment presign → ${ap.status} (want 200 or clean 400) ${clip(ap.json)}`)
      rep('GET /tasks/:id/attachments', await call('GET',`/tasks/${taskId}/attachments`,{ token:TOKEN }))
    }
  }

  // ═══ docs ══════════════════════════════════════════════════════════════════
  sec('docs (collaborative documents)')
  rep('GET /workspaces/:ws/docs', await call('GET',`/workspaces/${WS_ID}/docs`,{ token:TOKEN }))
  {
    const dc = await call('POST',`/workspaces/${WS_ID}/docs`,{ token:TOKEN, body:{ title:'zz master-test doc' } })
    if (rep('POST /workspaces/:ws/docs', dc)) {
      const docId = dc.data?.id
      onCleanup('doc', ()=>call('DELETE',`/docs/${docId}`,{ token:TOKEN }))
      rep('GET /docs/:id', await call('GET',`/docs/${docId}`,{ token:TOKEN }))
      rep('PATCH /docs/:id', await call('PATCH',`/docs/${docId}`,{ token:TOKEN, body:{ content:{ type:'doc', content:[] } } }))
      rep('GET /docs/:id/revisions', await call('GET',`/docs/${docId}/revisions`,{ token:TOKEN }))
      const dcm = await call('POST',`/docs/${docId}/comments`,{ token:TOKEN, body:{ body:'doc comment' } })
      if (rep('POST /docs/:id/comments', dcm)) {
        rep('GET /docs/:id/comments', await call('GET',`/docs/${docId}/comments`,{ token:TOKEN }))
      }
      const sh = await call('POST',`/docs/${docId}/share`,{ token:TOKEN })
      if (rep('POST /docs/:id/share (enable public)', sh)) {
        const slug = sh.data?.publicShareId ?? sh.data?.publicShareSlug ?? sh.data?.slug
        if (slug) rep('GET /public/docs/:slug (anonymous)', await call('GET',`/public/docs/${slug}`))
        else skp('public doc fetch — share response had no slug')
        rep('DELETE /docs/:id/share (disable public)', await call('DELETE',`/docs/${docId}/share`,{ token:TOKEN }))
      }
    }
  }

  // ═══ goals ═════════════════════════════════════════════════════════════════
  sec('goals + key-results')
  rep('GET /workspaces/:ws/goals', await call('GET',`/workspaces/${WS_ID}/goals`,{ token:TOKEN }))
  {
    const gl = await call('POST',`/workspaces/${WS_ID}/goals`,{ token:TOKEN, body:{ title:'zz master-test goal', kind:'number', targetValue:100 } })
    if (rep('POST /workspaces/:ws/goals', gl)) {
      const goalId = gl.data?.id
      onCleanup('goal', ()=>call('DELETE',`/goals/${goalId}`,{ token:TOKEN }))
      rep('GET /goals/:id', await call('GET',`/goals/${goalId}`,{ token:TOKEN }))
      rep('PATCH /goals/:id', await call('PATCH',`/goals/${goalId}`,{ token:TOKEN, body:{ currentValue:25 } }))
      rep('GET /goals/:id/history', await call('GET',`/goals/${goalId}/history`,{ token:TOKEN }))
      const kr = await call('POST',`/goals/${goalId}/key-results`,{ token:TOKEN, body:{ title:'KR one', targetValue:10 } })
      if (rep('POST /goals/:id/key-results', kr)) {
        const krId = kr.data?.id
        rep('GET /goals/:id/key-results', await call('GET',`/goals/${goalId}/key-results`,{ token:TOKEN }))
        if (krId) rep('DELETE /goals/:id/key-results/:krId', await call('DELETE',`/goals/${goalId}/key-results/${krId}`,{ token:TOKEN }))
      }
    }
  }

  // ═══ sprints ═══════════════════════════════════════════════════════════════
  sec('sprints')
  rep('GET /workspaces/:ws/sprints', await call('GET',`/workspaces/${WS_ID}/sprints`,{ token:TOKEN }))
  {
    const spr = await call('POST',`/workspaces/${WS_ID}/sprints`,{ token:TOKEN, body:{ name:'zz master sprint', startDate:new Date().toISOString(), endDate:new Date(Date.now()+14*864e5).toISOString() } })
    if (rep('POST /workspaces/:ws/sprints', spr)) {
      const sprintId = spr.data?.id
      onCleanup('sprint', ()=>call('DELETE',`/sprints/${sprintId}`,{ token:TOKEN }))
      rep('GET /sprints/:id', await call('GET',`/sprints/${sprintId}`,{ token:TOKEN }))
      rep('PATCH /sprints/:id', await call('PATCH',`/sprints/${sprintId}`,{ token:TOKEN, body:{ goal:'ship it' } }))
      if (taskId) {
        const add = await call('POST',`/sprints/${sprintId}/tasks`,{ token:TOKEN, body:{ taskId } })
        if (rep('POST /sprints/:id/tasks', add)) {
          rep('GET /sprints/:id/tasks', await call('GET',`/sprints/${sprintId}/tasks`,{ token:TOKEN }))
          rep('DELETE /sprints/:id/tasks/:taskId', await call('DELETE',`/sprints/${sprintId}/tasks/${taskId}`,{ token:TOKEN }))
        }
      }
    }
  }

  // ═══ automations (admin) ═══════════════════════════════════════════════════
  sec('automations')
  rep('GET /workspaces/:ws/automations', await call('GET',`/workspaces/${WS_ID}/automations`,{ token:TOKEN }))
  {
    const au = await call('POST',`/workspaces/${WS_ID}/automations`,{ token:TOKEN, body:{ name:'zz master automation', trigger:{ type:'task.created' }, actions:[{ type:'send_notification', params:{ message:'hi' } }] } })
    if (adminWrite('POST /workspaces/:ws/automations (admin)', au)) {
      const automationId = au.data?.id
      onCleanup('automation', ()=>call('DELETE',`/workspaces/${WS_ID}/automations/${automationId}`,{ token:TOKEN }))
      rep('GET …/automations/:id', await call('GET',`/workspaces/${WS_ID}/automations/${automationId}`,{ token:TOKEN }))
      rep('GET …/automations/:id/runs', await call('GET',`/workspaces/${WS_ID}/automations/${automationId}/runs`,{ token:TOKEN }))
      rep('PATCH …/automations/:id', await call('PATCH',`/workspaces/${WS_ID}/automations/${automationId}`,{ token:TOKEN, body:{ isEnabled:false } }))
    }
  }

  // ═══ canvases ══════════════════════════════════════════════════════════════
  sec('canvases (whiteboards / mind-maps)')
  rep('GET /workspaces/:ws/canvases', await call('GET',`/workspaces/${WS_ID}/canvases`,{ token:TOKEN }))
  {
    const cv = await call('POST',`/workspaces/${WS_ID}/canvases`,{ token:TOKEN, body:{ type:'whiteboard', title:'zz master canvas' } })
    if (rep('POST /workspaces/:ws/canvases', cv)) {
      const canvasId = cv.data?.id
      onCleanup('canvas', ()=>call('DELETE',`/workspaces/${WS_ID}/canvases/${canvasId}`,{ token:TOKEN }))
      rep('GET …/canvases/:id', await call('GET',`/workspaces/${WS_ID}/canvases/${canvasId}`,{ token:TOKEN }))
      rep('PATCH …/canvases/:id', await call('PATCH',`/workspaces/${WS_ID}/canvases/${canvasId}`,{ token:TOKEN, body:{ title:'zz master canvas (edited)' } }))
    }
  }

  // ═══ dashboards ════════════════════════════════════════════════════════════
  sec('dashboards (presets + dock)')
  rep('GET /dashboards/workspace/:ws', await call('GET',`/dashboards/workspace/${WS_ID}`,{ token:TOKEN }))
  {
    const db = await call('POST','/dashboards',{ token:TOKEN, body:{ workspaceId:WS_ID, name:'zz master dashboard', layout:[] } })
    if (rep('POST /dashboards', db)) {
      const dashId = db.data?.id
      onCleanup('dashboard', ()=>call('DELETE',`/dashboards/${dashId}`,{ token:TOKEN }))
      rep('PUT /dashboards/:id', await call('PUT',`/dashboards/${dashId}`,{ token:TOKEN, body:{ name:'zz master dashboard 2' } }))
    }
  }
  rep('GET /dashboards/dock/:ws', await call('GET',`/dashboards/dock/${WS_ID}`,{ token:TOKEN }))
  rep('POST /dashboards/dock/:ws', await call('POST',`/dashboards/dock/${WS_ID}`,{ token:TOKEN, body:{} }))

  // ═══ forms ═════════════════════════════════════════════════════════════════
  sec('forms (+ public submit)')
  rep('GET /workspaces/:ws/forms', await call('GET',`/workspaces/${WS_ID}/forms`,{ token:TOKEN }))
  {
    const fm = await call('POST',`/workspaces/${WS_ID}/forms`,{ token:TOKEN, body:{ title:'zz master form' } })
    if (rep('POST /workspaces/:ws/forms', fm)) {
      const formId = fm.data?.id
      const slug = fm.data?.slug
      onCleanup('form', ()=>call('DELETE',`/workspaces/${WS_ID}/forms/${formId}`,{ token:TOKEN }))
      rep('GET …/forms/:id', await call('GET',`/workspaces/${WS_ID}/forms/${formId}`,{ token:TOKEN }))
      const fld = await call('POST',`/workspaces/${WS_ID}/forms/${formId}/fields`,{ token:TOKEN, body:{ type:'text', label:'Your name' } })
      if (rep('POST …/forms/:id/fields', fld)) {
        const fieldId = fld.data?.id
        if (fieldId) rep('PUT …/forms/:id/fields/reorder', await call('PUT',`/workspaces/${WS_ID}/forms/${formId}/fields/reorder`,{ token:TOKEN, body:{ orderedIds:[fieldId] } }))
      }
      // public, no auth
      if (slug) {
        rep('GET /forms/:slug (public)', await call('GET',`/forms/${slug}`))
        rep('POST /forms/:slug/submit (public)', await call('POST',`/forms/${slug}/submit`,{ body:{ data:{}, submitterEmail:'qa@example.com', submitterName:'QA' } }))
      } else skp('public form fetch/submit — no slug on create response')
      rep('GET …/forms/:id/submissions', await call('GET',`/workspaces/${WS_ID}/forms/${formId}/submissions`,{ token:TOKEN }))
      rep('PATCH …/forms/:id/archive', await call('PATCH',`/workspaces/${WS_ID}/forms/${formId}/archive`,{ token:TOKEN }))
    }
  }

  // ═══ personal-tasks ════════════════════════════════════════════════════════
  sec('personal-tasks (My Work checklist)')
  rep('GET /workspaces/:ws/personal-tasks', await call('GET',`/workspaces/${WS_ID}/personal-tasks`,{ token:TOKEN }))
  {
    const pt = await call('POST',`/workspaces/${WS_ID}/personal-tasks`,{ token:TOKEN, body:{ title:'master personal task' } })
    if (rep('POST /workspaces/:ws/personal-tasks', pt)) {
      const id = pt.data?.id
      rep('PATCH /personal-tasks/:id', await call('PATCH',`/personal-tasks/${id}`,{ token:TOKEN, body:{ done:true } }))
      rep('DELETE /personal-tasks/:id', await call('DELETE',`/personal-tasks/${id}`,{ token:TOKEN }))
    }
  }

  // ═══ workspace-groups (admin) ══════════════════════════════════════════════
  sec('workspace-groups (member teams)')
  rep('GET /workspaces/:ws/groups', await call('GET',`/workspaces/${WS_ID}/groups`,{ token:TOKEN }))
  {
    const gp = await call('POST',`/workspaces/${WS_ID}/groups`,{ token:TOKEN, body:{ name:'zz master group' } })
    if (adminWrite('POST /workspaces/:ws/groups (admin)', gp)) {
      const groupId = gp.data?.id
      onCleanup('group', ()=>call('DELETE',`/workspaces/${WS_ID}/groups/${groupId}`,{ token:TOKEN }))
      rep('GET …/groups/:id', await call('GET',`/workspaces/${WS_ID}/groups/${groupId}`,{ token:TOKEN }))
      rep('PATCH …/groups/:id', await call('PATCH',`/workspaces/${WS_ID}/groups/${groupId}`,{ token:TOKEN, body:{ description:'team' } }))
      if (USER_ID) {
        rep('POST …/groups/:id/members', await call('POST',`/workspaces/${WS_ID}/groups/${groupId}/members`,{ token:TOKEN, body:{ userIds:[USER_ID] } }))
        rep('PUT …/groups/:id/members (replace)', await call('PUT',`/workspaces/${WS_ID}/groups/${groupId}/members`,{ token:TOKEN, body:{ userIds:[USER_ID] } }))
        rep('DELETE …/groups/:id/members/:userId', await call('DELETE',`/workspaces/${WS_ID}/groups/${groupId}/members/${USER_ID}`,{ token:TOKEN }))
      }
    }
  }

  // ═══ project-templates ═════════════════════════════════════════════════════
  sec('project-templates')
  rep('GET /workspaces/:ws/project-templates', await call('GET',`/workspaces/${WS_ID}/project-templates`,{ token:TOKEN }))
  if (projectId && spaceId) {
    const pt = await call('POST',`/workspaces/${WS_ID}/project-templates/save-from-project`,{ token:TOKEN, body:{ projectId, name:'zz master ptemplate' } })
    if (adminWrite('POST …/project-templates/save-from-project (admin)', pt)) {
      const templateId = pt.data?.id
      onCleanup('ptemplate', ()=>call('DELETE',`/workspaces/${WS_ID}/project-templates/${templateId}`,{ token:TOKEN }))
      rep('GET …/project-templates/:id', await call('GET',`/workspaces/${WS_ID}/project-templates/${templateId}`,{ token:TOKEN }))
      const ap = await call('POST',`/workspaces/${WS_ID}/project-templates/apply`,{ token:TOKEN, body:{ templateId, targetSpaceId:spaceId, projectName:'zz applied (master)' } })
      if (rep('POST …/project-templates/apply', ap)) {
        const newProj = ap.data?.id ?? ap.data?.projectId
        if (newProj) onCleanup('applied-project', ()=>call('DELETE',`/projects/${newProj}`,{ token:TOKEN }))
      }
    }
  } else skp('project-template save/apply — no project/space available')

  // ═══ task-templates ════════════════════════════════════════════════════════
  sec('task-templates')
  rep('GET /workspaces/:ws/task-templates', await call('GET',`/workspaces/${WS_ID}/task-templates`,{ token:TOKEN }))
  {
    const tt = await call('POST',`/workspaces/${WS_ID}/task-templates`,{ token:TOKEN, body:{ name:'zz master ttemplate', payload:{ title:'from template' } } })
    if (adminWrite('POST …/task-templates (template.manage)', tt)) {
      const templateId = tt.data?.id
      onCleanup('ttemplate', ()=>call('DELETE',`/workspaces/${WS_ID}/task-templates/${templateId}`,{ token:TOKEN }))
      rep('GET …/task-templates/:id', await call('GET',`/workspaces/${WS_ID}/task-templates/${templateId}`,{ token:TOKEN }))
      if (listId) {
        const inst = await call('POST',`/workspaces/${WS_ID}/task-templates/${templateId}/instantiate`,{ token:TOKEN, body:{ listId } })
        if (rep('POST …/task-templates/:id/instantiate', inst)) {
          const newTask = inst.data?.id
          if (newTask) onCleanup('tmpl-task', ()=>call('DELETE',`/tasks/${newTask}`,{ token:TOKEN }))
        }
      }
    }
  }

  // ═══ webhooks (admin) ══════════════════════════════════════════════════════
  sec('webhooks')
  rep('GET /workspaces/:ws/webhooks/events', await call('GET',`/workspaces/${WS_ID}/webhooks/events`,{ token:TOKEN }))
  rep('GET /workspaces/:ws/webhooks', await call('GET',`/workspaces/${WS_ID}/webhooks`,{ token:TOKEN }))
  {
    const wh = await call('POST',`/workspaces/${WS_ID}/webhooks`,{ token:TOKEN, body:{ name:'zz master webhook', url:'https://example.com/webhook', events:['task.created'] } })
    if (adminWrite('POST /workspaces/:ws/webhooks (admin)', wh)) {
      const webhookId = wh.data?.id
      onCleanup('webhook', ()=>call('DELETE',`/workspaces/${WS_ID}/webhooks/${webhookId}`,{ token:TOKEN }))
      rep('POST …/webhooks/:id/test', await call('POST',`/workspaces/${WS_ID}/webhooks/${webhookId}/test`,{ token:TOKEN, timeoutMs:30000 }))
      rep('GET …/webhooks/:id/deliveries', await call('GET',`/workspaces/${WS_ID}/webhooks/${webhookId}/deliveries`,{ token:TOKEN }))
      rep('PATCH …/webhooks/:id', await call('PATCH',`/workspaces/${WS_ID}/webhooks/${webhookId}`,{ token:TOKEN, body:{ isEnabled:false } }))
    }
  }

  // ═══ chat ══════════════════════════════════════════════════════════════════
  sec('chat (channels + messages)')
  const chans = await call('GET',`/workspaces/${WS_ID}/chat/channels`,{ token:TOKEN })
  rep('GET /workspaces/:ws/chat/channels', chans)
  {
    const ch = await call('POST',`/workspaces/${WS_ID}/chat/channels`,{ token:TOKEN, body:{ name:`zz-master-${Date.now()}` } })
    if (rep('POST /workspaces/:ws/chat/channels', ch)) {
      const channelId = ch.data?.id
      const msg = await call('POST',`/chat/channels/${channelId}/messages`,{ token:TOKEN, body:{ body:'master test message' } })
      if (rep('POST /chat/channels/:id/messages', msg)) {
        const messageId = msg.data?.id
        rep('GET /chat/channels/:id/messages', await call('GET',`/chat/channels/${channelId}/messages`,{ token:TOKEN }))
        rep('GET /chat/messages/:id', await call('GET',`/chat/messages/${messageId}`,{ token:TOKEN }))
        rep('GET /chat/messages/:id/thread', await call('GET',`/chat/messages/${messageId}/thread`,{ token:TOKEN }))
        rep('POST /chat/messages/:id/reactions', await call('POST',`/chat/messages/${messageId}/reactions`,{ token:TOKEN, body:{ emoji:'🎉' } }))
        rep('POST /chat/messages/:id/pin', await call('POST',`/chat/messages/${messageId}/pin`,{ token:TOKEN }))
        rep('GET /chat/channels/:id/pinned', await call('GET',`/chat/channels/${channelId}/pinned`,{ token:TOKEN }))
        rep('DELETE /chat/messages/:id/pin', await call('DELETE',`/chat/messages/${messageId}/pin`,{ token:TOKEN }))
        rep('POST /chat/messages/:id/save', await call('POST',`/chat/messages/${messageId}/save`,{ token:TOKEN }))
        rep('GET /workspaces/:ws/chat/saved', await call('GET',`/workspaces/${WS_ID}/chat/saved`,{ token:TOKEN }))
        rep('DELETE /chat/messages/:id/save', await call('DELETE',`/chat/messages/${messageId}/save`,{ token:TOKEN }))
        rep('PATCH /chat/messages/:id (edit)', await call('PATCH',`/chat/messages/${messageId}`,{ token:TOKEN, body:{ body:'edited master message' } }))
        rep('DELETE /chat/messages/:id', await call('DELETE',`/chat/messages/${messageId}`,{ token:TOKEN }))
      }
      rep('POST /chat/channels/:id/leave', await call('POST',`/chat/channels/${channelId}/leave`,{ token:TOKEN }))
      wrn('chat: the test channel cannot be auto-deleted (no delete-channel API) — it is left empty')
    }
  }

  // ═══ notifications ═════════════════════════════════════════════════════════
  sec('notifications')
  rep('GET /notifications', await call('GET','/notifications',{ token:TOKEN }))
  rep('GET /notifications/unread-count', await call('GET','/notifications/unread-count',{ token:TOKEN }))
  const prefs = await call('GET','/notifications/preferences',{ token:TOKEN })
  rep('GET /notifications/preferences', prefs)
  // round-trip the prefs we just read so the POST is idempotent
  rep('POST /notifications/preferences (idempotent)', await call('POST','/notifications/preferences',{ token:TOKEN, body:{ channels: prefs.data?.channels ?? {}, events: prefs.data?.events ?? {} } }))
  rep('GET /notifications/web-push/public-key', await call('GET','/notifications/web-push/public-key',{ token:TOKEN }))

  // ═══ calendar-sync ═════════════════════════════════════════════════════════
  sec('calendar-sync (iCal token + task push)')
  rep('GET …/calendar-sync/ical-token', await call('GET',`/workspaces/${WS_ID}/calendar-sync/ical-token`,{ token:TOKEN }))
  if (taskId) reach('POST …/calendar-sync/tasks/:id/push', await call('POST',`/workspaces/${WS_ID}/calendar-sync/tasks/${taskId}/push`,{ token:TOKEN }), [200,201,400,404,409,503])

  // ═══ email-to-task ═════════════════════════════════════════════════════════
  if (listId) {
    sec('email-to-task (per-list inbound alias)')
    rep('GET /lists/:id/inbound-email', await call('GET',`/lists/${listId}/inbound-email`,{ token:TOKEN }))
    const al = await call('POST',`/lists/${listId}/inbound-email`,{ token:TOKEN })
    if (rep('POST /lists/:id/inbound-email (create alias)', al)) {
      rep('POST /lists/:id/inbound-email/rotate', await call('POST',`/lists/${listId}/inbound-email/rotate`,{ token:TOKEN }))
      rep('DELETE /lists/:id/inbound-email (revoke)', await call('DELETE',`/lists/${listId}/inbound-email`,{ token:TOKEN }))
    }
  }
  // inbound webhook receiver (unauth) — probe without a valid payload
  reach('POST /inbound/email (webhook receiver)', await call('POST','/inbound/email',{ body:{} }), [400,401])

  // ═══ clips ═════════════════════════════════════════════════════════════════
  sec('clips (screen recordings)')
  rep('GET /workspaces/:ws/clips', await call('GET',`/workspaces/${WS_ID}/clips`,{ token:TOKEN }))
  {
    const cp = await call('POST',`/workspaces/${WS_ID}/clips/presign`,{ token:TOKEN, body:{ fileName:'clip.webm', contentType:'video/webm' } })
    if (cp.status<300 && (cp.data?.uploadUrl||cp.data?.url)) ok('POST /workspaces/:ws/clips/presign → 200 (R2 configured)')
    else if (cp.status===400) wrn('clip presign → 400 (R2 not configured)')
    else bad(`clip presign → ${cp.status} (want 200 or clean 400) ${clip(cp.json)}`)
  }

  // ═══ reports ═══════════════════════════════════════════════════════════════
  sec('reports (analytics)')
  for (const p of ['overview','productivity','completion','time','sprints','goals','workload']) {
    rep(`GET …/reports/${p}`, await call('GET',`/workspaces/${WS_ID}/reports/${p}`,{ token:TOKEN }))
  }
  rep('POST …/reports/custom/run', await call('POST',`/workspaces/${WS_ID}/reports/custom/run`,{ token:TOKEN, body:{} }))
  {
    const cr = await call('POST',`/workspaces/${WS_ID}/reports/custom`,{ token:TOKEN, body:{ name:'zz master report', definition:{} } })
    if (rep('POST …/reports/custom (save)', cr)) {
      const reportId = cr.data?.id
      onCleanup('custom-report', ()=>call('DELETE',`/workspaces/${WS_ID}/reports/custom/${reportId}`,{ token:TOKEN }))
      rep('GET …/reports/custom (list)', await call('GET',`/workspaces/${WS_ID}/reports/custom`,{ token:TOKEN }))
      rep('PATCH …/reports/custom/:id', await call('PATCH',`/workspaces/${WS_ID}/reports/custom/${reportId}`,{ token:TOKEN, body:{ name:'zz master report 2' } }))
    }
  }

  // ═══ search ════════════════════════════════════════════════════════════════
  sec('search')
  rep('GET /search/:ws?q=', await call('GET',`/search/${WS_ID}?q=master`,{ token:TOKEN }))
  const ri = await call('POST',`/search/${WS_ID}/reindex`,{ token:TOKEN, timeoutMs:30000 })
  good(ri) ? ok('POST /search/:ws/reindex') : (ri.status===503||ri.status===500 ? wrn(`reindex → ${ri.status} (Meilisearch may be unavailable)`) : bad(`reindex → ${ri.status} ${clip(ri.json)}`))

  // ═══ export (admin) ════════════════════════════════════════════════════════
  sec('export')
  adminWrite('GET …/export/json', await call('GET',`/workspaces/${WS_ID}/export/json`,{ token:TOKEN }))
  adminWrite('GET …/export/csv/tasks', await call('GET',`/workspaces/${WS_ID}/export/csv/tasks`,{ token:TOKEN }))

  // ═══ AI ════════════════════════════════════════════════════════════════════
  sec('ai (Claude-powered features)')
  const aiStatus = await call('GET','/ai/status',{ token:TOKEN })
  rep('GET /ai/status', aiStatus)
  const av = !!aiStatus.data?.available
  console.log(`  ${C.d}AI ${av?'is configured — running live generation calls':'is not configured — endpoints must answer 503'}${C.x}`)
  const aiCheck=(label,r)=>{ if(av){ good(r)?ok(label):bad(`${label} → ${r.status} ${clip(r.json)}`) } else { r.status===503?ok(`${label} — 503 (AI off, gated ✓)`):bad(`${label} → ${r.status} (expected 503) ${clip(r.json)}`) } }
  if (SKIP_AI && av) {
    skp('AI generation calls skipped (HC_SKIP_AI=1)')
  } else {
    aiCheck('POST /ai/task/generate', await call('POST','/ai/task/generate',{ token:TOKEN, body:{ prompt:'plan a launch' }, timeoutMs:40000 }))
    aiCheck('POST /ai/task/priority', await call('POST','/ai/task/priority',{ token:TOKEN, body:{ title:'Fix login bug' }, timeoutMs:40000 }))
    aiCheck('POST /ai/task/deadline', await call('POST','/ai/task/deadline',{ token:TOKEN, body:{ title:'Ship report' }, timeoutMs:40000 }))
    aiCheck('POST /ai/summarize', await call('POST','/ai/summarize',{ token:TOKEN, body:{ content:'A long status update about the project.' }, timeoutMs:40000 }))
    aiCheck('POST /ai/writing/improve', await call('POST','/ai/writing/improve',{ token:TOKEN, body:{ text:'we is shipping soon' }, timeoutMs:40000 }))
    aiCheck('POST /ai/meeting-notes', await call('POST','/ai/meeting-notes',{ token:TOKEN, body:{ notes:'Alice will fix the bug. Bob to write docs.' }, timeoutMs:40000 }))
    aiCheck('POST /ai/insights', await call('POST','/ai/insights',{ token:TOKEN, body:{ context:'10 tasks done, 3 overdue' }, timeoutMs:40000 }))
    aiCheck('POST /ai/dashboard/suggest-layout', await call('POST','/ai/dashboard/suggest-layout',{ token:TOKEN, body:{ availableWidgets:[{type:'tasks',label:'Tasks'}] }, timeoutMs:40000 }))
    aiCheck('POST /ai/chat (SSE)', await call('POST','/ai/chat',{ token:TOKEN, body:{ messages:[{ role:'user', content:'hi' }] }, timeoutMs:40000 }))
  }

  // ═══ announcements (admin) ═════════════════════════════════════════════════
  sec('announcements')
  rep('GET …/announcements/active', await call('GET',`/workspaces/${WS_ID}/announcements/active`,{ token:TOKEN }))
  adminWrite('GET …/announcements (admin list)', await call('GET',`/workspaces/${WS_ID}/announcements`,{ token:TOKEN }))
  {
    const an = await call('POST',`/workspaces/${WS_ID}/announcements`,{ token:TOKEN, body:{ title:'zz master announcement', body:'hello', tone:'info' } })
    if (adminWrite('POST …/announcements (admin)', an)) {
      const annId = an.data?.id
      onCleanup('announcement', ()=>call('DELETE',`/workspaces/${WS_ID}/announcements/${annId}`,{ token:TOKEN }))
      rep('POST …/announcements/:id/view', await call('POST',`/workspaces/${WS_ID}/announcements/${annId}/view`,{ token:TOKEN }))
      rep('POST …/announcements/:id/dismiss', await call('POST',`/workspaces/${WS_ID}/announcements/${annId}/dismiss`,{ token:TOKEN }))
      rep('PATCH …/announcements/:id', await call('PATCH',`/workspaces/${WS_ID}/announcements/${annId}`,{ token:TOKEN, body:{ title:'zz master announcement 2' } }))
    }
  }

  // ═══ security (2FA, API keys, audit) ═══════════════════════════════════════
  sec('security — 2FA / API keys / audit log')
  rep('GET /security/totp/status', await call('GET','/security/totp/status',{ token:TOKEN }))
  rep('GET …/api-keys', await call('GET',`/workspaces/${WS_ID}/api-keys`,{ token:TOKEN }))
  {
    const key = await call('POST',`/workspaces/${WS_ID}/api-keys`,{ token:TOKEN, body:{ name:'zz master key' } })
    if (adminWrite('POST …/api-keys (admin)', key)) {
      const keyId = key.data?.id ?? key.data?.apiKey?.id
      if (keyId) {
        rep('POST …/api-keys/:id/revoke', await call('POST',`/workspaces/${WS_ID}/api-keys/${keyId}/revoke`,{ token:TOKEN }))
        rep('DELETE …/api-keys/:id', await call('DELETE',`/workspaces/${WS_ID}/api-keys/${keyId}`,{ token:TOKEN }))
      }
    }
  }
  adminWrite('GET …/audit-logs (admin)', await call('GET',`/workspaces/${WS_ID}/audit-logs`,{ token:TOKEN }))

  sec('security-settings')
  rep('GET …/security-settings', await call('GET',`/workspaces/${WS_ID}/security-settings`,{ token:TOKEN }))
  adminWrite('PATCH …/security-settings (admin, idempotent)', await call('PATCH',`/workspaces/${WS_ID}/security-settings`,{ token:TOKEN, body:{} }))

  // ═══ SSO / SCIM (read-only) ════════════════════════════════════════════════
  sec('SSO / SCIM (enterprise auth)')
  adminWrite('GET …/sso (admin)', await call('GET',`/workspaces/${WS_ID}/sso`,{ token:TOKEN }))
  adminWrite('GET …/scim/tokens (admin)', await call('GET',`/workspaces/${WS_ID}/scim/tokens`,{ token:TOKEN }))
  rep('GET /scim/v2/ServiceProviderConfig', await call('GET','/scim/v2/ServiceProviderConfig',{ token:TOKEN }), [200,401])

  // ═══ integrations ══════════════════════════════════════════════════════════
  sec('integrations (connections / slack / clickup import)')
  rep('GET …/integrations/connections', await call('GET',`/workspaces/${WS_ID}/integrations/connections`,{ token:TOKEN }))
  rep('GET …/integrations/connections/providers', await call('GET',`/workspaces/${WS_ID}/integrations/connections/providers`,{ token:TOKEN }))
  rep('GET …/integrations/connections/providers/status', await call('GET',`/workspaces/${WS_ID}/integrations/connections/providers/status`,{ token:TOKEN }))
  rep('GET …/integrations/connections/access-requests', await call('GET',`/workspaces/${WS_ID}/integrations/connections/access-requests`,{ token:TOKEN }))
  rep('GET …/integrations/slack', await call('GET',`/workspaces/${WS_ID}/integrations/slack`,{ token:TOKEN }))
  // ClickUp CSV preview is non-destructive (counts rows, imports nothing)
  rep('POST …/import/clickup/preview', await call('POST',`/workspaces/${WS_ID}/import/clickup/preview`,{ token:TOKEN, body:{ csv:'Task Name,Status\nDesign homepage,todo\nWrite copy,in progress' } }))

  // ═══ feature-flags ═════════════════════════════════════════════════════════
  sec('feature-flags')
  rep('GET /feature-flags/resolved', await call('GET','/feature-flags/resolved',{ token:TOKEN }))
  adminWrite('GET /feature-flags/workspace/:ws (admin)', await call('GET',`/feature-flags/workspace/${WS_ID}`,{ token:TOKEN }))

  // ═══ invitations ═══════════════════════════════════════════════════════════
  sec('invitations')
  rep('GET /invitations/workspace/:ws (pending)', await call('GET',`/invitations/workspace/${WS_ID}`,{ token:TOKEN }))
  reach('GET /invitations/preview?token=bad', await call('GET','/invitations/preview?token=does-not-exist',{ token:TOKEN }), [400,404])
  // creating an invite sends a real email — probe wiring only (empty body → guard/validation)
  reach('POST /invitations (create — probe only)', await call('POST','/invitations',{ token:TOKEN, body:{} }), [400,403,404])

  // ═══ time-approvals ════════════════════════════════════════════════════════
  sec('time-approvals')
  rep('GET …/time-entries (workspace)', await call('GET',`/workspaces/${WS_ID}/time-entries`,{ token:TOKEN }))
  rep('GET …/time-approvals', await call('GET',`/workspaces/${WS_ID}/time-approvals`,{ token:TOKEN }))

  // ═══ email (test sender) ═══════════════════════════════════════════════════
  sec('email (transactional sender)')
  // /email/test is disabled in production (403) and would otherwise send a real
  // email — so we only probe that the route exists and is correctly guarded.
  reach('POST /email/test (probe — disabled in prod)', await call('POST','/email/test',{ body:{ to:'qa@example.com' } }), [400,403])

  // ═══ sample-data ═══════════════════════════════════════════════════════════
  sec('sample-data (demo seeder)')
  // Seeds ONLY into an empty workspace; on a real workspace it returns 409 and
  // changes nothing — which is exactly the safe outcome we assert here.
  {
    const sd = await call('POST',`/workspaces/${WS_ID}/sample-data/seed`,{ token:TOKEN, timeoutMs:30000 })
    if (sd.status===409) ok('POST …/sample-data/seed — 409 (workspace not empty, refused as designed) ✓')
    else if (good(sd)) wrn('sample-data seeded (workspace was empty) — demo data was added')
    else if (!IS_WS_ADMIN && sd.status===403) skp('sample-data seed — gated 403 (not admin) ✓')
    else bad(`sample-data seed → ${sd.status} ${clip(sd.json)}`)
  }

  // ═══ realtime gateway (websocket) ══════════════════════════════════════════
  sec('realtime (Socket.IO gateway)')
  const ws = await call('GET','/socket.io/?EIO=4&transport=polling',{ origin:true })
  ;(ws.status===200 && typeof ws.text==='string' && ws.text.startsWith('0'))
    ? ok('Socket.IO handshake responds (realtime gateway up)')
    : (ws.status===200 ? ok('Socket.IO endpoint responds (200)') : bad(`Socket.IO handshake → ${ws.status}`))
}

;(async()=>{ try{ await main() } catch(e){ bad(`fatal: ${e?.message||e}`) } finally { await runCleanups(); finish() } })()
NODE_EOF
RC=$?

printf "\n${C_C}${C_B}── Notes ──${C_X}\n"
cat <<TXT
  • This suite hit every backend module live. Anything marked "gated" needs an
    admin login; "reachable" probes routes whose real action has side-effects
    (sending email, importing data, seeding) and are intentionally not executed.
  • A leftover empty chat channel "zz-master-*" may remain (the API has no
    delete-channel endpoint). Everything else is cleaned up automatically.
  • Frontend-only behaviours still to eyeball in the app:
      – Member login hides "Settings"; /settings + /app/admin redirect away.
      – @-mentions dropdown in task descriptions & chat.
      – Header search box drives the command palette; Help opens /app/help.
      – Clip recording shows the correct duration; blocked capture shows an error.
TXT
exit $RC
