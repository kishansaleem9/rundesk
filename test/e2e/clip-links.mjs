/**
 * A CLIP'S LINK IS THE CLIP'S, NOT A SIGNATURE THAT DIES (`resume-defects/resume-7`).
 *
 * The "Clip created!" card's Copy link and New tab, and the clips page's share
 * dialog, handed out the signed storage URL itself: a day from the card, an
 * hour from the dialog, and nothing on screen said so. Pasted into a chat or a
 * doc, the link stopped working the next day.
 *
 * ClickUp, from the help centre (web search excerpts; help.clickup.com is
 * blocked here): "anyone with the link to a Clip can access it"; "Clips are
 * shared publicly and do not require authentication. Clip URLs consist of an
 * unguessable, randomized string of characters"; "Clips are retained forever,
 * unless manually deleted". So a clip's link is `/clips/<token>` on the app,
 * the same one every time, and opening it signs the clip again. Anyone holding
 * it may watch — except where the workspace blocks public sharing, Rundesk's
 * own promise of no anonymous links, and there only its members may.
 *
 * AGAINST THE REAL API AND THE LANE'S REAL STORE, nothing stubbed: the card
 * records with the media fakes, uploads through the API's presign, and asks the
 * API for the link. "After the signing window" is measured by waiting one out:
 * the lanes and CI sign a clip's playback URL for seconds
 * (`CLIP_PLAYBACK_URL_SECONDS`), and the store stub refuses a URL past its
 * window as S3 does.
 *
 *   node test/e2e/clip-links.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil, readText } from './lib/wait.mjs'
import { storeBase, storeRequests } from './lib/store.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 20

const REPO = path.resolve(import.meta.dirname, '../..')
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const STORE = storeBase(API_PORT, argOf('--store', undefined))
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}
const PERSON_PASSWORD = 'Outsider@12345!'
/** The longest a signing window this suite will wait out. The lanes and CI sign for ten seconds. */
const LONGEST_WAIT_S = 60

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`);
 * like the copy, it answers status 0 when nothing answers. */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error ?? res.data ?? null).slice(0, 160)}`
