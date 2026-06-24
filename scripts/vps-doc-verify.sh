#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Rundesk — doc-items live verifier.
#
# Verifies the items from Testing_Rundesk.docx + Bugs_.docx that the master test
# doesn't already cover at runtime — above all the REAL cause of "upload doesn't
# work" / "clip upload fails": the browser→R2 PUT is blocked unless the R2
# bucket has a CORS policy allowing the app origin. The API presign returns 200
# either way, so this script actually exercises the R2 object URL the way a
# browser would (CORS preflight + a real PUT) and tells you which is broken.
#
# Also covers: Personal List (B3), chat pin/save (B6), and — opt-in, because a
# workspace can't be deleted via API — multi-workspace-per-email (B1).
#
# Run on the VPS from the repo root (/opt/rundesk):
#     ./scripts/vps-doc-verify.sh
#     HC_EMAIL=you@x HC_PASSWORD=pw ./scripts/vps-doc-verify.sh
#
# Options:
#     HC_APP_ORIGIN=https://rundesk.theaura.agency   origin used for the CORS
#                    preflight (default: https://rundesk.theaura.agency)
#     HC_CREATE_WS=1 actually create a 2nd workspace to prove B1 (it cannot be
#                    auto-deleted; off by default to avoid clutter)
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
C_R=$'\033[31m'; C_G=$'\033[32m'; C_Y=$'\033[33m'; C_C=$'\033[36m'; C_B=$'\033[1m'; C_X=$'\033[0m'

[ -f deploy/docker-compose.prod.yml ] || { printf "${C_R}Run from the rundesk repo root (/opt/rundesk).${C_X}\n"; exit 1; }
[ "$(docker inspect -f '{{.State.Running}}' rundesk-api 2>/dev/null || echo no)" = "true" ] || { printf "${C_R}rundesk-api not running.${C_X}\n"; exit 1; }

EMAIL="${HC_EMAIL:-${1:-}}"; PASSWORD="${HC_PASSWORD:-${2:-}}"
if { [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; } && [ -t 0 ]; then
  printf "${C_C}${C_B}Rundesk doc-verify — login${C_X}\n  Email: "; read -r EMAIL
  [ -n "$EMAIL" ] && { printf "  Password: "; read -rs PASSWORD; printf "\n"; }
fi
[ -n "$EMAIL" ] && [ -n "$PASSWORD" ] || { printf "${C_R}A login is required.${C_X}\n"; exit 2; }

docker exec -i \
  -e HC_BASE="http://localhost:3001/api/v1" \
  -e HC_EMAIL="$EMAIL" -e HC_PASSWORD="$PASSWORD" \
  -e HC_APP_ORIGIN="${HC_APP_ORIGIN:-https://rundesk.theaura.agency}" \
  -e HC_CREATE_WS="${HC_CREATE_WS:-}" \
  rundesk-api node - <<'NODE_EOF'
const BASE = process.env.HC_BASE
const APP_ORIGIN = process.env.HC_APP_ORIGIN
const CREATE_WS = !!process.env.HC_CREATE_WS
const C = { r:'\x1b[31m', g:'\x1b[32m', y:'\x1b[33m', c:'\x1b[36m', b:'\x1b[1m', d:'\x1b[2m', x:'\x1b[0m' }
let pass=0, fail=0, warn=0, skip=0
const ok =(m)=>{pass++;console.log(`  ${C.g}✓${C.x} ${m}`)}
const bad=(m)=>{fail++;console.log(`  ${C.r}✗${C.x} ${m}`)}
const wrn=(m)=>{warn++;console.log(`  ${C.y}!${C.x} ${m}`)}
const skp=(m)=>{skip++;console.log(`  ${C.d}∘ ${m}${C.x}`)}
const sec=(m)=>console.log(`\n${C.c}${C.b}── ${m} ──${C.x}`)
const clip=(v)=>{try{return JSON.stringify(v).slice(0,200)}catch{return String(v).slice(0,200)}}
const good=(r)=>r.status>=200 && r.status<300

async function call(method, path, opts={}) {
  const { token, body, timeoutMs=20000 } = opts
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),timeoutMs)
  try {
    const headers={}; if(token) headers.Authorization=`Bearer ${token}`; if(body!==undefined) headers['Content-Type']='application/json'
    const res=await fetch(`${BASE}${path}`,{method,headers,body:body!==undefined?JSON.stringify(body):undefined,signal:ctrl.signal})
    const text=await res.text(); let json; try{json=JSON.parse(text)}catch{json=text}
    const data=json&&typeof json==='object'&&'data' in json?json.data:json
    return { status:res.status, json, data }
  } catch(e){ return { status:0, json:{error:e?.message||String(e)} } } finally { clearTimeout(t) }
}
// raw fetch to an absolute URL (the R2 presigned object URL), returning headers
async function raw(method, url, { headers={}, body, timeoutMs=20000 }={}) {
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),timeoutMs)
  try {
    const res=await fetch(url,{method,headers,body,signal:ctrl.signal})
    const h={}; res.headers.forEach((v,k)=>{h[k.toLowerCase()]=v})
    let text=''; try{text=await res.text()}catch{}
    return { status:res.status, headers:h, text }
  } catch(e){ return { status:0, headers:{}, text:e?.message||String(e) } } finally { clearTimeout(t) }
}

