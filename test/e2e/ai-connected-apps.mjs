/**
 * THE AI ACTS IN THE ASKER'S OWN CONNECTED APPS, AS CLICKUP'S DOES
 * (`ledger-rows/row-2294`).
 *
 * ClickUp (help centre, "Use Gmail tools with ClickUp AI" and "Google Calendar
 * integration"; AlternativeTo, July 2025; read through search excerpts, 12 and
 * 13 October): the AI works through a person's own connections and acts as
 * that person — it creates a Google Calendar event (a title, a start, a
 * duration, a description, a location and attendees), drafting the invite for
 * the person to approve; it writes Gmail drafts; and Connected Search lets it
 * read what their apps hold.
 *
 * Here, on the AI page's Commands tab, where every change is previewed and
 * written only once confirmed: an event in the asker's own calendar (the one
 * their planner writes to), a draft left in a mailbox they linked themselves,
 * and a search of their own Drive, Gmail and SharePoint.
 *
 * Where a model answers (a lane's stub, `model-stub.mjs`, which a check stages
 * with the tool call a model would make), the whole path is read: the plan,
 * the preview, the confirm, what the calendar and the mailbox then hold. With
 * no model — CI — the preview is refused in words, and what a confirm writes is
 * read through `/ai/command/execute`, which calls no model: the same door the
 * Confirm button uses, with the action the preview would have carried.
 *
 * A workspace of this run's own: Olga (an admin, in Asia/Karachi) connects her
 * calendar, her Gmail and her Drive through the product's own consent flows;
 * Mia, a member, connects nothing. The calendar, the mailbox and the Drive are
 * the lane's stub (`calendar-stub.mjs`), a bearer token each.
 *
 *   node test/e2e/ai-connected-apps.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt, madeWorkspace } from './lib/fixture.mjs'
import { waitUntil, readText } from './lib/wait.mjs'
import { calendarBase, seedCalendar, readCalendar, failCalendar, seedConsentCode, seedMailbox, readMailbox, seedSearchAccount, searchesAsked } from './lib/calendar.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 11

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const STUB = calendarBase(API_PORT, argOf('--calendar', undefined))
const MODEL = `http://127.0.0.1:${argOf('--model', process.env.E2E_MODEL_PORT ?? String(9200 + (API_PORT - 3020)))}`
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

// The API's own words (`ai-connected.ts`, `email-accounts.service.ts`, `ai.service.ts`).
const SAID = {
  notConfigured: 'AI features are not configured',
  noCalendar: 'You have no calendar connected to add events to: connect Google Calendar or Outlook in the Planner, under Calendars, and ask again',
  notYourDrafts: 'A draft is written only in a mailbox you linked yourself',
  notMember: 'You are not a member of that workspace',
  calendarRefused: 'Google Calendar refused the grant Rundesk holds for your calendar: connect it again in the Planner, under Calendars',
}

const stamp = Date.now()
const TAG = `aic${stamp}`
const PASSWORD = 'Connected@12345!'
const ZONE = 'Asia/Karachi'
const CAL = `${TAG}-olga-cal`
const CAL_ADDRESS = `olga-${TAG}@gmail.test`
const GMAIL = `${TAG}-olga-gmail`
const GMAIL_ADDRESS = `olga-mail-${TAG}@gmail.test`
const DRIVE = `${TAG}-olga-drive`
const CLIENT = `client-${TAG}@example.com`
const EVENT = `Design review ${TAG}`
const EVENT_REFUSED = `Refused review ${TAG}`
const SUBJECT = `Quote ${TAG}`
const BODY = `Here is the quote for ${TAG}.\nTwo lines of it.`
const ROADMAP = `${TAG} roadmap`
// The link the stub's Drive gives a file, as Drive's `webViewLink` does.
const ROADMAP_URL = `https://drive.google.test/file/d/${TAG}-roadmap/view`
// Tomorrow, as a day: 10:00 there in Karachi is 05:00 UTC, every day of the year (no daylight saving).
const DAY = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10)
const START_UTC = `${DAY}T05:00:00.000Z`
const END_UTC = `${DAY}T05:45:00.000Z`

const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error, message}`. Every call site reads `status`. */
const apiAs = apiAsAt(API, { emptyBodyOn: ['POST'] })
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`

/** The model stub's control routes; null where it does not answer. */
const stub = (route, body) =>
  fetch(`${MODEL}/__control/${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
/** The next model answer: the tool call a model asked to make it would make. */
const stageTool = (name, input) => stub('next', { content: [{ type: 'tool_use', name, input }] })

let sql = null
let WS = null
let WS2 = null
let A = null
let browser = null
let codes = 0

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what the AI writes is read back from the calendar and the mailbox, and its runs by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: `Connected ${TAG}` } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  madeWorkspace(WS)
  await sql`update workspaces set plan = 'business' where id = ${WS}`
  const on = await A('/feature-flags/tasks.email', { method: 'PUT', body: { enabled: true, scope: 'workspace', scopeId: WS, workspaceId: WS } })
  if (!on.ok) throw new Error(`could not turn the Email ClickApp on: ${said(on)}`)
  // A workspace Olga is not in, for an action that names it.
  const other = await A('/workspaces', { method: 'POST', body: { name: `Elsewhere ${TAG}` } })
  if (!other.ok || !other.data?.id) throw new Error(`could not make the second workspace: ${said(other)}`)
  WS2 = other.data.id
  madeWorkspace(WS2)

  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Connected ${who} ${stamp}`, email, password: PASSWORD, organizationName: `Connected ${who} ${stamp}`, organizationSlug: `aic-${who}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add ${who}: ${said(added)}`)
    const [row] = await sql`select id from users where email = ${email}`
    return { id: row.id, email, api: apiAs(signed.accessToken) }
  }
  const olga = await person('olga', 'workspace_admin')
  const mia = await person('mia', 'member')
  const O = olga.api
  const M = mia.api
  await sql`update users set timezone = ${ZONE} where id = ${olga.id}`

  /** A grant through the product's own consent flow: its start, the provider's code, its callback. */
  const grant = async (who, startRoute, provider, { token, address }) => {
    const start = await who(startRoute, { method: 'POST' })
    const authUrl = start.data?.authUrl ? new URL(start.data.authUrl) : null
    const state = authUrl?.searchParams.get('state') ?? null
    const code = `${token}-code-${(codes += 1)}`
    const scope = authUrl?.searchParams.get('scope') ?? ''
    await seedConsentCode(STUB, { code, accessToken: token, refreshToken: `${token}-refresh`, email: address, sub: `${token}-sub`, scopes: scope.split(' ') })
    const back = state ? await fetch(`${API}/integrations/oauth/${provider}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, { redirect: 'manual' }) : null
    return { start, scope, back: back?.status ?? 0 }
  }

  await seedCalendar(STUB, { token: CAL, provider: 'gcal', events: [], refreshToken: `${CAL}-refresh` })
  const calLinked = await grant(O, `/workspaces/${WS}/calendar-sync/connect/gcal`, 'gcal', { token: CAL, address: CAL_ADDRESS })
  await seedMailbox(STUB, { token: GMAIL, provider: 'gmail', address: GMAIL_ADDRESS, name: 'Olga', refreshToken: `${GMAIL}-refresh` })
  const mailLinked = await grant(O, `/workspaces/${WS}/email-accounts/connect/gmail`, 'gmail', { token: GMAIL, address: GMAIL_ADDRESS })
  await seedSearchAccount(STUB, { token: DRIVE, drive: [{ id: `${TAG}-roadmap`, name: ROADMAP, visibility: 'limited' }] })
  const driveLinked = await grant(O, `/workspaces/${WS}/search/connect/google-drive`, 'google-drive', { token: DRIVE, address: CAL_ADDRESS })
  const [calRow] = await sql`select id, provider, is_default, status, external_account_email from user_calendar_accounts where user_id = ${olga.id} and workspace_id = ${WS}`
  const [mailRow] = await sql`select id, provider, address, scopes, status from email_accounts where workspace_id = ${WS} and owner_id = ${olga.id}`
  if (!calRow?.is_default || !mailRow?.id) {
    throw new Error(`the connections did not land: ${JSON.stringify({ cal: calLinked.back, calRow: calRow ?? null, mail: mailLinked.back, mailRow: mailRow ? { ...mailRow, scopes: undefined } : null, drive: driveLinked.back })}`)
  }

  const aiStatus = await A('/ai/status')
  const MODEL_ON = aiStatus.status === 200 && aiStatus.data?.available === true
  console.log(`  · /ai/status says a model is ${MODEL_ON ? `configured (stub ${MODEL})` : 'not configured'}`)
  if (MODEL_ON) await stub('reset', {})

  // ══ 1. THE MAILBOX'S CONSENT ASKS TO LEAVE DRAFTS ══════════════════════════
  console.log('\n▶ linking Gmail asks Google to send, to leave drafts and to read')
  chk(
    /gmail\.send/.test(mailLinked.scope) && /gmail\.compose/.test(mailLinked.scope) && /gmail\.readonly/.test(mailLinked.scope)
      && mailLinked.back === 302 && (mailRow.scopes ?? []).some((s) => s.endsWith('/gmail.compose')),
    'linking Gmail asks Google to send, to leave drafts and to read — and the mailbox is kept with the draft grant (read by SQL)',
    JSON.stringify({ scope: mailLinked.scope, back: mailLinked.back, scopes: mailRow.scopes }),
  )

  // The Commands tab, as Olga.
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  // A step that cannot happen fails in seconds rather than waiting for ever.
  page.setDefaultTimeout(15_000)
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', olga.email)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  const commands = async () => {
    await page.goto(`${B}/app/${WS}/ai`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('ai-tab-commands').click({ timeout: 20_000 }).catch(() => {})
  }
  /** Ask, and wait for the plan or the refusal. */
  const ask = async (words) => {
    await page.getByTestId('ai-command-input').fill(words).catch(() => {})
    await page.getByTestId('ai-command-preview').click().catch(() => {})
    await waitUntil(
      async () => (await page.getByTestId('ai-command-plan').count().catch(() => 0)) > 0 || (await page.getByTestId('ai-command-error').count().catch(() => 0)) > 0,
      { timeoutMs: 30_000 },
    )
  }
  const confirm = async () => {
    await page.getByTestId('ai-command-confirm').click().catch(() => {})
    await waitUntil(async () => (await page.getByTestId('ai-command-result').count().catch(() => 0)) > 0, { timeoutMs: 30_000 })
  }
  const execute = (who, actions) => who('/ai/command/execute', { method: 'POST', body: { workspaceId: WS, actions } })
  const eventAction = (over = {}) => ({
    tool: 'create_calendar_event',
    args: { workspaceId: WS, title: EVENT, start: START_UTC, end: END_UTC, timeZone: ZONE, location: 'Room 4', attendees: [mia.email, CLIENT], ...over },
    humanLabel: `Add “${over.title ?? EVENT}” to your Google Calendar`,
  })
  const writesTo = async (token) => ((await readCalendar(STUB, token))?.writes ?? []).filter((w) => w.method === 'POST')
  const eventsTitled = async (title) => ((await readCalendar(STUB, CAL))?.events ?? []).filter((e) => e.title === title)

  // ══ 2. AN EVENT, DRAFTED, THEN WRITTEN ═════════════════════════════════════
  console.log('\n▶ an event in Olga’s own calendar, drafted for her to confirm')
  await commands()
  if (MODEL_ON) {
    await stageTool('create_calendar_event', { title: EVENT, start: `${DAY}T10:00`, durationMinutes: 45, attendeeEmails: [mia.email, CLIENT], location: 'Room 4' })
  }
  await ask(`Book a design review with Mia and the client tomorrow at 10 for 45 minutes in Room 4 ${TAG}`)
  const writesBefore = await writesTo(CAL)
  if (MODEL_ON) {
    const title = await readText(page.getByTestId('ai-command-event-title').filter({ visible: true }))
    const when = await readText(page.getByTestId('ai-command-event-when').filter({ visible: true }))
    const invites = await readText(page.getByTestId('ai-command-event-attendees').filter({ visible: true }))
    chk(
      title === EVENT && when.includes(`${DAY} 10:00`) && when.includes('10:45') && when.includes(ZONE)
        && invites.includes(mia.email) && invites.includes(CLIENT) && writesBefore.length === 0,
      'the Commands tab drafts the event for her to confirm — its title, its time in her own zone, whom it invites — and nothing is in her calendar yet',
      JSON.stringify({ title, when, invites, written: writesBefore.length }),
    )
  } else {
    const refused = await readText(page.getByTestId('ai-command-error').filter({ visible: true }))
    chk(
      refused.includes(SAID.notConfigured) && writesBefore.length === 0,
      'the Commands tab drafts the event for her to confirm — its title, its time in her own zone, whom it invites — and nothing is in her calendar yet',
      `no model here: ${JSON.stringify({ refused, written: writesBefore.length })}`,
    )
  }

  let eventResult = null
  if (MODEL_ON) {
    await confirm()
    eventResult = {
      status: await page.getByTestId('ai-command-result').first().getAttribute('data-status').catch(() => null),
      said: await readText(page.getByTestId('ai-command-result-said').filter({ visible: true })),
    }
  } else {
    const res = await execute(O, [eventAction()])
    const r = res.data?.results?.[0]
    eventResult = { status: r?.status ?? null, said: r?.external?.kind === 'event' ? `Added to ${r.external.where}` : r?.message ?? said(res) }
  }
  const written = await eventsTitled(EVENT)
  const invite = (await writesTo(CAL)).find((w) => w.body?.summary === EVENT)
  chk(
    eventResult.status === 'succeeded' && eventResult.said.includes(`Added to ${CAL_ADDRESS}`)
      && written.length === 1 && written[0].start === START_UTC && written[0].end === END_UTC
      && invite?.query?.sendUpdates === 'all' && invite?.body?.location === 'Room 4'
      && JSON.stringify((invite?.body?.attendees ?? []).map((a) => a.email)) === JSON.stringify([mia.email, CLIENT]),
    'confirmed, the event is in her own Google Calendar at that instant — 10:00 in Karachi, 05:00 UTC — in Room 4, inviting both, Google asked to send the invitations, and the result says where it went',
    JSON.stringify({ result: eventResult, events: written, invite: invite ? { query: invite.query, attendees: invite.body?.attendees, location: invite.body?.location } : null }),
  )

  // ══ 3. A DRAFT, LEFT IN HER MAILBOX ════════════════════════════════════════
  console.log('\n▶ an email drafted in Olga’s own mailbox, and not sent')
  await commands()
  if (MODEL_ON) await stageTool('draft_email', { to: [CLIENT], cc: [mia.email], subject: SUBJECT, body: BODY })
  await ask(`Draft an email to the client with the quote, copying Mia ${TAG}`)
  const boxBefore = (await readMailbox(STUB, GMAIL))?.messages ?? []
  if (MODEL_ON) {
    const to = await readText(page.getByTestId('ai-command-draft-to').filter({ visible: true }))
    const cc = await readText(page.getByTestId('ai-command-draft-cc').filter({ visible: true }))
    const subject = await readText(page.getByTestId('ai-command-draft-subject').filter({ visible: true }))
    const body = await readText(page.getByTestId('ai-command-draft-body').filter({ visible: true }))
    chk(
      to.includes(CLIENT) && cc.includes(mia.email) && subject.includes(SUBJECT) && body.includes('Two lines of it.') && boxBefore.length === 0,
      'an email is drafted for her to confirm — whom it goes to and is copied to, its subject and words — and nothing is in her mailbox yet',
      JSON.stringify({ to, cc, subject, body, inMailbox: boxBefore.length }),
    )
  } else {
    const refused = await readText(page.getByTestId('ai-command-error').filter({ visible: true }))
    chk(
      refused.includes(SAID.notConfigured) && boxBefore.length === 0,
      'an email is drafted for her to confirm — whom it goes to and is copied to, its subject and words — and nothing is in her mailbox yet',
      `no model here: ${JSON.stringify({ refused, inMailbox: boxBefore.length })}`,
    )
  }

  let draftResult = null
  if (MODEL_ON) {
    await confirm()
    draftResult = {
      status: await page.getByTestId('ai-command-result').first().getAttribute('data-status').catch(() => null),
      said: await readText(page.getByTestId('ai-command-result-said').filter({ visible: true })),
    }
  } else {
    const res = await execute(O, [{ tool: 'draft_email', args: { workspaceId: WS, accountId: mailRow.id, to: [CLIENT], cc: [mia.email], subject: SUBJECT, body: BODY }, humanLabel: `Save a draft “${SUBJECT}”` }])
    const r = res.data?.results?.[0]
    draftResult = { status: r?.status ?? null, said: r?.external?.kind === 'draft' ? `Saved in the drafts of ${r.external.where}` : r?.message ?? said(res) }
  }
  const box = (await readMailbox(STUB, GMAIL))?.messages ?? []
  const draft = box.find((m) => m.subject === SUBJECT)
  chk(
    draftResult.status === 'succeeded' && draftResult.said.includes(`Saved in the drafts of ${GMAIL_ADDRESS}`)
      && box.length === 1 && draft?.isDraft === true && JSON.stringify(draft.to) === JSON.stringify([CLIENT])
      && JSON.stringify(draft.cc) === JSON.stringify([mia.email]) && draft.text.includes('Two lines of it.'),
    'confirmed, the email is a draft in her own Gmail — to the client, copying Mia, its subject and words — nothing is sent, and the result says where it is',
    JSON.stringify({ result: draftResult, mailbox: box.map((m) => ({ subject: m.subject, isDraft: m.isDraft, to: m.to, cc: m.cc })) }),
  )

  // ══ 4. A SEARCH OF HER OWN CONNECTED APPS ══════════════════════════════════
  console.log('\n▶ a search of Olga’s own connected apps')
  await commands()
  if (MODEL_ON) await stageTool('search_connected_apps', { query: ROADMAP })
  await ask(`Find the roadmap in my Drive ${TAG}`)
  const asked = (await searchesAsked(STUB, DRIVE)) ?? []
  if (MODEL_ON) {
    const shown = await readText(page.getByTestId('ai-command-connected-hit').filter({ visible: true }).filter({ hasText: ROADMAP }).first())
    const hit = page.getByTestId('ai-command-connected-hit').filter({ hasText: ROADMAP }).first()
    const source = await hit.getAttribute('data-source').catch(() => null)
    const href = await hit.locator('a').getAttribute('href').catch(() => null)
    chk(
      shown.includes(ROADMAP) && source === 'drive' && href === ROADMAP_URL && asked.length > 0,
      'a search of her own connected apps is answered from her Drive, through her own connection — the file listed with its link',
      JSON.stringify({ shown, source, href, asked: asked.map((a) => a.query) }),
    )
  } else {
    const refused = await readText(page.getByTestId('ai-command-error').filter({ visible: true }))
    chk(
      refused.includes(SAID.notConfigured) && asked.length === 0,
      'a search of her own connected apps is answered from her Drive, through her own connection — the file listed with its link',
      `no model here: ${JSON.stringify({ refused, asked: asked.length })}`,
    )
  }

  // ══ 5. REFUSED, IN WORDS ═══════════════════════════════════════════════════
  console.log('\n▶ what is refused, and how it is said')
  const writesBeforeMia = (await writesTo(CAL)).length
  let miaSaid = ''
  if (MODEL_ON) {
    await stageTool('create_calendar_event', { title: `Mia's ${EVENT}`, start: `${DAY}T11:00` })
    const plan = await M('/ai/command', { method: 'POST', body: { workspaceId: WS, message: `Book a call tomorrow at 11 ${TAG}` } })
    miaSaid = (plan.data?.actions?.length ?? -1) === 0 ? (plan.data?.warnings ?? []).join(' ') : `planned ${JSON.stringify(plan.data?.actions ?? said(plan))}`
  } else {
    const res = await execute(M, [eventAction({ title: `Mia's ${EVENT}` })])
    const r = res.data?.results?.[0]
    miaSaid = r?.status === 'skipped' ? r.message ?? '' : `came back ${JSON.stringify(r ?? said(res))}`
  }
  chk(
    miaSaid.includes(SAID.noCalendar) && (await writesTo(CAL)).length === writesBeforeMia,
    'a person with no calendar connected is told so in words — and where to connect one — and nothing is written',
    JSON.stringify({ said: miaSaid }),
  )

  const forged = await execute(M, [{ tool: 'draft_email', args: { workspaceId: WS, accountId: mailRow.id, to: [CLIENT], cc: [], subject: `Forged ${TAG}`, body: 'Not hers to write.' }, humanLabel: 'Save a draft' }])
  const forgedResult = forged.data?.results?.[0]
  const boxAfterForged = (await readMailbox(STUB, GMAIL))?.messages ?? []
  chk(
    forgedResult?.status === 'skipped' && forgedResult?.message === SAID.notYourDrafts && boxAfterForged.length === 1,
    'a draft is written only in a mailbox its asker linked: one naming Olga’s, sent by Mia, is refused in words and her mailbox is untouched',
    JSON.stringify({ result: forgedResult ?? said(forged), mailbox: boxAfterForged.length }),
  )

  const elsewhere = await execute(O, [eventAction({ workspaceId: WS2, title: `Elsewhere ${EVENT}` })])
  const elsewhereResult = elsewhere.data?.results?.[0]
  chk(
    elsewhereResult?.status === 'skipped' && elsewhereResult?.message === SAID.notMember && (await eventsTitled(`Elsewhere ${EVENT}`)).length === 0,
    'an action naming a workspace its asker is not in is refused in words, and nothing is written',
    JSON.stringify({ result: elsewhereResult ?? said(elsewhere) }),
  )

  // Google refuses the grant at the confirm: the result says so, in the Commands tab where a model answers.
  let refusedSaid = ''
  if (MODEL_ON) {
    await commands()
    await stageTool('create_calendar_event', { title: EVENT_REFUSED, start: `${DAY}T15:00`, durationMinutes: 30 })
    await ask(`Book a refused review tomorrow at 3 ${TAG}`)
    await failCalendar(STUB, CAL, 401, 4)
    await confirm()
    refusedSaid = await readText(page.getByTestId('ai-command-result-said').filter({ visible: true }))
  } else {
    await failCalendar(STUB, CAL, 401, 4)
    const res = await execute(O, [eventAction({ title: EVENT_REFUSED })])
    refusedSaid = res.data?.results?.[0]?.message ?? said(res)
  }
  chk(
    refusedSaid.includes(SAID.calendarRefused) && (await eventsTitled(EVENT_REFUSED)).length === 0,
    'a calendar whose grant the provider refuses at the confirm is said so in words — connect it again — and the event is not written',
    JSON.stringify({ said: refusedSaid }),
  )

  // ══ 6. THE AI VALUE PANEL COUNTS THEM ══════════════════════════════════════
  console.log('\n▶ the AI value panel counts the connected apps’ runs')
  const value = await O(`/ai/value?workspaceId=${WS}`)
  const cats = Object.fromEntries((value.data?.byCategory ?? []).map((c) => [c.category, c]))
  const runs = await sql`select feature, count(*)::int as n from ai_usage where workspace_id = ${WS} and user_id = ${olga.id} and status = 'succeeded' group by feature`
  const ran = Object.fromEntries(runs.map((r) => [r.feature, r.n]))
  const filled = cats.externalActions?.supported === true && cats.externalSearches?.supported === true
    && cats.externalActions?.reasonKey === undefined && cats.externalSearches?.reasonKey === undefined
  chk(
    filled && (MODEL_ON
      ? cats.externalActions.runs >= 3 && cats.externalSearches.runs >= 1 && (ran['command.connected_action'] ?? 0) >= 3 && (ran['command.connected_search'] ?? 0) >= 1
      : cats.externalActions.runs === 0 && cats.externalSearches.runs === 0),
    'External app actions and External app searches are filled tiles, not “not available” — the runs that reached her calendar, her mailbox and her Drive are counted there (read by SQL)',
    JSON.stringify({ actions: cats.externalActions ?? null, searches: cats.externalSearches ?? null, ran }),
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  for (const ws of [WS, WS2]) {
    if (ws && A) {
      const gone = await A(`/workspaces/${ws}`, { method: 'DELETE' })
      if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${ws} answered ${gone.status || 'nothing'}`)
    }
  }
  // Only now: the DELETEs above go through this proxy, and a closed one refuses them.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const total = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (total !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${total} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && total === EXPECTED_CHECKS ? 0 : 1
}