/** The bytes a URL serves and its status; status 0 when nothing answered. */
const fetchBytes = async (url) => {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return { status: 0, bytes: null }
  const res = await fetch(url).catch(() => null)
  if (!res) return { status: 0, bytes: null }
  return { status: res.status, bytes: res.ok ? Buffer.from(await res.arrayBuffer()) : null }
}
/** When a presigned URL stops working: its X-Amz-Date plus X-Amz-Expires, in ms; null for any other URL. */
const windowEnd = (url) => {
  try {
    const q = new URL(url).searchParams
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(q.get('X-Amz-Date') ?? '')
    const seconds = Number(q.get('X-Amz-Expires'))
    if (!m || !Number.isFinite(seconds)) return null
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + seconds * 1000
  } catch {
    return null
  }
}
const TOKEN_LINK = (base) => new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/clips/([A-Za-z0-9_-]{32})$`)

/*
 * The card's media, as `clip-created-card` fakes it, plus a clipboard that
 * records what the app asked to copy and a `window.open` that records where it
 * went. Reading the real clipboard needs a permission the headless browser
 * does not grant reliably, and what matters is what the product ASKED to copy.
 */
const FAKES = `
window.__clip = { copied: [], opened: [] }
function fakeTrack(kind) {
  return { kind, stop() {}, addEventListener() {}, getSettings: () => ({}) }
}
function fakeStream(kinds) {
  const tracks = kinds.map(fakeTrack)
  return {
    id: 'fake',
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
    addTrack: (t) => tracks.push(t),
  }
}
class FakeMediaRecorder {
  static isTypeSupported(type) {
    return type === 'audio/webm;codecs=opus' || type === 'video/webm;codecs=vp9,opus'
  }
  constructor(stream, opts) {
    this.stream = stream
    this.mimeType = (opts && opts.mimeType) || 'video/webm'
    this.state = 'inactive'
  }
  start() {
    this.state = 'recording'
    setTimeout(() => {
      this.ondataavailable && this.ondataavailable({
        data: new Blob([new Uint8Array(16384)], { type: this.mimeType }),
      })
    }, 0)
  }
  stop() {
    this.state = 'inactive'
    setTimeout(() => { this.onstop && this.onstop() }, 0)
  }
}
window.MediaRecorder = FakeMediaRecorder
Object.defineProperty(navigator, 'mediaDevices', {
  configurable: true,
  value: {
    getDisplayMedia: async () => fakeStream(['video', 'audio']),
    getUserMedia: async () => fakeStream(['audio']),
    enumerateDevices: async () => ([
      { kind: 'audioinput', deviceId: 'default', label: 'Default – Internal Microphone' },
    ]),
  },
})
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: async (text) => { window.__clip.copied.push(text) } },
})
window.open = (url) => { window.__clip.opened.push(String(url)); return null }
`

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let sql = null
let A = null
const TAG = `e2e-cliplinks-${Date.now()}`
/** Made here and taken back in `finally`, each read by its status. */
const workspacesMade = []
const clipsMade = []
const leftBehind = []

try {
  const auth = await signInApi(API, ME.email, ME.password)
  A = apiAs(auth.accessToken)
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite reads back the link the server holds')

  /*
   * TWO WORKSPACES OF ITS OWN: one as every workspace starts, one that blocks
   * public sharing. The shared workspace is not touched, so no other suite's
   * sharing changes under it.
   */
  const makeWorkspace = async (name) => {
    const made = await A('/workspaces', { method: 'POST', body: { name } })
    if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace "${name}": ${said(made)}`)
    workspacesMade.push({ id: made.data.id, as: A })
    return made.data.id
  }
  const OPEN_WS = await makeWorkspace(`Clip links ${TAG}`)
  const BLOCKED_WS = await makeWorkspace(`Clip links blocked ${TAG}`)
  const blocked = await A(`/workspaces/${BLOCKED_WS}`, { method: 'PATCH', body: { blockPublicSharing: true } })
  if (blocked.status >= 300) throw new Error(`could not block public sharing: ${said(blocked)}`)

  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${OPEN_WS}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`
    insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  const [task] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Clip link subject ${TAG}`}) returning id`

  /*
   * PEOPLE WITH SESSIONS OF THEIR OWN. `POST /auth/register` answers with one,
   * and a personal workspace. The admin this suite signs in as is a platform
   * admin, whom the rule lets in as the workspace guard does, so the member who
   * watches a members-only clip is somebody who is a member and nothing more.
   */
  const register = async (label) => {
    const email = `clip-${label}-${Date.now()}@rundesk.invalid`
    const body = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, displayName: `${label} ${TAG}`, password: PERSON_PASSWORD }),
    }).then((r) => r.json(), () => null)
    const own = body?.data?.workspaces?.[0]?.id ?? null
    if (!body?.data?.accessToken || !own) throw new Error(`could not register the ${label}`)
    const as = apiAs(body.data.accessToken)
    workspacesMade.push({ id: own, as })
    return { email, as, own }
  }
  /* Somebody in another workspace. */
  const outsider = await register('outsider')
  const O = outsider.as
  const outsiderWs = outsider.own
  /* A member of the workspace that blocks public sharing. */
  const member = await register('member')
  const joined = await A(`/workspaces/${BLOCKED_WS}/members`, { method: 'POST', body: { email: member.email, role: 'member' } })
  if (joined.status >= 300) throw new Error(`could not add the member: ${said(joined)}`)

  /** Upload bytes as the app uploads a clip — presign, then a PUT — and answer with its key, or null. */
  const upload = async (workspaceId, bytes, title) => {
    const presign = await A(`/workspaces/${workspaceId}/clips/presign`, {
      method: 'POST', body: { fileName: `${title}.webm`, contentType: 'video/webm', title },
    })
    if (presign.status >= 300 || !presign.data?.uploadUrl) return null
    const put = await fetch(presign.data.uploadUrl, { method: 'PUT', body: bytes, headers: { 'content-type': 'video/webm' } })
      .then((r) => r.status, () => 0)
    if (put !== 200) return null
    clipsMade.push({ workspaceId, storageKey: presign.data.storageKey })
    return presign.data.storageKey
  }
  /** The link the API makes for a clip, or `{}`. */
  const linkOf = async (workspaceId, storageKey) =>
    storageKey ? ((await A(`/workspaces/${workspaceId}/clips/link`, { method: 'POST', body: { storageKey } })).data ?? {}) : {}
  /*
   * A clip's title as the library reads it, from the metadata its upload
   * carried. The lane's store kept none until 30 September, and there a clip
   * was called by its file name (`found-30-sep/store-stub-drops-object-metadata`).
   */
  const titleOf = async (workspaceId, storageKey) =>
    ((await A(`/workspaces/${workspaceId}/clips`)).data ?? []).find((c) => c.storageKey === storageKey)?.title ?? null

  // -------------------------------------------------------------------------
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block' })
  await ctx.addInitScript(FAKES)
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  const settle = async (p = page) => {
    const accept = p.getByTestId('cookie-accept')
    if (await accept.isVisible().catch(() => false)) await accept.click({ timeout: 5_000 }).catch(() => {})
  }
  await settle()

  /* Nobody signed in: a context with no session at all, as a link pasted to a stranger opens. */
  const strangerCtx = await browser.newContext({ viewport: { width: 1300, height: 900 }, serviceWorkers: 'block' })
  const stranger = await strangerCtx.newPage()

  /** The link page's state once it has settled: its title, its player's address, and which refusal it shows. */
  const openLink = async (p, url) => {
    await p.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await settle(p)
    await waitUntil(
      async () =>
        (await p.getByTestId('clip-link-player').getAttribute('src', { timeout: 500 }).catch(() => null)) ||
        (await p.getByTestId('clip-link-unavailable').isVisible().catch(() => false)) ||
        (await p.getByTestId('clip-link-sign-in').isVisible().catch(() => false)),
      { timeoutMs: 20_000 },
    )
    return {
      title: (await readText(p.getByTestId('clip-link-title').filter({ visible: true }), { timeoutMs: 1_000 })).trim(),
      src: await p.getByTestId('clip-link-player').filter({ visible: true }).getAttribute('src', { timeout: 1_000 }).catch(() => null),
      unavailable: await p.getByTestId('clip-link-unavailable').isVisible().catch(() => false),
      signIn: await p.getByTestId('clip-link-sign-in').isVisible().catch(() => false),
    }
  }

  // -------------------------------------------------------------------------
  console.log('\n▶ the card’s Copy link and New tab hand out the clip’s own link')

  await page.goto(`${stack.base}/app/${OPEN_WS}/${space.id}/${project.id}/${list.id}?task=${task.id}`, { waitUntil: 'domcontentloaded' })
  await settle()
  const tab = page.getByTestId('task-tab-comments')
  if (!(await waitUntil(() => tab.isVisible().catch(() => false), { timeoutMs: 25_000 }))) {
    throw new Error('the task sheet never showed its Comments tab')
  }
  await tab.click({ timeout: 25_000 })
  await settle()
  await page.getByTestId('comment-record-clip').click({ timeout: 15_000 })
  if (!(await waitUntil(() => page.getByTestId('clip-setup-panel').isVisible().catch(() => false), { timeoutMs: 15_000 }))) {
    throw new Error('the setup panel never opened')
  }
  await page.getByTestId('clip-setup-record').click({ timeout: 15_000 })
  if (!(await waitUntil(() => page.getByTestId('comment-recording-stop').isVisible().catch(() => false), { timeoutMs: 15_000 }))) {
    throw new Error('the recording never started')
  }
  await page.getByTestId('comment-recording-stop').click({ timeout: 15_000 })
  if (!(await waitUntil(() => page.getByTestId('clip-created-actions').isVisible().catch(() => false), { timeoutMs: 15_000 }))) {
    throw new Error('the finished clip never offered its actions')
  }

  const seq0 = (await storeRequests(STORE))?.seq ?? null
  await page.getByTestId('clip-created-copy').click({ timeout: 15_000 }).catch(() => {})
  await waitUntil(async () => (await page.evaluate(() => window.__clip.copied.length)) > 0, { timeoutMs: 20_000 })
  const clipboard = await page.evaluate(() => window.__clip)
  const copied = clipboard.copied[0] ?? ''
  const token = TOKEN_LINK(stack.base).exec(copied)?.[1] ?? null
  chk(
    token !== null && !/X-Amz-|:\d+\/rundesk-/.test(copied),
    'Copy link copies the clip’s own link — /clips/<token> on this site — with no storage address and no signature in it',
    `the clipboard got ${JSON.stringify(copied).slice(0, 200)}`,
  )

  // Read the moment it shows: a toast that is waited on can expire under the wait.
  let toastText = ''
  await waitUntil(async () => {
    toastText = await readText(page.locator('[data-sonner-toast]').filter({ visible: true }).first(), { timeoutMs: 500 })
    return /link copied/i.test(toastText)
  }, { timeoutMs: 10_000 })
  chk(
    /anyone with the link can watch it/i.test(toastText) && /does not expire/i.test(toastText),
    'and the toast says who can open it and that it does not expire',
    `the toast read ${JSON.stringify(toastText)}`,
  )

  await page.getByTestId('clip-created-copy').click({ timeout: 15_000 }).catch(() => {})
  await waitUntil(async () => (await page.evaluate(() => window.__clip.copied.length)) > 1, { timeoutMs: 20_000 })
  const copiedAgain = (await page.evaluate(() => window.__clip.copied))[1] ?? null
  chk(
    token !== null && copiedAgain === copied,
    'asked again, it is the same link: a second Copy link copies the very same address',
    `the second copy was ${JSON.stringify(copiedAgain)}, the first ${JSON.stringify(copied)}`,
  )

  await page.getByTestId('clip-created-newtab').click({ timeout: 15_000 }).catch(() => {})
  await waitUntil(async () => (await page.evaluate(() => window.__clip.opened.length)) > 0, { timeoutMs: 20_000 })
  const opened = await page.evaluate(() => window.__clip.opened)
  chk(
    token !== null && opened.length === 1 && opened[0] === copied,
    'New tab opens that same link',
    `it opened ${JSON.stringify(opened)}`,
  )

  const puts = seq0 === null ? [] : ((await storeRequests(STORE))?.requests ?? [])
    .filter((r) => r.n > seq0 && r.method === 'PUT' && r.key.startsWith(`workspaces/${OPEN_WS}/clips/`) && !r.copyOf)
  const uploadedKey = puts[0]?.key ?? null
  if (uploadedKey) clipsMade.push({ workspaceId: OPEN_WS, storageKey: uploadedKey })
  const rows = token ? await sql`select workspace_id, storage_key from clip_links where token = ${token}`.catch(() => []) : []
  chk(
    puts.length === 1 && rows.length === 1 && rows[0].storage_key === uploadedKey && rows[0].workspace_id === OPEN_WS,
    'and the link is the server’s, for the clip the card uploaded: one row, naming that clip in this workspace',
    `the store took ${puts.length} upload(s) (${JSON.stringify(uploadedKey)}); the link's row(s): ${JSON.stringify(rows).slice(0, 200)}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ the link opens for anyone holding it, and outlives every signature')

  const libraryTitle = await titleOf(OPEN_WS, uploadedKey)
  const first = await openLink(stranger, copied || `${stack.base}/clips/nothing`)
  const firstServed = await fetchBytes(first.src)
  chk(
    libraryTitle !== null && first.title === libraryTitle && firstServed.status === 200 && firstServed.bytes?.length === 16384,
    'anyone holding the link can open it, signed out, as ClickUp’s clips need no sign-in: the page shows the clip’s title, and its player’s address serves the recording',
    `signed out, the page showed ${JSON.stringify(first)} (the library calls it ${JSON.stringify(libraryTitle)}); ` +
      `its player's address answered ${firstServed.status} with ${firstServed.bytes?.length ?? 0} byte(s)`,
  )

  /*
   * A REAL RECORDING, so "plays" means the browser read a picture out of what
   * the link serves: the card's fakes upload zeros, which no player can open.
   * Recorded here by the browser's own MediaRecorder, from a canvas.
   */
  const webm = await stranger.evaluate(async () => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 48
      const g = canvas.getContext('2d')
      const recorder = new MediaRecorder(canvas.captureStream(10), { mimeType: 'video/webm' })
      const chunks = []
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
      const stopped = new Promise((resolve) => { recorder.onstop = resolve })
      recorder.start(100)
      let n = 0
      const paint = setInterval(() => { g.fillStyle = n++ % 2 ? '#c03' : '#03c'; g.fillRect(0, 0, 64, 48) }, 50)
      await new Promise((resolve) => setTimeout(resolve, 900))
      clearInterval(paint)
      recorder.stop()
      await stopped
      const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer())
      let s = ''
      for (const b of bytes) s += String.fromCharCode(b)
      return btoa(s)
    } catch {
      return ''
    }
  }).catch(() => '')
  const PLAYABLE_TITLE = `Playable ${TAG}`
  const playableKey = webm ? await upload(OPEN_WS, Buffer.from(webm, 'base64'), PLAYABLE_TITLE) : null
  const playable = await linkOf(OPEN_WS, playableKey)
  await openLink(stranger, playable.path ? `${stack.base}${playable.path}` : `${stack.base}/clips/nothing`)
  let picture = null
  await waitUntil(async () => {
    picture = await stranger.getByTestId('clip-link-player').evaluate((v) => ({ ready: v.readyState, width: v.videoWidth })).catch(() => null)
    return (picture?.ready ?? 0) >= 1 && (picture?.width ?? 0) > 0
  }, { timeoutMs: 15_000 })
  chk(
    (picture?.ready ?? 0) >= 1 && picture?.width === 64,
    'and the player plays it: a real recording, opened by its link, shows its picture',
    `recorded ${webm.length} base64 character(s); uploaded ${JSON.stringify(playableKey)}; link ${JSON.stringify(playable.path ?? null)}; the player read ${JSON.stringify(picture)}`,
  )

  /*
   * AFTER THE WINDOW. The first address was signed for a few seconds on this
   * lane; once its own X-Amz-Date and X-Amz-Expires say it has lapsed, the
   * store refuses it, and the link — the same one — signs a new address that
   * serves the recording.
   */
  const lapse = windowEnd(first.src)
  const waitMs = lapse === null ? 0 : lapse + 1_500 - Date.now()
  if (waitMs > 0 && waitMs <= LONGEST_WAIT_S * 1000) await new Promise((resolve) => setTimeout(resolve, waitMs))
  const lapsed = await fetchBytes(first.src)
  const again = await openLink(stranger, copied || `${stack.base}/clips/nothing`)
  const againServed = await fetchBytes(again.src)
  chk(
    lapse !== null && waitMs <= LONGEST_WAIT_S * 1000 && lapsed.status === 403 &&
      typeof again.src === 'string' && again.src !== first.src && againServed.status === 200 && againServed.bytes?.length === 16384,
    'and it still plays after the signing window: the store now refuses the address it was first signed to, and opening the link again signs a new one that serves the recording',
    lapse === null
      ? `the page's player had no signed address to wait out: ${JSON.stringify(first.src)}`
      : `the first address lapsed ${new Date(lapse).toISOString()}${waitMs > LONGEST_WAIT_S * 1000 ? ` — longer than ${LONGEST_WAIT_S}s away, so it was not waited for (the lane signs for seconds: CLIP_PLAYBACK_URL_SECONDS)` : ''}; ` +
        `afterwards it answered ${lapsed.status}; opened again, the player's address is ${again.src === first.src ? 'the same one' : JSON.stringify(again.src?.slice(0, 80) ?? null)}, answering ${againServed.status} with ${againServed.bytes?.length ?? 0} byte(s)`,
  )

  /*
   * AND A PAGE LEFT OPEN PAST THE WINDOW. A long clip paused past its
   * signature asks the store for the rest with an address the store now
   * refuses; the page signs again and carries on. Made to happen here: the
   * real recording's page is opened, its address left to lapse, and the player
   * asked to load again.
   */
  const held = await openLink(stranger, playable.path ? `${stack.base}${playable.path}` : `${stack.base}/clips/nothing`)
  const heldLapse = windowEnd(held.src)
  const heldWait = heldLapse === null ? 0 : heldLapse + 1_500 - Date.now()
  if (heldWait > 0 && heldWait <= LONGEST_WAIT_S * 1000) await new Promise((resolve) => setTimeout(resolve, heldWait))
  await stranger.getByTestId('clip-link-player').evaluate((v) => v.load(), undefined, { timeout: 5_000 }).catch(() => {})
  let resumed = null
  await waitUntil(async () => {
    resumed = await stranger.getByTestId('clip-link-player')
      .evaluate((v) => ({ src: v.getAttribute('src'), ready: v.readyState, width: v.videoWidth }), undefined, { timeout: 1_000 })
      .catch(() => null)
    return !!resumed && resumed.src !== held.src && resumed.ready >= 1 && resumed.width === 64
  }, { timeoutMs: 15_000 })
  const resumedServed = await fetchBytes(resumed?.src)
  chk(
    heldLapse !== null && heldWait <= LONGEST_WAIT_S * 1000 && typeof resumed?.src === 'string' && resumed.src !== held.src &&
      (resumed?.ready ?? 0) >= 1 && resumed?.width === 64 && resumedServed.status === 200,
    'and a page left open past the window signs again when its player asks for the clip: the player moves to a new address, and shows the picture',
    `the page's address lapsed ${heldLapse === null ? 'never' : new Date(heldLapse).toISOString()}; reloaded after it, the player read ${JSON.stringify(resumed)}; its address answered ${resumedServed.status}`,
  )

  const madeUp = randomBytes(24).toString('base64url')
  const guessed = await openLink(stranger, `${stack.base}/clips/${madeUp}`)
  const guessedApi = await apiAs(null)(`/public/clips/${madeUp}`)
  /*
   * EACH REFUSAL IS READ WITH ITS SENTENCE. Against the build before this, a
   * route that did not exist answered 404 "Cannot GET …", and a status alone
   * passed the refusals below with nothing refusing anything.
   */
  const notFound = (res) => res.status === 404 && res.error?.message === 'Clip not found' && !res.data?.url
  chk(
    guessed.unavailable && !guessed.src && notFound(guessedApi),
    'a link nobody was given is refused: a made-up token of the same shape shows the clip is not available, and the server signs nothing for it',
    `the page showed ${JSON.stringify(guessed)}; the API answered ${said(guessedApi)}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ who may make a link')

  const linksBefore = uploadedKey ? (await sql`select count(*)::int as n from clip_links where storage_key = ${uploadedKey}`.catch(() => [{ n: -1 }]))[0].n : -1
  const intoTheirs = await O(`/workspaces/${OPEN_WS}/clips/link`, { method: 'POST', body: { storageKey: uploadedKey } })
  const throughOwn = await O(`/workspaces/${outsiderWs}/clips/link`, { method: 'POST', body: { storageKey: uploadedKey } })
  const linksAfter = uploadedKey ? (await sql`select count(*)::int as n from clip_links where storage_key = ${uploadedKey}`.catch(() => [{ n: -1 }]))[0].n : -1
  chk(
    uploadedKey !== null && intoTheirs.status === 404 && intoTheirs.error?.message === 'Workspace not found' &&
      throughOwn.status === 400 && throughOwn.error?.message === 'Invalid clip key for workspace' &&
      !intoTheirs.data?.token && !throughOwn.data?.token && linksBefore === 1 && linksAfter === 1,
    'somebody from another workspace cannot get this workspace’s clip a link: refused at the workspace, and through their own workspace the key is not theirs',
    `asking this workspace answered ${said(intoTheirs)}; asking their own, ${said(throughOwn)}; the clip's link rows went ${linksBefore} → ${linksAfter}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ where the workspace blocks public sharing, only its members open the link')

  const closedKey = await upload(BLOCKED_WS, Buffer.from(`${TAG} — a members-only clip`), `Members only ${TAG}`)
  const closed = await linkOf(BLOCKED_WS, closedKey)
  const closedUrl = closed.path ? `${stack.base}${closed.path}` : `${stack.base}/clips/nothing`
  chk(
    typeof closed.token === 'string' && closed.audience === 'members',
    'the link of a clip in a workspace that blocks public sharing says it opens for members only',
    `the clip ${JSON.stringify(closedKey)} was given ${JSON.stringify(closed)}`,
  )

  const signedOut = await openLink(stranger, closedUrl)
  const signedOutApi = await apiAs(null)(`/public/clips/${closed.token ?? madeUp}`)
  chk(
    signedOut.signIn && !signedOut.src && !signedOut.title && signedOutApi.status === 401 && !signedOutApi.data?.url,
    'and somebody signed out who opens it is asked to sign in, and shown nothing of the clip',
    `the page showed ${JSON.stringify(signedOut)}; the API answered ${said(signedOutApi)}`,
  )

  const elsewhere = await O(`/public/clips/${closed.token ?? madeUp}`)
  chk(
    typeof closed.token === 'string' && notFound(elsewhere) && !elsewhere.data?.title,
    'and somebody from another workspace, signed in, is refused as though the link were not one, and nothing is signed',
    `the API answered them ${said(elsewhere)}`,
  )

  const closedTitle = await titleOf(BLOCKED_WS, closedKey)
  chk(
    closedTitle === `Members only ${TAG}`,
    'and the library calls the clip by the title it was recorded with — the store keeps a clip’s metadata, as S3 does',
    `the library calls it ${JSON.stringify(closedTitle)}`,
  )
  const memberCtx = await browser.newContext({ viewport: { width: 1300, height: 900 }, serviceWorkers: 'block' })
  const memberPage = await memberCtx.newPage()
  await memberPage.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await memberPage.fill('input[type=email]', member.email)
  await memberPage.fill('input[type=password]', PERSON_PASSWORD)
  await memberPage.click('button[type=submit]')
  await memberPage.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  const asMember = await openLink(memberPage, closedUrl)
  const memberServed = await fetchBytes(asMember.src)
  chk(
    closedTitle !== null && asMember.title === closedTitle && memberServed.status === 200 &&
      memberServed.bytes?.equals(Buffer.from(`${TAG} — a members-only clip`)) === true,
    'while a member of the workspace, signed in and nothing more, watches it',
    `the page showed ${JSON.stringify(asMember)} (the library calls it ${JSON.stringify(closedTitle)}); its player's address answered ${memberServed.status}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ the clips page’s share dialog')

  /** Open a clip's share dialog on the clips page, choose a mode, and ask. */
  const shareFromLibrary = async (workspaceId, storageKey, mode, email) => {
    const title = (await titleOf(workspaceId, storageKey)) ?? `no clip at ${storageKey}`
    await page.goto(`${stack.base}/app/${workspaceId}/clips`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await settle()
    const card = page.getByTestId('clip-card').filter({ hasText: title }).first()
    await waitUntil(() => card.isVisible().catch(() => false), { timeoutMs: 20_000 })
    await card.getByTestId('clip-card-share').click({ timeout: 15_000 }).catch(() => {})
    await page.getByTestId(`clip-share-mode-${mode}`).click({ timeout: 15_000 }).catch(() => {})
    if (email) await page.getByTestId('clip-share-email').fill(email, { timeout: 15_000 }).catch(() => {})
    await page.getByTestId('clip-share-generate').click({ timeout: 15_000 }).catch(() => {})
    await waitUntil(
      async () =>
        (await page.getByTestId('clip-share-link').isVisible().catch(() => false)) ||
        (await page.getByTestId('clip-share-error').isVisible().catch(() => false)),
      { timeoutMs: 15_000 },
    )
    return {
      link: (await readText(page.getByTestId('clip-share-link').filter({ visible: true }), { timeoutMs: 1_000 })).trim(),
      audience: (await readText(page.getByTestId('clip-share-audience').filter({ visible: true }), { timeoutMs: 1_000 })).trim(),
      error: (await readText(page.getByTestId('clip-share-error').filter({ visible: true }), { timeoutMs: 1_000 })).trim(),
    }
  }

  const dialog = await shareFromLibrary(OPEN_WS, playableKey, 'public')
  chk(
    typeof playable.path === 'string' && dialog.link === `${stack.base}${playable.path}`,
    'the clips page’s share dialog hands out the same link, on this site — not a storage URL',
    `the dialog showed ${JSON.stringify(dialog.link)}; the clip's link is ${JSON.stringify(playable.path ?? null)}`,
  )
  chk(
    /anyone with the link can watch it/i.test(dialog.audience) && /does not expire/i.test(dialog.audience),
    'and it says who can open it and that it does not expire',
    `beside the link it said ${JSON.stringify(dialog.audience)}`,
  )

  const closedDialog = await shareFromLibrary(BLOCKED_WS, closedKey, 'public')
  await page.getByTestId('clip-share-mode-external').click({ timeout: 15_000 }).catch(() => {})
  await page.getByTestId('clip-share-email').fill(`somebody-${Date.now()}@elsewhere.invalid`, { timeout: 15_000 }).catch(() => {})
  await page.getByTestId('clip-share-generate').click({ timeout: 15_000 }).catch(() => {})
  let refusal = ''
  await waitUntil(async () => {
    refusal = (await readText(page.getByTestId('clip-share-error').filter({ visible: true }), { timeoutMs: 500 })).trim()
    return refusal.length > 0
  }, { timeoutMs: 15_000 })
  chk(
    /only members of this workspace can watch it/i.test(closedDialog.audience) && /public sharing is disabled/i.test(refusal),
    'where public sharing is blocked, the dialog says only the workspace’s members can watch it, and a share by email to somebody outside is refused, saying why',
    `beside the link it said ${JSON.stringify(closedDialog.audience)}; the email share said ${JSON.stringify(refusal)}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ deleting the clip ends its link')

  const removed = uploadedKey
    ? await A(`/workspaces/${OPEN_WS}/clips`, { method: 'DELETE', body: { storageKey: uploadedKey } })
    : { status: 0 }
  const afterDelete = await openLink(stranger, copied || `${stack.base}/clips/nothing`)
  const afterDeleteApi = await apiAs(null)(`/public/clips/${token ?? madeUp}`)
  const rowsLeft = token ? await sql`select id from clip_links where token = ${token}`.catch(() => [{}]) : [{}]
  chk(
    removed.status < 300 && afterDelete.unavailable && !afterDelete.src && notFound(afterDeleteApi) && rowsLeft.length === 0,
    'deleting the clip ends its link: the page says it is not available, the server answers 404, and the link is gone with it',
    `delete answered ${removed.status}; the page showed ${JSON.stringify(afterDelete)}; the API answered ${said(afterDeleteApi)}; ${rowsLeft.length} row(s) left`,
  )
} catch (err) {
  failed += 1
  const frame = String(err?.stack ?? '').split('\n').find((l) => l.includes('clip-links.mjs'))
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err?.message ?? err, frame ? `\n  at ${frame.trim()}` : '')
} finally {
  // The clips are the store's, not a table's: each goes by its own DELETE. Gone,
  // or already gone (404), is fine; anything else is said above the totals.
  if (A) {
    for (const { workspaceId, storageKey } of clipsMade) {
      const gone = await A(`/workspaces/${workspaceId}/clips`, { method: 'DELETE', body: { storageKey } })
      if (![200, 204, 404].includes(gone.status)) leftBehind.push(`DELETE clip ${storageKey} answered ${gone.status}`)
    }
    for (const { id, as } of workspacesMade) {
      const gone = await as(`/workspaces/${id}`, { method: 'DELETE' })
      if (![200, 204, 404].includes(gone.status)) leftBehind.push(`DELETE workspace ${id} answered ${gone.status}`)
    }
  }
  if (sql) {
    await sql`delete from tasks where title like ${'%' + TAG}`.catch(() => {})
    await sql`delete from lists where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from projects where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from spaces where name like ${'%' + TAG}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  await browser.close().catch(() => {})
  stack?.close()
  for (const line of leftBehind) console.log(`  cleanup left behind: ${line}`)
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
