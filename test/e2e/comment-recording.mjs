/**
 * §V2-05 — recording into a task comment.
 *
 * `[04:14]`–`[04:45]` is a voice note left on a task; frame `04:16` is the
 * finished recording offering `Voice note` and `Transcribe`; frame `04:56`'s
 * "+" menu offers `Record a Video Clip`; frame `05:35` is that clip playing
 * inside the posted comment.
 *
 * THE CHECK THIS SUITE EXISTS FOR is the Urdu one. `[04:26]`:
 *
 *   "LEKIN ABHI YEH URDU KO HINDI MEIN LIKHTA HAI … back end se set down
 *   karni parti hai"
 *
 * — her complaint that ClickUp transcribes Urdu into Devanagari. Rundesk
 * transcribes in the browser, so the language is ours to set, and
 * `localeToSpeechLang` already maps `ur → ur-PK`. The way to lose that is to
 * transcribe in the composer by some route that does not go through it, which
 * would look identical from the outside. So this suite sets the ACCOUNT to
 * Urdu, records, and reads back the language the recognizer was actually
 * started with. A `hi-IN` there is her exact bug, reproduced in our product.
 *
 * HOW THE MEDIA IS FAKED, and what that costs. Headless Chromium has no
 * microphone, no screen to share and no speech service, so `MediaRecorder`,
 * `getUserMedia`/`getDisplayMedia` and `SpeechRecognition` are replaced before
 * the app loads. That means these checks do NOT prove Chrome can encode Opus —
 * they prove the composer asks for the right device, starts the recognizer in
 * the right language, packages what comes back into a file, and offers exactly
 * the choices the frame shows. The encoding is the browser's job; the wiring is
 * ours, and the wiring is what was missing.
 *
 * The API half is not faked at all: it runs against the real local stack, and
 * the emptiness rule is probed the way a caller would abuse it.
 *
 *   node test/e2e/comment-recording.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 33

const chromium = await resolveChromium()
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
 * The fakes. Installed with `addInitScript`, so they are in place before the
 * bundle's feature detection runs — `useSpeechRecognition` reads
 * `window.SpeechRecognition` once at mount and keeps the answer.
 *
 * Everything the page did is recorded on `window.__rec` so the checks can ask
 * what was requested rather than inferring it from what appeared on screen.
 */
const MEDIA_FAKES = `
window.__rec = { getUserMedia: 0, getDisplayMedia: 0, speechLang: null, mimeTypes: [] }

function fakeTrack(kind) {
  const listeners = {}
  return {
    kind,
    stop() {},
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn) },
    dispatch(name) { (listeners[name] || []).forEach((fn) => fn()) },
  }
}
function fakeStream(kinds) {
  const tracks = kinds.map(fakeTrack)
  return {
    id: 'fake',
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
    /*
     * V2-S05 — a clip now joins the chosen microphone's track to the display
     * stream, so the fake needs addTrack. WITHOUT IT the product's mix step
     * threw, was caught as "that microphone could not be used", and the clip
     * recorded anyway — so this suite would have gone on passing while
     * exercising the error path instead of the real one. A fake missing a
     * method the product calls does not fail; it quietly tests something else.
     *
     * (No backticks in here: this whole harness is a template literal, and the
     * first draft of this comment closed it.)
     */
    addTrack: (t) => tracks.push(t),
  }
}

class FakeMediaRecorder {
  static isTypeSupported(type) {
    // Whatever the composer asks for first, in both families — so the check is
    // about which family it asked for, not about this browser's codecs.
    return type === 'audio/webm;codecs=opus' || type === 'video/webm;codecs=vp9,opus'
  }
  constructor(stream, opts) {
    this.stream = stream
    this.mimeType = (opts && opts.mimeType) || 'audio/webm'
    this.state = 'inactive'
    window.__rec.mimeTypes.push(this.mimeType)
  }
  start() {
    this.state = 'recording'
    // A real recording's first chunk arrives after the timeslice; delivering it
    // immediately keeps a fast test from producing an empty Blob, which the
    // composer would (correctly) refuse as too short.
    setTimeout(() => {
      this.ondataavailable && this.ondataavailable({ data: new Blob([new Uint8Array(8192)], { type: this.mimeType }) })
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
    getUserMedia: async () => { window.__rec.getUserMedia += 1; return fakeStream(['audio']) },
    getDisplayMedia: async () => { window.__rec.getDisplayMedia += 1; return fakeStream(['video', 'audio']) },
  },
})

class FakeSpeechRecognition {
  constructor() { this.lang = '' }
  start() {
    // The whole point: record the language the app chose.
    window.__rec.speechLang = this.lang
    setTimeout(() => {
      this.onresult && this.onresult({
        resultIndex: 0,
        results: Object.assign([[{ transcript: 'SPOKEN WORDS' }]], { 0: Object.assign([{ transcript: 'SPOKEN WORDS' }], { isFinal: true }) }),
      })
    }, 0)
  }
  stop() { setTimeout(() => { this.onend && this.onend() }, 0) }
  abort() {}
}
window.SpeechRecognition = FakeSpeechRecognition
`

