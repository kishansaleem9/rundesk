/**
 * §V2-S02 / §V2-S04 / §V2-S05d — THE THREE AI SURFACES ON A TASK.
 *
 *   · the bar under the title, frame `01:20`:
 *     *"Ask Brain² for a presentation, document or prototype"*
 *   · "✦ Fill with AI" at the foot of the Task Types popover, frame `03:25`
 *   · the composer hint's OTHER HALF, frame `04:00`:
 *     *"Comment, press 'space' for AI, '/' for commands"*
 *
 * WHAT THIS SUITE IS REALLY FOR, and why its first three checks are about the
 * server rather than the screen.
 *
 * `ANTHROPIC_API_KEY` is empty here and in CI, so every one of these controls
 * ends in `assertAvailable` throwing *"AI features are not configured"*. That
 * is the honest state of this environment and the suite says so out loud rather
 * than letting green checks imply a working model — the same shape the clips
 * suite settled on for R2.
 *
 * It does mean the interesting question is not "did it work" but "did it REALLY
 * ASK, and did it tell the truth about the answer". So:
 *
 *   1. each endpoint is called directly first. None may answer **404** — a
 *      control wired to a route that does not exist would refuse identically
 *      from the browser, and "awaiting a call that silently 404s" is the first
 *      vacuous check in this audit's list.
 *   2. the MESSAGE is asserted, never the status alone. 503 is produced by
 *      several things in this codebase; `all-exceptions.filter.ts` and a
 *      service guard can raise the same code for different reasons, and a check
 *      that reads only the number cannot tell a refusal from an outage.
 *   3. the browser checks capture the REQUEST and assert the body that went
 *      out, then assert the SERVER'S sentence came back to the surface.
 *   4. and one check asserts that a refused draft left **no doc behind**. A
 *      half-run that writes the container and fails on the contents is this
 *      audit's mirror defect: a row in the database standing as evidence for a
 *      feature that did not run.
 *
 *   node test/e2e/task-ai-bar.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 18

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

/* `apiClient` never throws — it resolves `{status, data, error}`, so a
 * `.catch()` on it is inert. Every call is judged on `status` AND on what the
 * body actually said. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error, message: json?.message ?? json?.error?.message }
}

/** Everything the server said, flattened, so a message can be looked for in it. */
const said = (r) => JSON.stringify({ e: r.error, m: r.message, d: r.data } ?? {}).toLowerCase()

/**
 * The AI refusal, as this environment produces it. Anything else — a 404, a
 * 500, a 200 — means the control is pointed somewhere other than where this
 * suite thinks, and every check downstream would be measuring the wrong thing.
 */
const REFUSAL = 'not configured'

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let sql = null

