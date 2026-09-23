/**
 * §V2-S05 — THE SCREEN-RECORD SETUP PANEL, frame `04:55`.
 *
 * The frame: source `Entire screen` · quality `1080p` · mic `Default –
 * Internal Microphone` · a red **Record Clip** button. Both of Rundesk's
 * recorders went straight to `getDisplayMedia({ video: true, audio: true })` on
 * the click — no say in what was captured, at what size, or through which
 * microphone.
 *
 * WHAT THIS SUITE IS REALLY FOR. A panel of dropdowns is the easiest facade in
 * this whole audit to build: three selects that remember their values and
 * change nothing about the recording. So every check here is about the
 * CONSTRAINTS that reach the browser. The fakes record what
 * `getDisplayMedia`/`getUserMedia` were asked for, and the assertions are
 * against that, never against the select's own value.
 *
 * AND WHAT CANNOT BE CHECKED, said plainly rather than faked: the browser's own
 * screen picker is not automatable and is not ours. `displaySurface` is a hint
 * that Chrome uses to pre-select a tab in that dialog, so the check is that the
 * hint is SENT — and the panel carries a line telling the person the browser
 * will still ask, which is checked too, because a source row that looks like a
 * control it is not is the thing being avoided.
 *
 * THE MIC IS A SECOND CAPTURE. `getDisplayMedia`'s audio is system audio, so a
 * screen recording with commentary needs `getUserMedia` as well and the tracks
 * joined. That is why one check counts BOTH calls: a panel offering a
 * microphone that never opens one is the same facade in a different coat.
 *
 *   node test/e2e/clip-setup.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil, readText } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 14

const REPO = path.resolve(import.meta.dirname, '../..')
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

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
 * The fakes. Installed with `addInitScript` so they are in place before the
 * app's first line, and RECORDING THE CONSTRAINTS — which is the whole point:
 * a dropdown that stores a value is not a dropdown that changes a recording.
 *
 * `enumerateDevices` returns two microphones plus a camera and a speaker, so
 * the picker has something real to filter and the "only audio inputs" claim
 * has something to be wrong about.
 */