async function main() {
  sec('Login')
  const login = await call('POST','/auth/login',{ body:{ email:process.env.HC_EMAIL, password:process.env.HC_PASSWORD } })
  const token = login.data?.accessToken
  if (!token) { bad(`login → ${login.status} ${clip(login.json)}`); return }
  ok('logged in')
  const me = await call('GET','/auth/me',{ token })
  const userId = me.data?.id ?? me.data?.user?.id
  const workspaces = Array.isArray(login.data?.workspaces) ? login.data.workspaces : []
  const wsId = workspaces[0]?.id
  if (!wsId) { bad('no workspace on account'); return }
  ok(`workspace ${wsId} (you have ${workspaces.length} workspace(s))`)

  // ── B1: multiple workspaces per one email ──────────────────────────────────
  sec('B1 — multiple workspaces from one email')
  if (workspaces.length >= 2) {
    ok(`already a member of ${workspaces.length} workspaces — one email → many workspaces confirmed`)
  } else if (CREATE_WS) {
    const before = (await call('GET','/workspaces',{ token })).data?.length ?? workspaces.length
    const c = await call('POST','/workspaces',{ token, body:{ name:'zz QA second workspace (delete me)' } })
    if (good(c) && c.data?.id) {
      const after = (await call('GET','/workspaces',{ token })).data?.length ?? before
      after > before ? ok(`created a 2nd workspace as the same user (${before}→${after}) — B1 works`)
                     : bad(`created but count did not grow (${before}→${after})`)
      wrn('the test workspace cannot be auto-deleted (no delete-workspace API) — remove it in-app or via DB if unwanted')
    } else bad(`POST /workspaces → ${c.status} ${clip(c.json)}`)
  } else {
    skp('only 1 workspace and HC_CREATE_WS not set — POST /workspaces (in-app "New workspace") is wired; set HC_CREATE_WS=1 to create one live')
  }

  // ── B3: Personal List shows real tasks ──────────────────────────────────────
  sec('B3 — Personal List (My Work) holds real tasks')
  const pcreate = await call('POST',`/workspaces/${wsId}/personal-tasks`,{ token, body:{ title:'zz doc-verify personal task' } })
  if (good(pcreate) && pcreate.data?.id) {
    const list = await call('GET',`/workspaces/${wsId}/personal-tasks`,{ token })
    const present = Array.isArray(list.data) && list.data.some(t=>t.id===pcreate.data.id)
    present ? ok('personal task created and shows in the Personal List') : bad('created personal task not returned by list')
    await call('PATCH',`/personal-tasks/${pcreate.data.id}`,{ token, body:{ done:true } })
    const del = await call('DELETE',`/personal-tasks/${pcreate.data.id}`,{ token })
    good(del) ? ok('personal task toggled + removed (clean)') : wrn(`cleanup personal task → ${del.status}`)
  } else bad(`create personal task → ${pcreate.status} ${clip(pcreate.json)}`)

  // ── B6: per-message pin + save in chat ──────────────────────────────────────
  sec('B6 — chat message pin + save')
  const chans = await call('GET',`/workspaces/${wsId}/chat/channels`,{ token })
  const channelId = Array.isArray(chans.data) ? (chans.data.find(c=>c?.name==='general')?.id ?? chans.data[0]?.id) : null
  if (channelId) {
    const msg = await call('POST',`/chat/channels/${channelId}/messages`,{ token, body:{ body:'doc-verify pin/save probe' } })
    if (good(msg) && msg.data?.id) {
      const mid = msg.data.id
      const pin = await call('POST',`/chat/messages/${mid}/pin`,{ token })
      const sav = await call('POST',`/chat/messages/${mid}/save`,{ token })
      good(pin) ? ok('pin message → works') : bad(`pin → ${pin.status}`)
      good(sav) ? ok('save/star message → works') : bad(`save → ${sav.status}`)
      await call('DELETE',`/chat/messages/${mid}/pin`,{ token })
      await call('DELETE',`/chat/messages/${mid}/save`,{ token })
      const del = await call('DELETE',`/chat/messages/${mid}`,{ token })
      good(del) ? ok('probe message cleaned up') : wrn(`cleanup message → ${del.status}`)
    } else bad(`post chat message → ${msg.status} ${clip(msg.json)}`)
  } else wrn('no chat channel available to test pin/save')

  // ── B10 + T4: the REAL upload test — R2 bucket CORS for browser PUT ──────────
  sec('B10 / T4 — file & clip upload (R2 presign + browser CORS + real PUT)')
  const presign = await call('POST',`/workspaces/${wsId}/clips/presign`,{ token, body:{ fileName:'doc-verify-probe.webm', contentType:'video/webm' } })
  if (!(good(presign) && presign.data?.uploadUrl)) {
    bad(`clip presign → ${presign.status} ${clip(presign.json)} (R2 not configured at the API level — set R2_* env)`)
  } else {
    ok('API presign → 200 (R2 credentials configured)')
    const url = presign.data.uploadUrl
    const storageKey = presign.data.storageKey

    // 1) CORS preflight exactly like a browser would send before the PUT
    const pre = await raw('OPTIONS', url, { headers: {
      'Origin': APP_ORIGIN,
      'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'content-type',
    }})
    const acao = pre.headers['access-control-allow-origin']
    const allowsOrigin = acao === '*' || (acao && APP_ORIGIN.toLowerCase().startsWith(acao.toLowerCase().replace(/\/$/,'')))
    if (allowsOrigin) {
      ok(`R2 CORS preflight OK — Access-Control-Allow-Origin: ${acao} → browser uploads from ${APP_ORIGIN} will work`)
    } else {
      bad(`R2 CORS preflight returned NO Access-Control-Allow-Origin for ${APP_ORIGIN} (status ${pre.status}) → THIS is why "upload doesn't work" / "clip upload fails" in the browser`)
      console.log(`     ${C.y}Fix: add a CORS policy to the R2 bucket allowing this origin (see the report). Presign + server upload are fine; only the browser PUT is blocked.${C.x}`)
    }

    // 2) prove the credentialed upload path itself works (server-side PUT, no CORS)
    const put = await raw('PUT', url, { headers: { 'Content-Type':'video/webm' }, body: Buffer.from('doc-verify probe bytes') })
    if (put.status>=200 && put.status<300) {
      ok(`real PUT to the presigned URL → ${put.status} (the upload path itself works; credentials + signature valid)`)
      if (storageKey) { const d = await call('DELETE',`/workspaces/${wsId}/clips`,{ token, body:{ storageKey } }); good(d)?ok('probe object removed from R2 (clean)'):wrn(`cleanup R2 object → ${d.status}`) }
    } else {
      bad(`real PUT → ${put.status} ${String(put.text).slice(0,160)} (R2 rejected the upload — check bucket name / credentials / signature)`)
    }
  }

  sec('Result')
  const f=fail?C.r:C.d, w=warn?C.y:C.d
  console.log(`  ${C.g}${pass} passed${C.x}   ${f}${fail} failed${C.x}   ${w}${warn} warnings${C.x}   ${C.d}${skip} skipped${C.x}`)
  console.log(fail===0?`\n  ${C.g}${C.b}✅  doc-items verified${C.x}`:`\n  ${C.r}${C.b}❌  ${fail} need attention — see ✗ above${C.x}`)
  process.exit(fail>0?1:0)
}
;(async()=>{ try{ await main() } catch(e){ bad(`fatal: ${e?.message||e}`); console.log('\n  ❌'); process.exit(1) } })()
NODE_EOF