const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let restoreLocale = null
/** The tasks a cleanup DELETE could not remove, said above the totals. */
const leftBehind = []

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const me = (await A('/users/me')).data
  restoreLocale = me?.locale ?? 'en'
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  const stamp = Date.now()

  // This suite's own task, so nothing it posts lands on somebody's work.
  const spaces = (await A(`/spaces/workspace/${workspaceId}`)).data ?? []
  let spaceId = null, projectId = null, listId = null
  for (const s of spaces) {
    for (const p of (await A(`/projects/space/${s.id}`)).data ?? []) {
      const ls = (await A(`/lists/project/${p.id}`)).data ?? []
      if (ls[0]?.id) { spaceId = s.id; projectId = p.id; listId = ls[0].id; break }
    }
    if (listId) break
  }
  if (!listId) throw new Error('no list to make a task in')
  const task = (await A('/tasks', { method: 'POST', body: { listId, title: `Voice note check ${stamp}` } })).data
  if (!task?.id) throw new Error('could not make a task')
  const other = (await A('/tasks', { method: 'POST', body: { listId, title: `Other task ${stamp}` } })).data

  // ── The API: a comment may be wordless, but only if it carries a file ─────
  console.log('\n▶ §V2-05 — a comment can be nothing but a voice note')

  const empty = await A(`/tasks/${task.id}/comments`, { method: 'POST', body: { body: '' } })
  chk(
    empty.status >= 400 && empty.status < 500,
    'a comment with neither words nor a file is still refused',
    `POST with an empty body and no attachment returned ${empty.status} — blank comments would be postable`,
  )

  // A real attachment row, registered directly against this task's own prefix
  // — the same prefix the presigner signs, which `addAttachment` checks. The
  // presign and the upload are skipped: first because R2 was not configured
  // locally, and still, now that the lanes and CI run `s3-stub.mjs`, because
  // `addAttachment` registers a row without the object and the rule asked here
  // is the comment's, not the bytes'.
  const key = `workspaces/${workspaceId}/tasks/${task.id}/attachments/voice-note_${stamp}.webm`
  const voice = (await A(`/tasks/${task.id}/attachments`, {
    method: 'POST',
    body: { fileName: `voice-note_${stamp}.webm`, storageKey: key, contentType: 'audio/webm;codecs=opus', sizeBytes: 8192 },
  })).data
  chk(!!voice?.id, 'an audio attachment can be registered on the task',
    `registering the voice note returned ${JSON.stringify(voice)}`)

  const wordless = await A(`/tasks/${task.id}/comments`, {
    method: 'POST',
    body: { body: '', attachmentIds: [voice.id] },
  })
  chk(
    wordless.status === 200 || wordless.status === 201,
    'and a wordless comment carrying it is accepted',
    `POST with an empty body and a real voice note returned ${wordless.status} ${JSON.stringify(wordless.error)} — ` +
      'the mic would be a control that cannot post what it records',
  )

  /*
   * The abuse of the rule above. `attachmentIds` comes from the client, and the
   * linking step filters by task — so ids belonging to somebody else's task
   * link nothing. If the emptiness check trusted the ARRAY rather than what it
   * resolves to, this would post a blank comment with no files on it, and the
   * check would be decoration.
   */
  const foreign = (await A(`/tasks/${other.id}/attachments`, {
    method: 'POST',
    body: {
      fileName: 'elsewhere.webm',
      storageKey: `workspaces/${workspaceId}/tasks/${other.id}/attachments/elsewhere.webm`,
      contentType: 'audio/webm',
      sizeBytes: 4096,
    },
  })).data
  const smuggled = await A(`/tasks/${task.id}/comments`, {
    method: 'POST',
    body: { body: '   ', attachmentIds: [foreign.id] },
  })
  chk(
    smuggled.status >= 400 && smuggled.status < 500,
    "and naming another task's file does not buy an empty comment",
    `POST with a foreign attachment id returned ${smuggled.status} — the emptiness rule trusts the array, not the rows`,
  )

  // ── The @ picker's warning, frame `04:00` ────────────────────────────────
  console.log("\n\u25b6 \u00a7V2-05 frame `04:00` \u2014 \"Does not have access to task\"")

  /*
   * A real second person, with a password this suite knows, so the flag can be
   * checked against WHAT ACTUALLY HAPPENS rather than against itself. A warning
   * derived from the same reasoning it is being compared with proves nothing;
   * the point of these two agreement checks is that one answer comes from
   * `canReachTask` and the other from `ResourceMemberGuard` refusing a real
   * request, and they have to match.
   */
  const outsiderEmail = `outsider-${stamp}@rundesk.invalid`
  const outsiderPass = 'Outsider@123!'
  const registered = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: outsiderEmail, displayName: `Zoya Outsider ${stamp}`, password: outsiderPass }),
  })
  if (!registered.ok) throw new Error(`could not register the second person: ${registered.status}`)
  await A(`/workspaces/${workspaceId}/members`, { method: 'POST', body: { email: outsiderEmail, role: 'member' } })
  const outsiderId = ((await A(`/workspaces/${workspaceId}/members`)).data ?? [])
    .find((m) => m.email === outsiderEmail)?.userId
  if (!outsiderId) throw new Error('the second person did not join the workspace')

  const candidates = () => A(`/tasks/${task.id}/comments/mention-candidates`)
  let people = (await candidates()).data ?? []
  chk(
    people.length > 0 && people.every((p) => p.hasAccess),
    'on an ordinary task, nobody is flagged',
    `${people.filter((p) => !p.hasAccess).length} of ${people.length} were flagged on a task nobody is locked out of — ` +
      'a warning that fires for everyone is a warning nobody reads',
  )

  await A(`/tasks/${task.id}`, { method: 'PATCH', body: { visibility: 'private' } })
  people = (await candidates()).data ?? []
  const outsider = people.find((p) => p.userId === outsiderId)
  chk(
    outsider?.hasAccess === false,
    'making the task private flags the person who now cannot open it',
    `the picker still says they have access to a private task they did not create`,
  )
  chk(
    people.filter((p) => p.role === 'workspace_admin' || p.role === 'manager').every((p) => p.hasAccess),
    'and does not flag the admins, who can open anything',
    'an admin was flagged — the warning would appear beside the people most often mentioned',
  )

  /* AGREEMENT CHECK ONE: the flag said no; the guard must also say no. */
  const asOutsider = apiAs((await signInApi(API, outsiderEmail, outsiderPass)).accessToken)
  const refused = await asOutsider(`/tasks/${task.id}`)
  chk(
    refused.status === 403 || refused.status === 404,
    'and that flag is the truth — opening the task really is refused',
    `the picker warned that they cannot open it, and GET /tasks/:id returned ${refused.status} — ` +
      'one of the two is lying to somebody',
  )

  /* AGREEMENT CHECK TWO: the assignee clause, which is the subtle half. */
  await A(`/tasks/${task.id}/assignees`, { method: 'POST', body: { userId: outsiderId } })
  people = (await candidates()).data ?? []
  chk(
    people.find((p) => p.userId === outsiderId)?.hasAccess === true,
    'assigning them to it takes the warning away',
    'they are assigned to the task and the picker still says they cannot open it',
  )
  const allowed = await asOutsider(`/tasks/${task.id}`)
  chk(
    allowed.status === 200,
    'and that is the truth too — the task opens for them now',
    `the picker says they can open it and GET /tasks/:id returned ${allowed.status}`,
  )

  // Back to a task anyone can reach, so the composer checks below are not run
  // against a private one.
  const unassigned = await A(`/tasks/${task.id}/assignees/${outsiderId}`, { method: 'DELETE' })
  if (![200, 204, 404].includes(unassigned.status)) {
    throw new Error(`could not take the outsider off the task again, so the composer checks would run on a private task: DELETE answered ${unassigned.status}`)
  }

  const listed = (await A(`/tasks/${task.id}/comments`)).data ?? []
  const posted = listed.find((c) => (c.attachments ?? []).some((f) => f.id === voice.id))
  chk(
    !!posted && (posted.attachments ?? []).some((f) => (f.mimeType ?? '').startsWith('audio/')),
    'the voice note comes back on the comment as audio',
    `the comment's attachments were ${JSON.stringify(posted?.attachments ?? null)}`,
  )

  // ── The composer on screen ───────────────────────────────────────────────
  console.log('\n▶ the composer records, and offers what frame `04:16` offers')

  // The account is switched to Urdu BEFORE the page loads: the provider adopts
  // the server's preference over any local guess, so this is the real path.
  await A('/users/me', { method: 'PATCH', body: { locale: 'ur' } })

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await ctx.addInitScript(MEDIA_FAKES)
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(`${stack.base}/app/${workspaceId}/${spaceId}/${projectId}/${listId}?task=${task.id}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.getByTestId('task-tab-comments').click({ timeout: 20000 })

  /*
   * BEFORE THE RECORDING CHECKS: is the app even in Urdu?
   *
   * This is checked separately because it was broken, and broken in a way that
   * made the transcription check below fail while looking like a transcription
   * bug. The provider adopted the account's language only `if (accessToken)` —
   * a token the auth store deliberately stopped persisting when the session
   * moved to an httpOnly cookie. So the guard was false on every load and
   * nobody's saved language was ever applied, silently, in any language.
   *
   * Asserted on `<html lang>` rather than on any translated string: that is
   * what CSS and the browser read, and it is what `localeToSpeechLang` is
   * ultimately fed.
   */
  const inUrdu = await waitUntil(
    async () => (await page.evaluate(() => document.documentElement.lang)) === 'ur',
    { timeoutMs: 15_000 },
  )
  chk(
    inUrdu,
    "the account's saved language is the language the app speaks",
    `the account is set to Urdu and the page is in ${JSON.stringify(await page.evaluate(() => document.documentElement.lang))} — ` +
      'a saved language that is never applied is a preference that does nothing',
  )

  chk(
    await page.getByTestId('comment-record-voice').isVisible().catch(() => false),
    'the composer offers a voice note',
    'there is no mic in the comment composer — `[04:10]` records one from here',
  )
  chk(
    await page.getByTestId('comment-record-clip').isVisible().catch(() => false),
    'and Record a Video Clip, from frame `04:56`',
    'no clip control in the composer',
  )

  // Something typed first, so the transcript check below is about APPENDING
  // rather than about filling an empty box.
  await page.locator('textarea').first().fill('quick thought:')

  await page.getByTestId('comment-record-voice').click({ timeout: 8000 }).catch(() => {})
  const recording = await waitUntil(
    () => page.getByTestId('comment-recording-active').isVisible().catch(() => false),
    { timeoutMs: 10_000 },
  )
  chk(recording, 'clicking it starts a recording that says so',
    'nothing on screen changed — a mic that records invisibly is a mic nobody trusts')

  const asked = await page.evaluate(() => window.__rec)
  chk(
    asked.getUserMedia === 1 && asked.getDisplayMedia === 0,
    'a voice note asks for the microphone and not the screen',
    `it called getUserMedia ${asked.getUserMedia}× and getDisplayMedia ${asked.getDisplayMedia}×`,
  )

  /*
   * HER DEFECT, `[04:26]`. The account is in Urdu; the recognizer must have
   * been started in Urdu. `hi-IN` here is ClickUp's bug in our product.
   */
  const heardIn = await waitUntil(
    async () => (await page.evaluate(() => window.__rec.speechLang)) !== null,
    { timeoutMs: 10_000 },
  )
  const speechLang = await page.evaluate(() => window.__rec.speechLang)
  chk(heardIn, 'the recording is also being listened to', 'speech recognition never started')
  chk(
    speechLang === 'ur-PK',
    `an Urdu account is transcribed in Urdu — the recognizer was started in ${JSON.stringify(speechLang)}`,
    `the recognizer was started in ${JSON.stringify(speechLang)} — \`[04:26]\` is exactly this: ` +
      'Urdu going in and something else coming out',
  )

  await page.getByTestId('comment-recording-stop').click()
  const ready = await waitUntil(
    () => page.getByTestId('comment-recording-ready').isVisible().catch(() => false),
    { timeoutMs: 10_000 },
  )
  chk(ready, 'stopping leaves the finished recording on screen',
    'the recording vanished when it stopped')

  const choices = await page.locator('[data-testid="comment-recording-choices"] button').count()
  chk(
    choices === 2,
    'and it offers exactly two choices, as frame `04:16` does',
    `it offered ${choices} — "Insert as text" is the tooltip on Transcribe, not a third button`,
  )
  /*
   * Bounded and caught: this read opens the condition, so there is no `&&` in
   * front of it to short-circuit — a Transcribe button that is gone would wait
   * out the full thirty seconds and take every check below with it. null is
   * absence, and the `===` against the tooltip makes absence fail on its own.
   */
  const transcribeTooltip = await page.getByTestId('comment-recording-transcribe')
    .getAttribute('title', { timeout: 8000 }).catch(() => null)
  chk(
    transcribeTooltip === 'بطور متن داخل کریں',
    'with "Insert as text" as the tooltip on Transcribe',
    'Transcribe carries no tooltip — the frame shows one, and it is what explains the button',
  )
  /*
   * §M frame `04:42` — and the PAIR to it on the other button. The two
   * tooltips are what distinguish the choices: the same recording becomes an
   * audio file or becomes text. Asserted as a non-empty string that is not the
   * OTHER tooltip, so a copy-paste that gave both buttons the same words fails
   * here rather than reading as two working tooltips.
   */
  const attachTitle = await page
    .getByTestId('comment-recording-attach')
    .getAttribute('title', { timeout: 8000 })
    .catch(() => null)
  /*
   * Transcribe's tooltip is READ ONCE, twelve lines up, and reused here. It was
   * read a second time on its own line, unbounded — a Transcribe button the
   * check above is allowed to find absent, pressed for its attribute thirty
   * seconds later with nothing to short-circuit in front of it. The second read
   * also answered a question already on the page: two reads of one attribute
   * can disagree, and then the pair of checks disagree about the same button.
   */
  chk(
    !!attachTitle && attachTitle !== transcribeTooltip,
    'and "Attach as audio file" as the tooltip on the voice-note button',
    `the voice-note button's tooltip was ${JSON.stringify(attachTitle)} against Transcribe's ` +
      `${JSON.stringify(transcribeTooltip)} — absent means the frame's tooltip is missing, equal ` +
      'means both buttons claim to do the same thing',
  )
  chk(
    await page.getByTestId('comment-recording-preview').isVisible().catch(() => false),
    'and the recording can be played back before it is kept',
    'no player on the finished recording — the person cannot hear what they are about to send',
  )

  // Transcribe → the words land in the box, after what was already typed. The
  // press is bounded and swallowed because two checks in this file already say
  // Transcribe may be absent; unbounded it spends thirty seconds and ends the
  // section, where caught it lets `transcribed` below report the absence.
  await page.getByTestId('comment-recording-transcribe').click({ timeout: 8000 }).catch(() => {})
  const transcribed = await waitUntil(
    async () => (await page.locator('textarea').first().inputValue()).includes('SPOKEN WORDS'),
    { timeoutMs: 10_000 },
  )
  const boxText = await page.locator('textarea').first().inputValue()
  chk(transcribed, 'Transcribe puts the spoken words in the box',
    `the box says ${JSON.stringify(boxText)}`)
  chk(
    boxText.startsWith('quick thought:'),
    'without throwing away what was already typed',
    `the box says ${JSON.stringify(boxText)} — the typed half was discarded`,
  )

  // ── Voice note → an attachment, and a comment that needs no words ────────
  console.log('\n▶ Voice note attaches the audio instead')
  await page.locator('textarea').first().fill('')
  // Bounded to the same standard as the attach press below: the gates between
  // them already report rather than throw, so leaving these two bare left the
  // thirty seconds on the first control a patch removes.
  await page.getByTestId('comment-record-voice').click({ timeout: 8000 }).catch(() => {})
  await waitUntil(() => page.getByTestId('comment-recording-active').isVisible().catch(() => false), { timeoutMs: 10_000 })
  await page.getByTestId('comment-recording-stop').click({ timeout: 8000 }).catch(() => {})
  await waitUntil(() => page.getByTestId('comment-recording-ready').isVisible().catch(() => false), { timeoutMs: 10_000 })
  // Bounded and caught: what stands above it — a check, or a gate whose answer
  // nobody reads — is allowed to fail, so this has to report rather than throw.
  // Bounding one step and leaving the next unbounded only moves the thirty
  // seconds one line down (ledger §10).
  await page.getByTestId('comment-recording-attach').click({ timeout: 8000 }).catch(() => {})

  const attached = await waitUntil(
    async () => (await page.locator('text=/voice-note_.*\\.webm/').count()) > 0,
    { timeoutMs: 10_000 },
  )
  chk(attached, 'keeping it as a voice note attaches the recorded file',
    'no file appeared in the composer after choosing Voice note')
  /*
   * Bounded and caught: the read is first in the condition, so nothing
   * short-circuits it and a missing post button would burn thirty seconds and
   * silence every check after this one. null is absence — `=== true` makes it
   * fail, where a bare truthy would have let it through unexamined.
   */
  const postEnabled = await page.getByTestId('comment-post')
    .isEnabled({ timeout: 8000 }).catch(() => null)
  chk(
    postEnabled === true,
    'and the comment can be posted with no words at all',
    'the post button is disabled — the voice note of `[04:45]` could be recorded and never sent',
  )

  // ── The clip: the screen, and no Transcribe ──────────────────────────────
  console.log('\n▶ Record a Video Clip, frame `04:56`')
  await page.getByTestId('comment-recording-discard').click().catch(() => {})
  /*
   * §V2-S05 frame `04:55` — the clip button now opens a SETUP PANEL first
   * (source, quality, microphone) and its red Record Clip button starts the
   * capture. This suite used to click straight through to a recording, so it
   * went red the moment the panel arrived: `getDisplayMedia` was called 0×,
   * correctly, because nothing had been asked for yet.
   *
   * The check below is unchanged — a clip must still ask for the SCREEN — only
   * the path to it gained the step the frame shows. Weakening the check to
   * accommodate a UI change would have been the wrong repair; walking the new
   * path is the right one.
   */
  // Bounded: a check above is allowed to find this button absent, and the
  // `panelUp` throw below already says so in words. Unbounded the press spends
  // thirty seconds first and raises Playwright's message instead of that one.
  await page.getByTestId('comment-record-clip').click({ timeout: 8000 }).catch(() => {})
  const panelUp = await waitUntil(
    () => page.getByTestId('clip-setup-panel').isVisible().catch(() => false),
    { timeoutMs: 15_000 },
  )
  if (!panelUp) throw new Error('the clip button did not open the setup panel')
  /*
   * THE PRIVACY BANNER IS A FIXED OVERLAY along the bottom of the page, and
   * this suite never dismissed it because nothing it clicked used to sit down
   * there. The setup panel's Record button does, so the click timed out with
   * the button visible and enabled — `elementFromPoint` at its centre returned
   * the banner's paragraph, not the button.
   *
   * And it is dismissed BY TEST ID, not by text: this suite switches the
   * account to Urdu, so `button:has-text("Accept")` — the handle every other
   * suite uses — cannot match here. The banner's buttons were given ids for
   * exactly that reason.
   */
  const accept = page.getByTestId('cookie-accept')
  if (await accept.isVisible().catch(() => false)) await accept.click().catch(() => {})
  await page.getByTestId('clip-setup-record').click()
  await waitUntil(() => page.getByTestId('comment-recording-active').isVisible().catch(() => false), { timeoutMs: 10_000 })
  const clipAsked = await page.evaluate(() => window.__rec)
  chk(
    clipAsked.getDisplayMedia === 1,
    'a clip asks for the screen',
    `getDisplayMedia was called ${clipAsked.getDisplayMedia}× — a "video clip" that records only audio is a facade`,
  )
  await page.getByTestId('comment-recording-stop').click()
  await waitUntil(() => page.getByTestId('comment-recording-ready').isVisible().catch(() => false), { timeoutMs: 10_000 })
  chk(
    (await page.getByTestId('comment-recording-transcribe').count()) === 0,
    'and a clip is not offered a transcript it never listened for',
    'a clip offers Transcribe — it would insert whatever the last voice note said',
  )

  // ── A posted voice note plays where the comment is ───────────────────────
  console.log('\n▶ frame `04:45` — a posted voice note plays inside the comment')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('task-tab-comments').click({ timeout: 20000 })
  const plays = await waitUntil(
    async () => (await page.getByTestId('comment-audio').count()) > 0,
    { timeoutMs: 15_000 },
  )
  chk(
    plays,
    'the voice note renders as a player',
    'the voice note is a paperclip and a filename — nobody listens to those',
  )

  console.log('\n\u25b6 and the picker shows it, frame `04:00`')
  /*
   * Private again, and read in the browser. Typing "@Zoya" filters the picker
   * to the one person who cannot open this task, so the two checks below are
   * about the same row and not about whatever happened to be first.
   */
  await A(`/tasks/${task.id}`, { method: 'PATCH', body: { visibility: 'private' } })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('task-tab-comments').click({ timeout: 20000 })
  await page.locator('textarea').first().fill('@Zoya')
  const warned = await waitUntil(
    async () => (await page.getByTestId('mention-no-access').count()) > 0,
    { timeoutMs: 15_000 },
  )
  chk(
    warned,
    'the picker says so beside the person who cannot open it',
    'the picker offers them with no warning — the mention would notify somebody about a task they are refused',
  )
  const flagged = await page.locator('[data-testid="mention-candidate"][data-has-access="no"]').count()
  const rows = await page.getByTestId('mention-candidate').count()
  chk(
    flagged > 0 && flagged === rows,
    'and the flag belongs to that person, not to the list',
    `${flagged} of ${rows} rows were flagged — the warning is being drawn from something other than the person`,
  )

  for (const id of [task.id, other.id]) {
    const gone = await A(`/tasks/${id}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) leftBehind.push(`DELETE /tasks/${id} answered ${gone.status}`)
  }
} catch (e) {
  failed += 1
  /*
   * The first line of a Playwright timeout is "locator.click: Timeout 30000ms
   * exceeded." and says nothing about WHICH locator — the selector and the call
   * log are on the lines after it. Truncating to one line, which is what this
   * did, turns every such failure into a run that has to be repeated to learn
   * anything, so the selector line is kept.
   */
  const lines = e.message.split('\n')
  const where = lines.find((l) => l.includes('waiting for') || l.includes('getByTestId'))
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${lines[0]}${where ? `\n         ${where.trim()}` : ''}`)
} finally {
  // The account's language is this suite's to borrow, not to keep — every later
  // suite reads it, so a refused restore is this run's failure. Nothing read,
  // nothing borrowed.
  let restored = null
  if (restoreLocale) {
    try {
      const auth = await signInApi(API, ME.email, ME.password)
      restored = await apiAs(auth.accessToken)('/users/me', { method: 'PATCH', body: { locale: restoreLocale } })
    } catch (err) {
      restored = { status: `no answer (${String(err?.message ?? err).split('\n')[0]})` }
    }
  }
  chk(
    !restoreLocale || restored.status < 300,
    'and the account gets its own language back',
    `putting the locale back to ${JSON.stringify(restoreLocale)} answered ${restored?.status}`,
  )
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