const MEDIA_FAKES = `
window.__clip = { display: [], user: [], tracksAdded: 0 }

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
    addTrack: (t) => { window.__clip.tracksAdded += 1; tracks.push(t) },
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
        data: new Blob([new Uint8Array(8192)], { type: this.mimeType }),
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
    getDisplayMedia: async (c) => {
      window.__clip.display.push(JSON.parse(JSON.stringify(c ?? null)))
      return fakeStream(['video', 'audio'])
    },
    getUserMedia: async (c) => {
      window.__clip.user.push(JSON.parse(JSON.stringify(c ?? null)))
      return fakeStream(['audio'])
    },
    enumerateDevices: async () => ([
      { kind: 'audioinput', deviceId: 'default', label: 'Default – Internal Microphone' },
      { kind: 'audioinput', deviceId: 'headset-1', label: 'Studio Headset' },
      { kind: 'videoinput', deviceId: 'cam-1', label: 'FaceTime HD' },
      { kind: 'audiooutput', deviceId: 'spk-1', label: 'Speakers' },
    ]),
  },
})
`

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let sql = null
const TAG = `e2e-clipsetup-${Date.now()}`

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite seeds a task to comment on')

  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`
    insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  const [task] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Clip subject ${TAG}`}) returning id`

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  await ctx.addInitScript(MEDIA_FAKES)
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  const settleCookies = async () => {
    const accept = page.locator('button:has-text("Accept")').first()
    if (await accept.isVisible().catch(() => false)) await accept.click().catch(() => {})
  }
  await settleCookies()

  const openComposer = async () => {
    await page.goto(
      `${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${list.id}?task=${task.id}`,
      { waitUntil: 'domcontentloaded' },
    )
    await settleCookies()
    const tab = page.getByTestId('task-tab-comments')
    const ready = await waitUntil(() => tab.isVisible().catch(() => false), { timeoutMs: 25_000 })
    if (!ready) throw new Error('the task sheet never showed its Comments tab')
    await tab.click({ timeout: 25_000 })
    await settleCookies()
  }

  const asked = () => page.evaluate(() => window.__clip)

  await openComposer()

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `04:55` — the click opens a panel, it does not start recording')

  const clipButton = page.getByTestId('comment-record-clip')
  chk(
    await waitUntil(() => clipButton.isVisible().catch(() => false), { timeoutMs: 20_000 }),
    'the composer offers Record a Video Clip',
    'there is no clip button on the composer',
  )
  await clipButton.click({ timeout: 10_000 }).catch(() => {})
  chk(
    await waitUntil(() => page.getByTestId('clip-setup-panel').isVisible().catch(() => false), {
      timeoutMs: 15_000,
    }),
    'and pressing it shows the setup panel first',
    'the recording started with no chance to choose anything — the frame has a panel here',
  )
  /*
   * NOTHING CAPTURED YET. A panel that appears after the browser has already
   * been asked for the screen is decoration.
   */
  chk(
    (await asked()).display.length === 0,
    'and nothing has been captured while the panel is open',
    'the screen was already requested before the panel was answered',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ the three rows the frame shows')

  for (const [testid, name] of [
    ['clip-setup-source', 'source'],
    ['clip-setup-quality', 'quality'],
    ['clip-setup-mic', 'microphone'],
  ]) {
    chk(
      await page.getByTestId(testid).isVisible().catch(() => false),
      `the panel has a ${name} row`,
      `no ${name} row — the frame shows all three`,
    )
  }

  /*
   * THE MIC LIST IS THE DEVICE LIST, filtered. A picker that offered the camera
   * and the speakers would be listing whatever `enumerateDevices` returned.
   */
  const micText = await readText(page.getByTestId('clip-setup-mic'))
  chk(
    micText.includes('Studio Headset') && !micText.includes('FaceTime') && !micText.includes('Speakers'),
    'and the microphone row lists the real audio inputs, and only those',
    `the mic row reads "${micText.replace(/\n/g, ' | ')}" — it is not filtering the device list`,
  )

  /*
   * AND THE HONEST SENTENCE. Without it the source row reads as a control that
   * picks your screen, which it cannot be.
   */
  chk(
    (await readText(page.getByTestId('clip-setup-browser-note'))).trim().length > 0,
    'and it says the browser will still ask which screen to share',
    'the source row is presented as if it chose the screen itself',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ and the choices reach the browser as CONSTRAINTS')

  await page.getByTestId('clip-setup-quality').selectOption('720p')
  await page.getByTestId('clip-setup-source').selectOption('window')
  await page.getByTestId('clip-setup-mic').selectOption('headset-1')
  await page.getByTestId('clip-setup-record').click()

  const arrived = await waitUntil(async () => (await asked()).display.length === 1, {
    timeoutMs: 20_000,
  })
  chk(arrived, 'pressing Record Clip captures the screen', 'nothing was captured')

  const state = await asked()
  const video = state.display[0]?.video ?? {}
  chk(
    video?.height?.ideal === 720,
    'at the height that was chosen, not a hardcoded one',
    `it asked for ${JSON.stringify(video?.height)} after 720p was selected — the ` +
      'dropdown stores a value and changes nothing',
  )
  chk(
    video?.displaySurface === 'window',
    'and passes the source as the hint the browser understands',
    `displaySurface was ${JSON.stringify(video?.displaySurface)} after "A window" was selected`,
  )
  /*
   * THE SECOND CAPTURE. `getDisplayMedia` audio is SYSTEM audio, so a chosen
   * microphone means a `getUserMedia` too — and the track joined to the stream.
   */
  chk(
    state.user.length === 1 &&
      JSON.stringify(state.user[0]?.audio ?? {}).includes('headset-1'),
    'and opens the chosen microphone as its own capture',
    `getUserMedia was called ${state.user.length}× with ` +
      `${JSON.stringify(state.user[0]?.audio)} — a mic row that opens no mic records silence`,
  )
  chk(
    state.tracksAdded >= 1,
    'and joins that track to the recording',
    'the microphone was opened and never added to the stream — a silent clip either way',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ and the choice is remembered')

  /*
   * Read back from a FRESH LOAD rather than from the component: the point is
   * that the next recording starts where the last one left off.
   */
  await openComposer()
  await page.getByTestId('comment-record-clip').click({ timeout: 10_000 }).catch(() => {})
  const remembered = await waitUntil(async () => {
    if (!(await page.getByTestId('clip-setup-panel').isVisible().catch(() => false))) return false
    return (await page.getByTestId('clip-setup-quality').inputValue()) === '720p'
  }, { timeoutMs: 20_000 })
  chk(
    remembered,
    'a new recording opens on the setup that was used last',
    'the panel forgot the choice, so it has to be made again every time',
  )
} catch (err) {
  failed += 1
  const frame = String(err?.stack ?? '').split('\n').find((l) => l.includes('clip-setup.mjs'))
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err?.message ?? err, frame ? `\n  at ${frame.trim()}` : '')
} finally {
  if (sql) {
    await sql`delete from tasks where title like ${'%' + TAG}`.catch(() => {})
    await sql`delete from lists where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from projects where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from spaces where name like ${'%' + TAG}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  await browser.close().catch(() => {})
  stack?.close()
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
