/**
 * THE CLIP LIBRARY SHOWS A WORKSPACE'S NEWEST CLIPS, AND SEARCH FINDS THEM, HOWEVER MANY THERE ARE.
 *
 * NOT A FRAME ROW: `found-23-sep/clip-library-lists-the-oldest-200`. Clips live
 * in storage, not in a table, and both readers asked the listing for one page
 * of 200. A listing answers in key order, and every clip key starts with the
 * moment it was made, so that page was the workspace's 200 OLDEST clips: from
 * the 201st on, a new clip appeared neither in the library nor in search. The
 * library then sorted its 200 newest first, which made the page look current.
 *
 * 1001 clips are uploaded the way the app uploads one (presign, then a PUT to
 * storage), which is more than one listing page of 1000: a reader that stops
 * after its first page cannot see the newest.
 *
 *   node test/e2e/clip-library.mjs --api 3021
 */
import { signInApi } from './lib/signin.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 2

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}
const CLIPS = 1001
const LISTED = 200

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const stamp = Date.now()
const TAG = `clb-${stamp}`
const NEWEST_WORD = `newest${stamp}`
let WS = null
let call = null
const keys = []

try {
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  call = async (route, init = {}) => {
    const res = await fetch(`${API}${route}`, { ...init, headers: { authorization: `Bearer ${auth.accessToken}`, ...(init.body ? { 'content-type': 'application/json' } : {}) }, body: init.body ? JSON.stringify(init.body) : undefined })
    return { status: res.status, data: (await res.json().catch(() => null))?.data }
  }
  const made = await call('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id

  console.log(`\n▶ ${CLIPS} clips, uploaded as the app uploads one`)
  for (let n = 1; n <= CLIPS; n += 1) {
    const fileName = n === CLIPS ? `${NEWEST_WORD}.webm` : `clip-${String(n).padStart(4, '0')}.webm`
    const presign = await call(`/workspaces/${WS}/clips/presign`, { method: 'POST', body: { fileName, contentType: 'video/webm', title: `${TAG} ${n}` } })
    if (presign.status >= 300 || !presign.data?.uploadUrl) {
      throw new Error(`clip ${n} could not be presigned: ${presign.status} — a lane needs its store for this suite`)
    }
    const put = await fetch(presign.data.uploadUrl, { method: 'PUT', body: Buffer.from(`clip ${n}`), headers: { 'content-type': 'video/webm' } })
    if (!put.ok) throw new Error(`clip ${n} was not stored: ${put.status}`)
    keys.push(presign.data.storageKey)
  }
  const newest = keys[keys.length - 1]
  const oldest = keys[0]

  // ══ 1. THE LIBRARY ═══════════════════════════════════════════════════════
  console.log('\n▶ the clip library')
  const library = await call(`/workspaces/${WS}/clips`)
  const listed = (library.data ?? []).map((c) => c.storageKey)
  chk(
    library.status === 200 && listed.length === LISTED && listed[0] === newest && !listed.includes(oldest),
    `with ${CLIPS} clips, the library lists the newest ${LISTED}, the newest first — not the oldest`,
    `${library.status}: ${listed.length} listed; the first is ${listed[0] === newest ? 'the newest' : JSON.stringify(listed[0] ?? null)}; ` +
      `the newest ${listed.includes(newest) ? 'is' : 'is NOT'} there, the oldest ${listed.includes(oldest) ? 'IS' : 'is not'}`,
  )

  // ══ 2. SEARCH ════════════════════════════════════════════════════════════
  console.log('\n▶ search, for the newest clip’s name')
  const search = await call(`/search/${WS}?q=${encodeURIComponent(NEWEST_WORD)}&types=file`)
  const hits = Array.isArray(search.data) ? search.data : (search.data?.hits ?? search.data?.results ?? [])
  chk(
    search.status === 200 && hits.some((h) => h.id === `file-${newest}`),
    'search finds the newest clip by its name',
    `${search.status}: ${hits.length} hit(s), ${JSON.stringify(hits.map((h) => h.id)).slice(0, 200)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  // The objects are storage's, not the workspace's: they go one by one. Gone,
  // or already gone (404), is fine; any other answer, or none, is said above
  // the totals.
  if (WS && call) {
    const takeBack = async (what, route, init) => {
      try {
        const res = await call(route, init)
        if (![200, 204, 404].includes(res.status)) console.log(`  cleanup left behind: ${what} answered ${res.status}`)
      } catch (err) {
        console.log(`  cleanup left behind: ${what} got no answer (${err?.message ?? err})`)
      }
    }
    for (const storageKey of keys) await takeBack(`clip ${storageKey}`, `/workspaces/${WS}/clips`, { method: 'DELETE', body: { storageKey } })
    await takeBack(`workspace ${WS}`, `/workspaces/${WS}`, { method: 'DELETE' })
  }
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
