/**
 * §V2-S05b — THE "CLIP CREATED!" CARD, frames `05:25`–`05:30`.
 *
 * The frame: a card headed **Clip created!** with an inline player and
 * **Create a task · New tab · Copy link**, the last confirming **"Link
 * copied"**. Rundesk's composer offered a preview, Attach and Discard, and
 * nothing that produced a link.
 *
 * THE HONEST PROBLEM THIS ITEM HAS TO SOLVE. A just-recorded clip is a `Blob`
 * behind an object URL, private to the document that made it. Copying that
 * would put a link on the clipboard that works in one tab and nowhere else —
 * the neatest facade available in this whole audit, because it would even
 * paste. So two of the three actions must upload the clip first, and the card
 * does, lazily, on the first action that needs it.
 *
 * AND WHY PART OF THIS IS STUBBED, said plainly. Clip storage is R2, and R2 is
 * not configured in CI — presign answers `400 R2 is not configured` and share
 * answers `500 Storage is not configured`. IT IS CONFIGURED IN A LANE, since
 * `s3-stub.mjs`: both routes answer 201 there, which is why the guard below
 * accepts a 2xx and why the pending-clip check found a real defect rather than
 * an empty library. So the browser half stubs
 * presign, the PUT and share, which means these checks are about THIS CODE
 * calling the right things with the right arguments, and NOT about R2 working.
 *
 * THE GUARD THAT MAKES THAT STUB HONEST comes first, against the real API with
 * no browser involved: neither endpoint may answer 404, and the reason each
 * gives must be about storage. A 404 would mean the path or the method in the
 * stub is not the one the product serves — which is exactly how §V2-S14's
 * planner 404 survived two suites that stubbed the client's spelling of a route
 * the API never had. A stub is only evidence when the real thing answers at the
 * same address.
 *
 * (Pinning the status was this suite's own first mistake: it asserted 400 on
 * both and failed on share, which was perfectly real. The two disagree about
 * whether unconfigured storage is the caller's fault — noted, not fixed here.)
 *
 * AND ONE SECTION TURNS THE STUBS OFF. Create a task used to paste the share
 * link into the task's description (a URL signed for 24 hours), and this suite
 * asserted exactly that: it looked for the stub's URL in the description, so
 * the defect was the check. ClickUp's Create a task makes "a new task and
 * attach[es] the Clip". What that needs proved is a file on the task, in the
 * store, served when the task is read. So in that section presign and share
 * pass through to the API, the clip goes to the lane's real store, and the
 * suite reads back the row, the store's own request log and the bytes.
 *
 * Service workers are blocked: every check here that stubs a route depends on
 * the route seeing the request (`found-23-sep/routes-bypassed-by-the-service-worker`).
 *
 *   node test/e2e/clip-created-card.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil, readText } from './lib/wait.mjs'
import { storeBase, storeRequests } from './lib/store.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 26

const REPO = path.resolve(import.meta.dirname, '../..')
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

/** What the stub hands back, so the checks can look for exactly this. */
const SHARE_URL = 'https://storage.test/signed/clip.webm?sig=e2e'
const UPLOAD_URL = 'https://storage.test/put/clip.webm'

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  // The SENTENCE, then the reason. This printed `${bad ?? good}`, so a failing
  // check named only its reason and never itself — and for a check inside a
  // loop the reason is all a reader (or `check-break-reddened.mjs`) has to go
  // on. Seventy suites shared the line.
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` \u2014 ${bad}` : ''}`) }
}

const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

/*
 * Media fakes, plus a clipboard that records what the app tried to copy and a
 * `window.open` that records where it tried to go. Reading the real clipboard
 * needs a permission the headless browser will not grant reliably, and what
 * matters is what the product ASKED to copy.
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

const realOpen = window.open
window.open = (url) => { window.__clip.opened.push(String(url)); return null }
void realOpen
`

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let sql = null
const TAG = `e2e-clipcard-${Date.now()}`
/** Clips a cleanup could not take out of the library, said above the totals. */
const leftBehind = []

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite reads back a task the card created')

  // -------------------------------------------------------------------------
  console.log('\n▶ first: the endpoints the card calls are the ones the API serves')

  /*
   * BEFORE ANY STUB, and against the real API.
   *
   * WHAT THE GUARD ACTUALLY ASKS: not 404, and the reason it gave is about
   * storage. A 404 is the failure worth catching — it would mean the stub below
   * implements an address the product does not serve. Anything else proves the
   * route matched and the handler ran.
   *
   * The two do not even agree on a status: unconfigured, presign answers 400
   * "R2 is not configured" and share answers 500 "Storage is not configured",
   * for the same cause. Pinning either number was this check's own first
   * mistake — it failed on share while the endpoint was perfectly real.
   *
   * AND THEN IT HAD TO STOP REQUIRING THE FAILURE. Reading the error message
   * for the word "storage" is still pinning a number, one level up: it demands
   * that the call FAIL, and it does not fail any more. `s3-stub.mjs` gave every
   * lane a working store, both routes started answering 201, and the guard went
   * red against a product nobody had touched — a green that depended on the
   * environment being broken. A 2xx proves "the route matched and the handler
   * ran" better than any error does, so it is accepted here; the enemy this
   * guard was written against is still the 404, and that is still refused.
   */
  const servedByStorage = (res) =>
    res.status !== 404 && (res.status < 300 || /r2|storage/i.test(String(res.error?.message ?? '')))

  const presignReal = await A(`/workspaces/${workspaceId}/clips/presign`, {
    method: 'POST',
    body: { fileName: 'probe.webm', contentType: 'video/webm', title: 'probe' },
  })
  chk(
    servedByStorage(presignReal),
    `POST /clips/presign is served — ${presignReal.status} "${presignReal.error?.message}"`,
    `presign answered ${presignReal.status}: ${JSON.stringify(presignReal.error).slice(0, 120)} — ` +
      'a 404 means the stub below would implement a route the product does not have',
  )
  const shareReal = await A(`/workspaces/${workspaceId}/clips/share`, {
    method: 'POST',
    body: { storageKey: `workspaces/${workspaceId}/clips/probe.webm`, mode: 'public' },
  })
  chk(
    servedByStorage(shareReal),
    `and so is POST /clips/share — ${shareReal.status} "${shareReal.error?.message}"`,
    `share answered ${shareReal.status}: ${JSON.stringify(shareReal.error).slice(0, 120)}`,
  )

  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`
    insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  const [task] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Card subject ${TAG}`}) returning id`

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block' })
  await ctx.addInitScript(FAKES)

  /*
   * The storage backend, and only that, stood in for — except while
   * `realStore` is set, when presign and share go to the API as they are (the
   * Create a task section). Counted either way.
   */
  const calls = { presign: 0, share: 0, put: 0, presignBodies: [] }
  let realStore = false
  await ctx.route('**/clips/presign', async (route) => {
    calls.presign += 1
    calls.presignBodies.push(route.request().postDataJSON())
    if (realStore) return route.fallback().catch(() => {})
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ data: { uploadUrl: UPLOAD_URL, storageKey: `workspaces/${workspaceId}/clips/${TAG}.webm` }, error: null }),
    }).catch(() => {})
  })
  await ctx.route('**/clips/share', async (route) => {
    calls.share += 1
    if (realStore) return route.fallback().catch(() => {})
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ data: { shareUrl: SHARE_URL }, error: null }),
    }).catch(() => {})
  })
  /*
   * `failPut` exists because a break-test found this suite blind: making
   * `publishClip` ignore a failed PUT changed nothing, since the stub always
   * answered 200. A path that cannot fail is a path no check covers.
   */
  let failPut = false
  await ctx.route(`${UPLOAD_URL}*`, async (route) => {
    calls.put += 1
    if (failPut) {
      await route.fulfill({ status: 503, body: 'storage unavailable' })
      return
    }
    await route.fulfill({ status: 200, body: '' })
  })

  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  const settle = async () => {
    const accept = page.getByTestId('cookie-accept')
    if (await accept.isVisible().catch(() => false)) await accept.click().catch(() => {})
  }
  await settle()

  const openComposer = async () => {
    await page.goto(
      `${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${list.id}?task=${task.id}`,
      { waitUntil: 'domcontentloaded' },
    )
    await settle()
    const tab = page.getByTestId('task-tab-comments')
    const ready = await waitUntil(() => tab.isVisible().catch(() => false), { timeoutMs: 25_000 })
    if (!ready) throw new Error('the task sheet never showed its Comments tab')
    await tab.click({ timeout: 25_000 })
    await settle()
  }

  /** Record a clip through the setup panel and stop, leaving the card up. */
  const recordAClip = async () => {
    await page.getByTestId('comment-record-clip').click()
    const panel = await waitUntil(
      () => page.getByTestId('clip-setup-panel').isVisible().catch(() => false),
      { timeoutMs: 15_000 },
    )
    if (!panel) throw new Error('the setup panel never opened')
    await settle()
    await page.getByTestId('clip-setup-record').click()
    const live = await waitUntil(
      () => page.getByTestId('comment-recording-stop').isVisible().catch(() => false),
      { timeoutMs: 15_000 },
    )
    if (!live) throw new Error('the recording never started')
    await page.getByTestId('comment-recording-stop').click()
    const done = await waitUntil(
      () => page.getByTestId('comment-recording-ready').isVisible().catch(() => false),
      { timeoutMs: 15_000 },
    )
    if (!done) throw new Error('the finished recording never appeared')
  }

  await openComposer()
  await recordAClip()

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `05:25` — the card, and its three actions')

  chk(
    (await readText(page.getByTestId('clip-created-title'))).trim().length > 0,
    'the finished clip is headed with what just happened',
    'no "Clip created!" heading on the card',
  )
  for (const [testid, name] of [
    ['clip-created-task', 'Create a task'],
    ['clip-created-newtab', 'New tab'],
    ['clip-created-copy', 'Copy link'],
  ]) {
    chk(
      await page.getByTestId(testid).isVisible().catch(() => false),
      `and offers ${name}`,
      `no ${name} on the card — the frame has all three`,
    )
  }

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `05:30` — Copy link uploads, then copies, then says so')

  chk(calls.presign === 0, 'nothing was uploaded before anybody asked', 'the clip was uploaded on sight')

  await page.getByTestId('clip-created-copy').click()
  chk(
    await waitUntil(() => calls.presign === 1 && calls.put === 1, { timeoutMs: 20_000 }),
    'pressing it uploads the clip — once',
    `presign ${calls.presign}×, PUT ${calls.put}× — a link needs the clip somewhere real first`,
  )
  chk(
    (calls.presignBodies[0]?.contentType ?? '').startsWith('video/'),
    'as a video, not as whatever',
    `it asked to store ${JSON.stringify(calls.presignBodies[0]?.contentType)}`,
  )
  const copied = await waitUntil(async () => {
    const state = await page.evaluate(() => window.__clip)
    return state.copied.includes(SHARE_URL)
  }, { timeoutMs: 20_000 })
  chk(
    copied,
    'and puts the SHARED url on the clipboard, not the blob: one',
    `the clipboard got ${JSON.stringify((await page.evaluate(() => window.__clip)).copied)} — a ` +
      'blob: url works in this tab and nowhere else',
  )
  chk(
    await waitUntil(
      async () => (await readText(page.locator('[data-sonner-toast]').first())).length > 0,
      { timeoutMs: 10_000 },
    ),
    'and confirms it, as the frame does',
    'nothing told the person the link was copied',
  )

  /*
   * TWICE MUST NOT UPLOAD TWICE. The key is remembered, so a second link action
   * re-signs rather than re-uploading — otherwise pressing Copy link three
   * times sends the clip three times.
   */
  await page.getByTestId('clip-created-copy').click()
  await waitUntil(async () => (await page.evaluate(() => window.__clip)).copied.length >= 2, {
    timeoutMs: 20_000,
  })
  chk(
    calls.presign === 1 && calls.put === 1,
    'and a second Copy link re-signs rather than uploading again',
    `presign ${calls.presign}×, PUT ${calls.put}× after two copies — the clip is being re-sent`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ New tab')

  await page.getByTestId('clip-created-newtab').click()
  chk(
    await waitUntil(async () => {
      const state = await page.evaluate(() => window.__clip)
      return state.opened.includes(SHARE_URL)
    }, { timeoutMs: 20_000 }),
    'New tab opens the shared url',
    `it opened ${JSON.stringify((await page.evaluate(() => window.__clip)).opened)}`,
  )
  // Create a task is the section below, against the real store.

  // -------------------------------------------------------------------------
  console.log('\n▶ a SECOND clip is not the first clip')

  /*
   * The key is remembered so a second Copy link re-signs. That memory has to
   * be cleared when a new recording starts, or the clipboard hands out a link
   * to the PREVIOUS clip — the right kind of thing, silently, for the wrong
   * recording. Writing this check is what found that bug.
   */
  /*
   * DISCARD AND RE-RECORD IN THE SAME PAGE. The first version of this check
   * called `openComposer()` between the two clips, which is a full navigation:
   * it remounts the app and destroys the remembered key whether the product
   * clears it or not. So the check passed on the broken build — it was asking
   * about React state it had just thrown away. Break-testing found that.
   */
  const beforeSecond = calls.presign
  await page.getByTestId('comment-recording-discard').click()
  await waitUntil(
    () => page.getByTestId('comment-record-clip').isVisible().catch(() => false),
    { timeoutMs: 15_000 },
  )
  await recordAClip()
  await page.getByTestId('clip-created-copy').click()
  chk(
    await waitUntil(() => calls.presign === beforeSecond + 1, { timeoutMs: 20_000 }),
    'a newly recorded clip is uploaded on its own, not passed off as the last one',
    `presign went ${beforeSecond} → ${calls.presign} — the second clip reused the ` +
      "first one's key, so the link points at the wrong recording",
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ and an upload that fails says so')

  /*
   * The most dangerous failure here is a quiet one: a Copy link that reports
   * success and puts a link to nothing on the clipboard. The person finds out
   * when the colleague they sent it to says the video will not play.
   */
  failPut = true
  await openComposer()
  await recordAClip()
  const copiedBefore = (await page.evaluate(() => window.__clip)).copied.length
  await page.getByTestId('clip-created-copy').click()
  /*
   * NAMED, not merely present. The first version accepted ANY toast — and on
   * the build where a failed PUT was ignored, the toast that appeared was
   * "Link copied", so the check passed while the product was doing the exact
   * thing it was written to catch.
   */
  const toldOff = await waitUntil(
    async () => /could not be uploaded/i.test(await readText(page.locator('[data-sonner-toast]').first())),
    { timeoutMs: 20_000 },
  )
  chk(
    toldOff,
    'a failed upload is reported as a failure',
    `the toast read "${await readText(page.locator('[data-sonner-toast]').first())}" — a ` +
      'success message after a failed upload is worse than silence',
  )
  chk(
    (await page.evaluate(() => window.__clip)).copied.length === copiedBefore,
    'and nothing is put on the clipboard',
    'a link was copied for a clip that never finished uploading — the worst of both',
  )
  failPut = false

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `05:25` — Create a task attaches the clip (the real store)')

  /*
   * READ BACK FROM THE DATABASE AND THE STORE. A toast saying "Task created" is
   * the easiest thing in the world to show without creating one, and a link in
   * a description is the easiest thing to mistake for the clip.
   */
  realStore = true
  const STORE = storeBase(API_PORT, argOf('--store', undefined))
  const OWN_CLIPS = `workspaces/${workspaceId}/clips/`
  const uploadedClips = []
  const tasksInList = async () => (await sql`select id from tasks where list_id = ${list.id}`).map((r) => r.id)
  const newTaskSince = async (before) => (await tasksInList()).filter((id) => !before.has(id))

  await openComposer()
  await recordAClip()
  const tasksBefore = new Set(await tasksInList())
  const seq0 = (await storeRequests(STORE))?.seq ?? null
  await page.getByTestId('clip-created-task').click()
  let made = null
  await waitUntil(async () => {
    const fresh = await newTaskSince(tasksBefore)
    if (fresh.length !== 1) return false
    ;[made] = await sql`select id, title, description from tasks where id = ${fresh[0]}`
    return (await sql`select id from task_attachments where task_id = ${fresh[0]}`).length > 0
  }, { timeoutMs: 20_000 })

  chk(
    made != null && !/https?:\/\//i.test(made.description ?? ''),
    'Create a task makes a task in this list, with no link that can expire in its description',
    made ? `its description is ${JSON.stringify(made.description).slice(0, 140)}` : 'no task appeared in this list',
  )

  const ownPrefix = `workspaces/${workspaceId}/tasks/${made?.id}/attachments/`
  const attached = made
    ? await sql`select content_type, size_bytes, storage_key from task_attachments where task_id = ${made.id}`
    : []
  chk(
    attached.length === 1 && attached[0].storage_key.startsWith(ownPrefix) &&
      String(attached[0].content_type).startsWith('video/') && Number(attached[0].size_bytes) === 16384,
    'and the clip is attached to it: one file, under the task’s own prefix, with the recording’s type and size',
    `the task holds ${attached.length} attachment(s): ${JSON.stringify(attached).slice(0, 220)}`,
  )

  const after = seq0 === null ? null : (await storeRequests(STORE))?.requests.filter((r) => r.n > seq0) ?? null
  const clipPuts = (after ?? []).filter((r) => r.method === 'PUT' && r.key.startsWith(OWN_CLIPS) && !r.copyOf)
  const copies = (after ?? []).filter((r) => r.method === 'PUT' && r.copyOf)
  const reUploads = (after ?? []).filter((r) => r.method === 'PUT' && r.key.startsWith(ownPrefix) && !r.copyOf)
  uploadedClips.push(...clipPuts.map((r) => r.key))
  chk(
    clipPuts.length === 1 && copies.length === 1 && copies[0].copyOf === clipPuts[0].key &&
      copies[0].key === attached[0]?.storage_key && reUploads.length === 0,
    'copied inside the store from the clip the card uploaded — the recording is sent once',
    after === null
      ? `the store's request log could not be read at ${STORE}`
      : `after the press the store saw ${JSON.stringify(after.map((r) => [r.method, r.key.split('/').slice(-2).join('/'), r.copyOf ? 'copy' : '']).slice(0, 8))}`,
  )

  const listedOnTask = made ? (await A(`/tasks/${made.id}/attachments`)).data ?? [] : []
  const served = typeof listedOnTask[0]?.url === 'string'
    ? await fetch(listedOnTask[0].url).then(async (r) => (r.ok ? Buffer.from(await r.arrayBuffer()) : null), () => null)
    : null
  chk(
    served !== null && served.length === 16384,
    'and the task serves it: the attachment’s URL, signed when the task is read, returns the recording',
    `the task lists ${listedOnTask.length} attachment(s); its URL returned ${served === null ? 'nothing' : `${served.length} byte(s)`}`,
  )

  const library = (await A(`/workspaces/${workspaceId}/clips`)).data ?? []
  chk(
    clipPuts.length === 1 && library.some((c) => c.storageKey === clipPuts[0].key),
    'while the clip is kept in the workspace’s clips too, as ClickUp keeps every clip in its Clips Hub',
    `the library holds ${library.length} clip(s)${clipPuts.length === 1 ? ', not this one' : ''}`,
  )

  /*
   * AND AN ATTACH THAT FAILS SAYS SO. "Task created from the clip" over a task
   * with no clip on it would be the facade.
   *
   * THE FAILURE IS A MISSING CLIP, NOT AN ARRANGED STORE ERROR. The first
   * version armed the store's fail-next-put for the copy, and the attach
   * succeeded anyway: the AWS SDK retries a 500, and the retry went through,
   * as it would against a real bucket having a bad moment. A clip deleted
   * from the library between the upload and the press is not retried (the
   * API answers 404), and it is a thing that happens: the library is shared.
   */
  await openComposer()
  await recordAClip()
  const seq1 = (await storeRequests(STORE))?.seq ?? null
  await page.getByTestId('clip-created-copy').click()
  await waitUntil(async () => (await page.evaluate(() => window.__clip)).copied.length > 0, { timeoutMs: 20_000 })
  const firstUpload = seq1 === null ? [] : ((await storeRequests(STORE))?.requests ?? [])
    .filter((r) => r.n > seq1 && r.method === 'PUT' && r.key.startsWith(OWN_CLIPS) && !r.copyOf)
  const gone = firstUpload.length === 1
    ? await A(`/workspaces/${workspaceId}/clips`, { method: 'DELETE', body: { storageKey: firstUpload[0].key } })
    : { status: 0 }
  const removedFirst = firstUpload.length === 1 && gone.status < 300
  const tasksBeforeFailure = new Set(await tasksInList())
  await page.getByTestId('clip-created-task').click()
  const saidSo = await waitUntil(
    async () => (await page.locator('[data-sonner-toast]', { hasText: /could not be attached/i }).count()) > 0,
    { timeoutMs: 20_000 },
  )
  const failedTask = (await newTaskSince(tasksBeforeFailure))[0] ?? null
  const failedRows = failedTask ? await sql`select id from task_attachments where task_id = ${failedTask}` : []
  const toasts = await page.locator('[data-sonner-toast]').allInnerTexts().catch(() => [])
  chk(
    removedFirst && saidSo && failedRows.length === 0,
    'and when the attach fails, the card says the clip is not on the task — not "Task created"',
    `the clip was ${removedFirst ? 'removed from the library first' : `not removed first (${firstUpload.length} upload(s) seen, delete answered ${gone.status})`}; ` +
      `the toasts read ${JSON.stringify(toasts).slice(0, 200)}; the task holds ${failedRows.length} attachment(s)`,
  )
  // The clips this section put in the library go again, so the library a later
  // run reads is not this run's leftovers.
  for (const storageKey of uploadedClips) {
    const taken = await A(`/workspaces/${workspaceId}/clips`, { method: 'DELETE', body: { storageKey } })
    if (![200, 204, 404].includes(taken.status)) leftBehind.push(`DELETE clip ${storageKey} answered ${taken.status}`)
  }
  realStore = false

  // -------------------------------------------------------------------------
  console.log('\n▶ frames `05:35`–`05:40` — the clip in the comment')

  /*
   * THE ATTACHMENT IS SEEDED, not uploaded, and that is the point of this
   * section. Posting a comment with a file goes through R2, which is off here —
   * the first version of this check drove the composer, the post failed on the
   * upload, and it reported "the clip has no title" about a comment that was
   * never created. Frames `05:35`–`05:40` are about how a clip RENDERS once it
   * is on a comment; the upload path is the other half of this item and is
   * covered above.
   */
  const CLIP_NAME = `Stop Recording Guide ${TAG}.webm`
  const me = (await A('/users/me')).data
  const [posted] = await sql`
    insert into task_comments (task_id, author_id, body)
    values (${task.id}, ${me.id}, ${`clip comment ${TAG}`}) returning id`
  await sql`
    insert into task_attachments (task_id, comment_id, file_name, content_type, size_bytes, storage_key, uploaded_by_id)
    values (${task.id}, ${posted.id}, ${CLIP_NAME}, 'video/webm', 16384,
            ${`workspaces/${workspaceId}/clips/${TAG}.webm`}, ${me.id})`

  await openComposer()
  const cardUp = await waitUntil(
    async () => (await readText(page.getByTestId('comment-clip-title'))).includes('Stop Recording Guide'),
    { timeoutMs: 25_000 },
  )
  chk(
    cardUp,
    'a clip on a comment is a card with its name on it',
    `the clip card's title reads "${await readText(page.getByTestId('comment-clip-title'))}" — the ` +
      'frame heads the card with the clip name rather than captioning it underneath',
  )

  /*
   * AND THE DEAD LINK, WHICH HAD TO BE MADE OBSERVABLE FIRST.
   *
   * `kind` was `f.url ? presentationFor(...) : 'file'`, so a recording whose URL
   * had not resolved did not merely miss its player — it rendered
   * `<a href="#">`: a paperclip pointing nowhere, on a file still arriving.
   *
   * The first version of this check just counted `href="#"` anchors on the
   * page. It passed with the defect deliberately restored, because with R2 off
   * `url` comes back as the raw storage key — truthy — so nothing ever reached
   * that branch. It was asserting an absence in a scenario that could not
   * produce the thing. So a SECOND attachment is seeded with an empty storage
   * key, which is what a file still arriving looks like, and the check is a
   * positive one about what the person sees instead.
   *
   * AND IT THEN CAUGHT A REAL ONE, which is the whole argument for a check
   * shaped this way. With a store configured, `getObjectUrl('')` mints a
   * perfectly good presigned URL for an object that does not exist, so the
   * card stopped saying the clip was on its way and offered a link to nothing
   * — worse than the paperclip it replaced, because a dead link announces
   * itself and a signed URL to a missing object looks live until it is
   * pressed. Fixed in `tasks.service.ts`: no key, no url.
   */
  const PENDING_NAME = `Still arriving ${TAG}.webm`
  await sql`
    insert into task_attachments (task_id, comment_id, file_name, content_type, size_bytes, storage_key, uploaded_by_id)
    values (${task.id}, ${posted.id}, ${PENDING_NAME}, 'video/webm', 16384, '', ${me.id})`
  await openComposer()
  chk(
    await waitUntil(
      async () => (await readText(page.getByTestId('comment-clip-processing'))).includes('Still arriving'),
      { timeoutMs: 25_000 },
    ),
    'a clip still arriving says so, instead of being a paperclip to nowhere',
    `the pending clip renders as "${await readText(page.getByTestId('comment-clip-processing'))}"`,
  )
  const deadLinks = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a')).filter((a) => (a.getAttribute('href') ?? '') === '#').length,
  )
  chk(
    deadLinks === 0,
    'and nothing on the page is a link to "#"',
    `${deadLinks} anchors point at "#" — a control that does nothing when clicked`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ and a voice note gets none of it')

  /*
   * The card is a CLIP card. A voice note has no "open in a new tab" to offer,
   * and offering it would be three buttons that cannot do anything useful.
   */
  await openComposer()
  await page.getByTestId('comment-record-voice').click()
  const voiceLive = await waitUntil(
    () => page.getByTestId('comment-recording-stop').isVisible().catch(() => false),
    { timeoutMs: 15_000 },
  )
  if (!voiceLive) throw new Error('the voice recording never started')
  await page.getByTestId('comment-recording-stop').click()
  await waitUntil(() => page.getByTestId('comment-recording-ready').isVisible().catch(() => false), {
    timeoutMs: 15_000,
  })
  chk(
    !(await page.getByTestId('clip-created-actions').isVisible().catch(() => false)),
    'a finished voice note is not offered the clip card',
    'a voice note shows Create a task / New tab / Copy link, none of which suit it',
  )
} catch (err) {
  failed += 1
  const frame = String(err?.stack ?? '').split('\n').find((l) => l.includes('clip-created-card.mjs'))
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err?.message ?? err, frame ? `\n  at ${frame.trim()}` : '')
} finally {
  if (sql) {
    await sql`delete from tasks where list_id in (select id from lists where name like ${'%' + TAG})`.catch(() => {})
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
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
