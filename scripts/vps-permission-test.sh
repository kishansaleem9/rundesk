#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Rundesk — live test for the "testing doc" wave (Admin-vs-Member permissions,
# task dates/priority on create, email-alias gating, upload/clip presign).
#
# This one needs TWO logins so it can verify member DENIALS, not just admin
# happy-paths. Run on the VPS from the repo root (/opt/rundesk):
#
#     ./scripts/vps-permission-test.sh
#
# It prompts for an ADMIN login and a MEMBER login (both must belong to the same
# workspace). Non-interactive:
#     HC_EMAIL=admin@x HC_PASSWORD=pw HC_MEMBER_EMAIL=member@x HC_MEMBER_PASSWORD=pw ./scripts/vps-permission-test.sh
#     ./scripts/vps-permission-test.sh admin@x adminpw member@x memberpw
#
# If no member login is given, the member-denial checks are skipped (the admin
# happy-paths still run). Everything created is cleaned up; non-zero on failure.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
C_R=$'\033[31m'; C_G=$'\033[32m'; C_Y=$'\033[33m'; C_C=$'\033[36m'; C_B=$'\033[1m'; C_X=$'\033[0m'
[ -f deploy/docker-compose.prod.yml ] || { printf "${C_R}Run from the rundesk repo root.${C_X}\n"; exit 1; }
[ "$(docker inspect -f '{{.State.Running}}' rundesk-api 2>/dev/null || echo no)" = "true" ] || { printf "${C_R}rundesk-api not running.${C_X}\n"; exit 1; }

EMAIL="${HC_EMAIL:-${1:-}}"; PASSWORD="${HC_PASSWORD:-${2:-}}"
MEMAIL="${HC_MEMBER_EMAIL:-${3:-}}"; MPASS="${HC_MEMBER_PASSWORD:-${4:-}}"
if { [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; } && [ -t 0 ]; then
  printf "${C_C}${C_B}Admin login${C_X}\n  Email: "; read -r EMAIL
  [ -n "$EMAIL" ] && { printf "  Password: "; read -rs PASSWORD; printf "\n"; }
fi
if { [ -z "$MEMAIL" ] || [ -z "$MPASS" ]; } && [ -t 0 ]; then
  printf "${C_C}${C_B}Member login${C_X} (Enter to skip member-denial checks)\n  Email: "; read -r MEMAIL
  [ -n "$MEMAIL" ] && { printf "  Password: "; read -rs MPASS; printf "\n"; }
fi
[ -n "$EMAIL" ] && [ -n "$PASSWORD" ] || { printf "${C_R}An admin login is required.${C_X}\n"; exit 2; }

docker exec -i \
  -e HC_BASE="http://localhost:3001/api/v1" \
  -e HC_EMAIL="$EMAIL" -e HC_PASSWORD="$PASSWORD" \
  -e HC_MEMBER_EMAIL="$MEMAIL" -e HC_MEMBER_PASSWORD="$MPASS" \
  rundesk-api node - <<'NODE_EOF'
const BASE = process.env.HC_BASE
const C = { r:'\x1b[31m', g:'\x1b[32m', y:'\x1b[33m', c:'\x1b[36m', b:'\x1b[1m', d:'\x1b[2m', x:'\x1b[0m' }
let pass=0, fail=0, warn=0, skip=0
const ok=(m)=>{pass++;console.log(`  ${C.g}✓${C.x} ${m}`)}
const bad=(m)=>{fail++;console.log(`  ${C.r}✗${C.x} ${m}`)}
const wrn=(m)=>{warn++;console.log(`  ${C.y}!${C.x} ${m}`)}
const skp=(m)=>{skip++;console.log(`  ${C.d}∘ ${m}${C.x}`)}
const sec=(m)=>console.log(`\n${C.c}${C.b}── ${m} ──${C.x}`)
const clip=(v)=>{try{return JSON.stringify(v).slice(0,180)}catch{return String(v).slice(0,180)}}

async function call(method, path, opts={}) {
  const { token, body, timeoutMs=20000 } = opts
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),timeoutMs)
  try {
    const headers={}; if(token) headers.Authorization=`Bearer ${token}`; if(body!==undefined) headers['Content-Type']='application/json'
    const res=await fetch(`${BASE}${path}`,{method,headers,body:body!==undefined?JSON.stringify(body):undefined,signal:ctrl.signal})
    const text=await res.text(); let json; try{json=JSON.parse(text)}catch{json=text}
    const data=json&&typeof json==='object'&&'data' in json?json.data:json
    return { status:res.status, json, data }
  } catch(e){ return { status:0, json:{error:e.message} } } finally { clearTimeout(t) }
}
const cleanups=[]
async function runCleanups(){ for(const c of cleanups.reverse()){ try{await c()}catch{} } }
function finish(){ sec('Result'); const f=fail?C.r:C.d,w=warn?C.y:C.d
  console.log(`  ${C.g}${pass} passed${C.x}   ${f}${fail} failed${C.x}   ${w}${warn} warnings${C.x}   ${C.d}${skip} skipped${C.x}`)
  console.log(fail===0?`\n  ${C.g}${C.b}✅  ALL CHECKS PASSED${C.x}`:`\n  ${C.r}${C.b}❌  ${fail} FAILED — see ✗ above${C.x}`)
  process.exit(fail>0?1:0)
}