const TAG = `e2e-aibar-${Date.now()}`

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  if (!workspaceId) throw new Error('no workspace')

  const space = (await A('/spaces', { method: 'POST', body: { workspaceId, name: `Space ${TAG}` } })).data
  const project = (await A('/projects', { method: 'POST', body: { spaceId: space.id, name: `Project ${TAG}` } })).data
  const list = (await A('/lists', { method: 'POST', body: { projectId: project.id, name: `List ${TAG}` } })).data
  const task = (await A('/tasks', {
    method: 'POST',
    body: { listId: list.id, title: `Subject ${TAG}`, description: 'Kick-off notes from the vendor call.' },
  })).data
  if (!task?.id) throw new Error('could not make a task')

  // -------------------------------------------------------------------------
  console.log('\n▶ the three endpoints these controls use: present, and refusing for a reason they name')

  const summarize = await A('/ai/summarize', { method: 'POST', body: { taskId: task.id, type: 'task', workspaceId } })
  chk(
    summarize.status !== 404 && summarize.status === 503 && said(summarize).includes(REFUSAL),
    `POST /ai/summarize answers ${summarize.status} "AI features are not configured" — the route exists and says why it will not run`,
    summarize.status === 404
      ? 'POST /ai/summarize answered 404 — the AI bar would be wired to a route that is not there, and a control that ' +
        'silently 404s refuses exactly like one that is merely switched off'
      : `it answered ${summarize.status} saying ${said(summarize).slice(0, 120)} — expected a 503 naming the configuration`,
  )

  const generate = await A('/ai/task/generate', {
    method: 'POST',
    body: { prompt: 'x', workspaceId, customFields: [{ name: 'Task type', type: 'dropdown', options: ['Task'] }] },
  })
  chk(
    generate.status !== 404 && generate.status === 503 && said(generate).includes(REFUSAL),
    `POST /ai/task/generate answers ${generate.status} with the same named reason — the channel "Fill with AI" classifies over`,
    generate.status === 404
      ? 'POST /ai/task/generate answered 404 — "Fill with AI" would have nothing behind it at all'
      : `it answered ${generate.status} saying ${said(generate).slice(0, 120)}`,
  )

  const improve = await A('/ai/writing/improve', { method: 'POST', body: { text: 'x', mode: 'expand', workspaceId } })
  chk(
    improve.status !== 404 && improve.status === 503 && said(improve).includes(REFUSAL),
    `POST /ai/writing/improve answers ${improve.status}, named — THE HOOK THE COMPOSER'S HINT WAS SAID NOT TO HAVE`,
    improve.status === 404
      ? 'POST /ai/writing/improve answered 404 — then the comment in task-detail-sheet.tsx was right and the hint ' +
        'should go back to being half a hint'
      : `it answered ${improve.status} saying ${said(improve).slice(0, 120)}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ the bar under the title, frame `01:20`')

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await ctx.newPage()
  /* Every request the page makes, so "it really asked" is a measurement rather
   * than an inference from what got rendered. */
  const requests = []
  page.on('request', (r) => {
    let body = null
    try { body = r.postData() } catch { body = null }
    requests.push({ url: r.url(), method: r.method(), body })
  })

  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  const settleCookies = async () => {
    const accept = page.getByTestId('cookie-accept').first()
    if (await accept.isVisible().catch(() => false)) { await accept.click().catch(() => {}); return }
    const fallback = page.locator('button:has-text("Accept")').first()
    if (await fallback.isVisible().catch(() => false)) await fallback.click().catch(() => {})
  }
  await settleCookies()
  await page.goto(
    `${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${list.id}?task=${task.id}`,
    { waitUntil: 'domcontentloaded' },
  )
  await settleCookies()
  if (!(await waitUntil(() => page.getByTestId('task-tab-overview').isVisible().catch(() => false), { timeoutMs: 25_000 }))) {
    throw new Error('the task sheet never mounted')
  }

  const bar = page.getByTestId('task-ai-bar')
  const offers = page.locator('[data-testid^="task-ai-bar-"][data-available]')
  const offerIds = await offers.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-testid').replace('task-ai-bar-', '')),
  )
  chk(
    (await bar.isVisible().catch(() => false)) && offerIds.join(',') === 'presentation,document,prototype',
    'the bar draws the frame\'s three offers, in the frame\'s order — presentation, document, prototype',
    `the bar offered [${offerIds.join(', ') || 'nothing'}]`,
  )

  const available = await offers.evaluateAll((els) =>
    els.filter((el) => el.getAttribute('data-available') === 'yes')
      .map((el) => el.getAttribute('data-testid').replace('task-ai-bar-', '')),
  )
  chk(
    available.length === 1 && available[0] === 'document',
    'exactly one of the three is offered for real, and it is the one Rundesk can make: a doc',
    `${available.length} of them are live (${available.join(', ') || 'none'}) — a presentation or a prototype that ` +
      'presses is an offer nothing behind this product can honour',
  )

  /*
   * Two reasons, not one shared sentence. "There is no slide deck to save" and
   * "nothing generates a prototype" send a reader to different places, and the
   * §0 clips guard caught the same flattening on its own author.
   */
  const reasons = await page.locator('[data-testid^="task-ai-bar-reason-"]').allTextContents()
  chk(
    reasons.length === 2 && reasons[0].trim().length > 0 && reasons[0].trim() !== reasons[1].trim(),
    'and the two it cannot make each print their OWN reason on the surface',
    reasons.length !== 2
      ? `${reasons.length} reasons are printed for 2 unavailable offers`
      : 'both unavailable offers print the same sentence — one reason for two different absences',
  )

  const docsBefore = (await A(`/workspaces/${workspaceId}/docs`)).data ?? []

  requests.length = 0
  await page.getByTestId('task-ai-bar-document').click()
  const note = page.getByTestId('task-ai-bar-note')
  const noted = await waitUntil(() => note.isVisible().catch(() => false), { timeoutMs: 25_000 })

  const summarizeCalls = requests.filter((r) => r.method === 'POST' && r.url.includes('/ai/summarize'))
  chk(
    summarizeCalls.length > 0 && summarizeCalls.every((r) => (r.body ?? '').includes(task.id)),
    `pressing "document" sent ${summarizeCalls.length} POST to /ai/summarize carrying this task's id`,
    summarizeCalls.length === 0
      ? 'nothing was requested at all — the bar is a label, which is the facade this row exists to prevent'
      : 'the request went out without the task id, so the draft could not be about this task',
  )

  const noteText = noted ? ((await note.textContent()) ?? '') : ''
  chk(
    noted && (await note.getAttribute('data-kind')) === 'error' && noteText.toLowerCase().includes(REFUSAL),
    'and the bar reports the SERVER\'S own sentence — "not configured", not a house "something went wrong"',
    noted
      ? `the bar said "${noteText.trim().slice(0, 90)}" — flattening a named configuration problem into a generic one ` +
        'makes an outage read as a bug in the button'
      : 'the bar said nothing at all: a press, a spinner, and silence',
  )

  const docsAfter = (await A(`/workspaces/${workspaceId}/docs`)).data ?? []
  chk(
    docsAfter.length === docsBefore.length && !docsAfter.some((d) => (d.title ?? '').includes(TAG)),
    `a refused draft left NO doc behind (${docsBefore.length} before, ${docsAfter.length} after)`,
    `the workspace gained ${docsAfter.length - docsBefore.length} doc(s) from a draft that never ran — an empty ` +
      'container in the database is evidence for a feature that did not happen',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ "Fill with AI" at the foot of the task-type picker, frame `03:25`')

  const types = (await A(`/workspaces/${workspaceId}/task-types`)).data ?? []
  if (types.length === 0) throw new Error('this workspace seeds no task types, so the picker renders nothing')
  const typeBefore = (await A(`/tasks/${task.id}`)).data?.taskTypeId ?? null

  chk(
    await page.getByTestId('task-type-fill-ai').isVisible().catch(() => false),
    'the button sits beside the type picker, where the frame puts it',
    'no "Fill with AI" control on the task type picker',
  )

  requests.length = 0
  await page.getByTestId('task-type-fill-ai').click()
  const genCalls = await waitUntil(
    () => requests.filter((r) => r.method === 'POST' && r.url.includes('/ai/task/generate')).length > 0,
    { timeoutMs: 25_000 },
  )
  const gen = requests.filter((r) => r.method === 'POST' && r.url.includes('/ai/task/generate'))
  /*
   * The OPTIONS it sent, not merely that it sent something. A classifier handed
   * a made-up list would answer confidently about types this workspace does not
   * have, and the answer would still resolve to nothing — a wrong answer and a
   * working one are only distinguishable here.
   */
  const carriedRealTypes = gen.some((r) => types.every((tt) => (r.body ?? '').includes(tt.name)))
  chk(
    genCalls && carriedRealTypes,
    `it asks /ai/task/generate to choose among this workspace's REAL ${types.length} type names`,
    genCalls
      ? `the request went out without the workspace's own type names (${types.map((t) => t.name).join(', ')}) — ` +
        'a choice over a list the workspace does not have cannot resolve to one of its types'
      : 'pressing it requested nothing',
  )

  const typeAfter = (await A(`/tasks/${task.id}`)).data?.taskTypeId ?? null
  chk(
    typeAfter === typeBefore,
    'and a refused classification changes the task type to NOTHING — it does not fall back to the first type',
    `the task type moved from ${typeBefore} to ${typeAfter} on a run where the model never answered — ` +
      'rounding an unresolved answer to a real type makes a guess indistinguishable from a decision',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ the composer hint, frame `04:00` — and the half that was said not to exist')

  await page.getByTestId('task-tab-comments').click()
  if (!(await waitUntil(() => page.getByTestId('comment-input').isVisible().catch(() => false), { timeoutMs: 20_000 }))) {
    throw new Error('the comment composer never mounted')
  }

  /*
   * `textContent`, not `innerText`: this hint is not transformed, but the rule
   * that bit `activity-rail` is to say which one you mean.
   */
  const hint = (await page.getByTestId('comment-composer-hint').textContent()) ?? ''
  chk(
    hint.includes('space') && hint.includes('/'),
    `the hint reads "${hint.trim()}" — both halves, because both halves now do something`,
    `the hint reads "${hint.trim()}" — the space half is missing, or the slash half was lost adding it`,
  )

  const input = page.getByTestId('comment-input')
  await input.click()
  await input.press(' ')
  const panelOpened = await waitUntil(
    () => page.getByTestId('comment-ai-panel').isVisible().catch(() => false),
    { timeoutMs: 10_000 },
  )
  chk(
    panelOpened && (await input.inputValue()) === '',
    'space on an EMPTY composer opens the AI panel, and the space itself is swallowed rather than typed',
    panelOpened
      ? `the panel opened but the composer now reads "${await input.inputValue()}" — the keystroke did both things`
      : 'space did nothing: the hint promises a gesture the composer does not honour, which is the ' +
        'printed-but-not-followable defect this audit keeps finding',
  )

  await page.getByTestId('comment-ai-close').click()
  await input.fill('already typing')
  await input.press(' ')
  const stillClosed = !(await page.getByTestId('comment-ai-panel').isVisible().catch(() => false))
  const typedValue = await input.inputValue()
  chk(
    stillClosed && typedValue === 'already typing ',
    'and with words in the box a space is just a space — the panel stays shut and the character lands',
    stillClosed
      ? `the composer reads "${typedValue}" — the space was eaten from a box that had text in it, which is the ` +
        '`planner-views` shortcut bug in a new place'
      : 'the panel opened mid-sentence, so nobody can type two words in this composer',
  )

  await input.fill('')
  await input.press(' ')
  await waitUntil(() => page.getByTestId('comment-ai-panel').isVisible().catch(() => false), { timeoutMs: 10_000 })
  await page.getByTestId('comment-ai-prompt').fill(`ask the vendor for the revised quote ${TAG}`)
  await page.getByTestId('comment-ai-mode').selectOption('shorten')
  requests.length = 0
  await page.getByTestId('comment-ai-run').click()
  const aiError = page.getByTestId('comment-ai-error')
  const errored = await waitUntil(() => aiError.isVisible().catch(() => false), { timeoutMs: 25_000 })
  const improveCalls = requests.filter((r) => r.method === 'POST' && r.url.includes('/ai/writing/improve'))
  chk(
    improveCalls.length > 0
      && improveCalls.some((r) => (r.body ?? '').includes(TAG) && (r.body ?? '').includes('shorten')),
    'asking sends the typed instruction AND the chosen mode to /ai/writing/improve',
    improveCalls.length === 0
      ? 'nothing was requested — the panel is a form over a dead handler'
      : `the request carried ${improveCalls[0]?.body?.slice(0, 120)} — the instruction or the mode did not go out, ` +
        'and a mode select that changes nothing is a control that remembers a value and does nothing with it',
  )

  const errText = errored ? ((await aiError.textContent()) ?? '') : ''
  chk(
    errored && errText.toLowerCase().includes(REFUSAL),
    'and the panel reports the server\'s named reason rather than an empty draft or a shrug',
    errored
      ? `the panel said "${errText.trim().slice(0, 90)}"`
      : 'the panel reported nothing: the request failed and the reader was left looking at an empty box',
  )

  const composerAfter = await input.inputValue()
  chk(
    composerAfter === '',
    'and a failed ask leaves the comment box exactly as it was — nothing is written without Keep',
    `the composer now reads "${composerAfter}" after an ask that failed — the chat composer's own first version ` +
      'overwrote the draft on press, and this is that mistake coming back',
  )
} catch (err) {
  failed += 1
  const frame = String(err?.stack ?? '').split('\n').find((l) => l.includes('task-ai-bar.mjs'))
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err?.message ?? err, frame ? `\n  at ${frame.trim()}` : '')
} finally {
  sql = await openDb().catch(() => null)
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