async function login(email, password) {
  const r = await call('POST','/auth/login',{ body:{ email, password } })
  return { token: r.data?.accessToken, workspaces: Array.isArray(r.data?.workspaces)?r.data.workspaces:[], status:r.status, raw:r.json }
}

async function main() {
  sec('Logins')
  const admin = await login(process.env.HC_EMAIL, process.env.HC_PASSWORD)
  if (!admin.token) { bad(`admin login → ${admin.status} ${clip(admin.raw)}`); return }
  ok(`admin logged in (${admin.workspaces.length} workspace(s))`)
  const meAdmin = await call('GET','/auth/me',{ token: admin.token })
  const adminId = meAdmin.data?.id ?? meAdmin.data?.user?.id

  let member = null
  if (process.env.HC_MEMBER_EMAIL && process.env.HC_MEMBER_PASSWORD) {
    member = await login(process.env.HC_MEMBER_EMAIL, process.env.HC_MEMBER_PASSWORD)
    if (!member.token) { wrn(`member login failed (${member.status}) — member-denial checks skipped`); member=null }
    else ok(`member logged in (${member.workspaces.length} workspace(s))`)
  } else {
    wrn('no member login provided — member-denial checks skipped')
  }
  let memberId = null
  if (member) { const m = await call('GET','/auth/me',{ token: member.token }); memberId = m.data?.id ?? m.data?.user?.id }

  // Pick a workspace. For member checks, prefer one BOTH belong to.
  let wsId = admin.workspaces[0]?.id
  if (member) {
    const memberWsIds = new Set(member.workspaces.map(w=>w.id))
    const shared = admin.workspaces.find(w => memberWsIds.has(w.id))
    if (shared) wsId = shared.id
    else { wrn('admin and member share no workspace — invite the member; member-denial checks skipped'); member=null }
  }
  if (!wsId) { bad('admin has no workspace'); return }
  ok(`using workspace ${wsId}`)

  // Admin creates a container tree it owns.
  sec('Admin creates a space → project → list (admin = creator)')
  const sp = await call('POST','/spaces',{ token: admin.token, body:{ workspaceId: wsId, name:'perm-test space (auto)' } })
  const spaceId = sp.data?.id
  if (!spaceId) { bad(`create space → ${sp.status} ${clip(sp.json)}`); return }
  cleanups.push(()=>call('DELETE',`/spaces/${spaceId}`,{ token: admin.token }))
  const pr = await call('POST','/projects',{ token: admin.token, body:{ spaceId, name:'perm-test project (auto)' } })
  const projectId = pr.data?.id
  if (!projectId) { bad(`create project → ${pr.status} ${clip(pr.json)}`); return }
  cleanups.push(()=>call('DELETE',`/projects/${projectId}`,{ token: admin.token }))
  const li = await call('POST','/lists',{ token: admin.token, body:{ projectId, name:'perm-test list (auto)' } })
  const listId = li.data?.id
  if (!listId) { bad(`create list → ${li.status} ${clip(li.json)}`); return }
  cleanups.push(()=>call('DELETE',`/lists/${listId}`,{ token: admin.token }))
  ok('admin created space, project, list')

  // ── Member denials (the core permission fix) ─────────────────────────────
  if (member) {
    sec('Member CANNOT modify the admin\'s containers (403)')
    const tries = [
      ['PUT',  `/lists/${listId}`,   { name:'hacked' }, "update admin's list"],
      ['DELETE',`/lists/${listId}`,   undefined,         "delete admin's list"],
      ['PUT',  `/projects/${projectId}`, { name:'hacked' }, "update admin's project"],
      ['DELETE',`/projects/${projectId}`, undefined,       "delete admin's project"],
      ['PUT',  `/spaces/${spaceId}`,  { name:'hacked' }, "update admin's space"],
      ['DELETE',`/spaces/${spaceId}`, undefined,          "delete admin's space"],
    ]
    for (const [m,p,bdy,label] of tries) {
      const r = await call(m,p,{ token: member.token, body: bdy })
      r.status===403 ? ok(`${label} → 403 (blocked)`) : bad(`${label} → ${r.status} (expected 403) ${clip(r.json)}`)
    }

    sec('Member CAN manage a container they create')
    const own = await call('POST','/lists',{ token: member.token, body:{ projectId, name:'member-own list (auto)' } })
    const ownListId = own.data?.id
    if (own.status<300 && ownListId) {
      ok('member created their own list')
      const upd = await call('PUT',`/lists/${ownListId}`,{ token: member.token, body:{ name:'member-own renamed' } })
      upd.status<300 ? ok('member updated their own list') : bad(`member update own → ${upd.status}`)
      // Admin override: admin can delete the member's list
      const adel = await call('DELETE',`/lists/${ownListId}`,{ token: admin.token })
      adel.status<300 ? ok('admin can delete the member\'s list (admin override)') : bad(`admin delete member list → ${adel.status}`)
    } else bad(`member create own list → ${own.status} ${clip(own.json)} (is the member in this workspace?)`)

    sec('Member sees only their OWN time logs')
    const te = await call('GET',`/workspaces/${wsId}/time-entries`,{ token: member.token })
    if (te.status===200 && Array.isArray(te.data)) {
      const foreign = te.data.filter(r => r.userId && memberId && r.userId !== memberId)
      foreign.length===0 ? ok(`time-entries scoped to self (${te.data.length} rows, 0 foreign)`) : bad(`member saw ${foreign.length} other users' time entries`)
    } else bad(`member time-entries → ${te.status}`)

    sec('Member CANNOT manage the admin list\'s email alias (403)')
    const al = await call('POST',`/lists/${listId}/inbound-email`,{ token: member.token })
    al.status===403 ? ok(`member create alias on admin list → 403`) : bad(`member alias → ${al.status} (expected 403) ${clip(al.json)}`)
  } else {
    sec('Member-denial checks'); skp('skipped (no member login / no shared workspace)')
  }

  // ── Admin can manage own + email alias works for admin ───────────────────
  sec('Admin happy-paths')
  const aliasA = await call('POST',`/lists/${listId}/inbound-email`,{ token: admin.token })
  if (aliasA.status<300) {
    ok('admin can create the list email alias')
    const del = await call('DELETE',`/lists/${listId}/inbound-email`,{ token: admin.token })
    del.status<300 ? ok('admin can revoke the alias') : wrn(`admin revoke alias → ${del.status}`)
  } else wrn(`admin create alias → ${aliasA.status} ${clip(aliasA.json)}`)

  // ── Task create with dates + priority ─────────────────────────────────────
  sec('Create a task with Start/Due/Priority')
  const due = new Date(Date.now()+7*864e5).toISOString()
  const start = new Date().toISOString()
  const t = await call('POST','/tasks',{ token: admin.token, body:{ listId, title:'perm-test task (auto)', priority:'high', dueDate: due, startDate: start } })
  const taskId = t.data?.id
  if (taskId) {
    cleanups.push(()=>call('DELETE',`/tasks/${taskId}`,{ token: admin.token }))
    const g = await call('GET',`/tasks/${taskId}`,{ token: admin.token })
    const okPrio = g.data?.priority==='high'
    const okDue = !!g.data?.dueDate
    const okStart = !!g.data?.startDate
    okPrio && okDue && okStart ? ok('task persisted priority + due + start from creation') : bad(`task fields: priority=${g.data?.priority} due=${okDue} start=${okStart}`)
  } else bad(`create task with fields → ${t.status} ${clip(t.json)}`)

  // ── Upload / clip presign reachable (R2 config gate, not a 500) ───────────
  sec('Attachment / clip presign reachable (R2 config check)')
  if (taskId) {
    const ap = await call('POST',`/tasks/${taskId}/attachments/presign`,{ token: admin.token, body:{ fileName:'probe.png', contentType:'image/png' } })
    if (ap.status<300 && ap.data?.uploadUrl) ok('attachment presign → 200 (R2 configured)')
    else if (ap.status===400) wrn('attachment presign → 400 (R2 not configured — set R2 env + bucket CORS)')
    else bad(`attachment presign → ${ap.status} (expected 200 or clean 400, not 500) ${clip(ap.json)}`)
  }
  const cp = await call('POST',`/workspaces/${wsId}/clips/presign`,{ token: admin.token, body:{ fileName:'clip.webm', contentType:'video/webm' } })
  if (cp.status<300 && cp.data?.uploadUrl) ok('clip presign → 200 (R2 configured)')
  else if (cp.status===400) wrn('clip presign → 400 (R2 not configured — set R2 env + bucket CORS)')
  else bad(`clip presign → ${cp.status} (expected 200 or clean 400, not 500) ${clip(cp.json)}`)

  return finish()
}
;(async()=>{ try{ await main() } catch(e){ bad(`fatal: ${e?.message||e}`) } finally { await runCleanups(); finish() } })()
NODE_EOF
RC=$?

printf "\n${C_C}${C_B}── Frontend-only items (verify by eye in the app) ──${C_X}\n"
cat <<TXT
  • Member login: no "Settings" in the sidebar; /settings + /app/admin redirect away.
  • Sign-up / login: per-field inline validation errors as you type.
  • Task description: typing @ shows a member dropdown.
  • Help & support button opens the in-app /app/help page (not GitHub).
  • Header search box is typeable and drives the command palette.
  • Clips: stopping a recording shows correct duration; blocked screen-capture shows a clear error.
TXT
exit $RC
