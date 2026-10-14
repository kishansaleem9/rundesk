/**
 * THE AI NOTETAKER (`commit-log/log-39863ff-1`).
 *
 * ClickUp's AI Notetaker joins a Zoom, Google Meet or Microsoft Teams meeting —
 * sent to one by pasting its link, or to every meeting with one on the
 * calendars picked under "Join all meetings for", joining when they begin —
 * records it, and keeps its notes and transcript, which land in the Inbox (its
 * help centre, "Use AI Notetaker to take notes and record meetings", through
 * search excerpts). Here it was a recorded decision with nothing behind it.
 *
 * The bot is a meeting-bot service's (Recall.ai's, `notetaker/recall.ts`); the
 * lanes and CI point it at the media stub, which answers in Recall's shapes and
 * lets this suite move each bot through its call (`media-stub.mjs`). The
 * person's calendar is the calendar stub's, with a meeting about to begin.
 *
 *   node test/e2e/ai-notetaker.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'
import { mediaBase } from './lib/media.mjs'
import { calendarBase, seedCalendar, forgetCalendar } from './lib/calendar.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 10

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}
const MEDIA = mediaBase(API_PORT, argOf('--media', undefined))
const CAL = calendarBase(API_PORT, argOf('--calendar', undefined))

let passed = 0
let failed = 0
// THE SENTENCE, THEN THE REASON: a failing check names itself.
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`
const control = async (route, body) => {
  const res = await fetch(`${MEDIA}${route}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`the media stub answered ${res.status} to ${route}`)
  return res.json()
}
const bots = async () => (await control('/__control/recall/bots')).bots

const stamp = Date.now()
const TAG = `ant${stamp}`
const PASSWORD = 'Notetaker@12345!'
const TOKEN = `${TAG}-calendar`
const LINK = `https://acme.zoom.us/j/${stamp}`
const CAL_LINK = `https://acme.zoom.us/j/${stamp + 1}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
const apiAs = apiAsAt(API)
let sql = null
let browser = null
const workspacesMade = []

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the calendar is planted and the meeting read by SQL')
  await control('/__control/recall/reset', {})
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: `Notetaker ${TAG}` } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  const WS = made.data.id
  workspacesMade.push({ id: WS, as: A })
  // A colleague, who speaks in the meeting and whose visits are their own.
  const anaName = `Ana ${TAG}`
  const ana = await signUpApi(API, { fullName: anaName, email: `${TAG}-ana@rundesk.invalid`, password: PASSWORD, organizationName: `Ana ${stamp}`, organizationSlug: `ant-ana-${stamp}` })
  const ANA = apiAs(ana.accessToken)
  if (ana.workspaces?.[0]?.id) workspacesMade.push({ id: ana.workspaces[0].id, as: ANA })
  const joined = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email: `${TAG}-ana@rundesk.invalid`, role: 'member' } })
  if (!joined.ok) throw new Error(`could not add Ana: ${said(joined)}`)

  // The admin's calendar: a meeting with a Zoom link about to begin, one with no link, and an all-day one.
  const startsAt = new Date(Math.ceil((Date.now() + 5 * 60_000) / 1000) * 1000)
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000)
  const EV = { id: `ev-${TAG}`, title: `Client review ${TAG}` }
  await seedCalendar(CAL, {
    token: TOKEN,
    provider: 'gcal',
    events: [
      { id: EV.id, title: EV.title, start: startsAt.toISOString(), end: endsAt.toISOString(), meetingUrl: CAL_LINK },
      { id: `ev2-${TAG}`, title: `Lunch ${TAG}`, start: startsAt.toISOString(), end: endsAt.toISOString(), location: 'Cafe' },
      { id: `ev3-${TAG}`, title: `Offsite ${TAG}`, start: startsAt.toISOString().slice(0, 10), end: new Date(startsAt.getTime() + 86_400_000).toISOString().slice(0, 10), allDay: true, meetingUrl: `https://acme.zoom.us/j/${stamp + 2}` },
    ],
  })
  const [account] = await sql`
    insert into user_calendar_accounts
      (user_id, workspace_id, provider, external_account_id, external_account_email, access_token, token_expires_at, is_default, counts_as_busy, status)
    values (${auth.user.id}, ${WS}, 'gcal', ${`${TAG}-google`}, ${`${TAG}@calendar.test`}, ${TOKEN}, ${new Date(Date.now() + 3_600_000)}, true, true, 'connected')
    returning id::text as id`

  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${B}/app/${WS}/meetings`, { waitUntil: 'domcontentloaded' })
  const panel = page.getByTestId('notetaker')
  const ready = await waitUntil(async () => (await panel.getAttribute('data-state', { timeout: 2000 }).catch(() => null)) === 'ready', { timeoutMs: 25_000 })
  const box = page.getByTestId(`notetaker-calendar-${account.id}`)
  const offered = await box.isVisible({ timeout: 5000 }).catch(() => false)
  const unticked = offered ? !(await box.isChecked({ timeout: 2000 }).catch(() => true)) : false

  // ══ 1. THE PANEL ═══════════════════════════════════════════════════════════
  console.log('\n▶ the AI Notetaker on the Meetings page')
  chk(
    ready && offered && unticked && (await page.getByTestId('notetaker-link').isVisible().catch(() => false)),
    'the Meetings page offers the AI Notetaker: a box for a meeting’s link, and the person’s calendars to join, none yet',
    JSON.stringify({ ready, offered, unticked }),
  )

  // ══ 2. SENT BY ITS LINK ════════════════════════════════════════════════════
  console.log('\n▶ "Send AI Notetaker" with a link')
  await page.getByTestId('notetaker-link').fill(LINK, { timeout: 5000 }).catch(() => {})
  await page.getByTestId('notetaker-send').click({ timeout: 5000 }).catch(() => {})
  const sentBot = await waitUntil(async () => (await bots()).find((b) => b.meeting_url === LINK), { timeoutMs: 15_000 })
  const [sentRun] = await sql`select id::text as id, status, join_at, vendor_bot_id from notetaker_bots where workspace_id = ${WS} and meeting_url = ${LINK}`
  const listed = sentRun
    ? await waitUntil(async () => (await page.getByTestId(`notetaker-run-${sentRun.id}`).getAttribute('data-status', { timeout: 2000 }).catch(() => null)) === 'joining', { timeoutMs: 10_000 })
    : false
  chk(
    !!sentBot && sentBot.join_at === null && sentBot.bot_name === 'Rundesk Notetaker' && sentRun?.vendor_bot_id === sentBot.id && sentRun?.join_at === null && listed,
    'sent by its link, the notetaker joins now: a bot asked for that meeting by its name, and the visit listed as joining',
    JSON.stringify({ bot: sentBot ? { url: sentBot.meeting_url, joinAt: sentBot.join_at, name: sentBot.bot_name } : null, run: sentRun ?? null, listed }),
  )

  // ══ 3. NOT A MEETING ═══════════════════════════════════════════════════════
  const before = (await bots()).length
  const refused = await A(`/workspaces/${WS}/notetaker/runs`, { method: 'POST', body: { meetingUrl: 'https://example.com/our-standup' } })
  chk(
    refused.status === 400 && /Zoom, Google Meet or Microsoft Teams/.test(refused.error?.message ?? '') && (await bots()).length === before,
    'a link that is no Zoom, Meet or Teams meeting is refused in words, and no bot is sent',
    JSON.stringify({ refused: said(refused), bots: (await bots()).length - before }),
  )

  // ══ 4. JOIN ALL MEETINGS FOR A CALENDAR ════════════════════════════════════
  console.log('\n▶ "Join all meetings for" the calendar')
  await box.check({ timeout: 5000 }).catch(() => {})
  const calBot = await waitUntil(async () => (await bots()).find((b) => b.meeting_url === CAL_LINK), { timeoutMs: 20_000 })
  const calRuns = await sql`select id::text as id, title, status, calendar_event_id from notetaker_bots where workspace_id = ${WS} and calendar_account_id = ${account.id}`
  const calRun = calRuns.find((r) => r.calendar_event_id === EV.id)
  chk(
    !!calBot && calBot.join_at === startsAt.toISOString() && calRuns.length === 1 && calRun?.title === EV.title && calRun?.status === 'scheduled',
    '“Join all meetings for” a calendar sends a bot to its meeting with a link, to join at its start, and none to a meeting without one or to an all-day event',
    JSON.stringify({ bot: calBot ? { joinAt: calBot.join_at } : null, startsAt: startsAt.toISOString(), runs: calRuns }),
  )

  // ══ 5. THE BOT'S CALL, AND ITS NOTES ═══════════════════════════════════════
  console.log('\n▶ the bot joins, records, and its notes are written')
  if (sentBot) {
    await control(`/__control/recall/bots/${sentBot.id}`, { code: 'joining_call' })
    await control(`/__control/recall/bots/${sentBot.id}`, { code: 'in_call_recording' })
  }
  const recording = sentRun
    ? await waitUntil(async () => (await page.getByTestId(`notetaker-run-${sentRun.id}`).getAttribute('data-status', { timeout: 2000 }).catch(() => null)) === 'recording', { timeoutMs: 20_000 })
    : false
  if (sentBot) {
    await control(`/__control/recall/bots/${sentBot.id}`, { code: 'call_ended' })
    await control(`/__control/recall/bots/${sentBot.id}`, {
      code: 'done',
      transcript: [
        { participant: { name: anaName }, words: [{ text: 'We ship the launch', start_timestamp: { relative: 1 } }, { text: `on Friday ${TAG}.`, start_timestamp: { relative: 2 } }] },
        { participant: { name: 'Guest Speaker' }, words: [{ text: 'Sounds good.', start_timestamp: { relative: 4 } }] },
      ],
    })
  }
  const written = await waitUntil(async () => {
    const [r] = await sql`select status, meeting_id::text as meeting_id from notetaker_bots where id = ${sentRun?.id ?? null}`
    return r?.status === 'done' && r.meeting_id ? r : null
  }, { timeoutMs: 30_000 })
  const [meeting] = written
    ? await sql`select id::text as id, title, provider, join_url, transcript, created_by_id::text as created_by from meetings where id = ${written.meeting_id}`
    : []
  const attendees = meeting
    ? await sql`select user_id::text as user_id, name from meeting_attendees where meeting_id = ${meeting.id} order by name nulls first`
    : []
  const attendeeIds = attendees.filter((a) => a.user_id).map((a) => a.user_id).sort()
  chk(
    recording && !!meeting && meeting.provider === 'zoom' && meeting.join_url === LINK && meeting.created_by === auth.user.id &&
      meeting.transcript === `${anaName}: We ship the launch on Friday ${TAG}.\nGuest Speaker: Sounds good.` &&
      JSON.stringify(attendeeIds) === JSON.stringify([auth.user.id, ana.user.id].sort()) &&
      attendees.some((a) => !a.user_id && a.name === 'Guest Speaker'),
    'once the bot’s recording is done its meeting is written: the transcript as who said what, the members who spoke as attendees and anybody else by name',
    JSON.stringify({ recording, written: written ?? null, meeting: meeting ? { ...meeting, transcript: meeting.transcript?.slice(0, 120) } : null, attendees }),
  )

  // ══ 6. THE INBOX ═══════════════════════════════════════════════════════════
  const [notice] = meeting
    ? await sql`select type::text as type, title from notifications where user_id = ${auth.user.id} and workspace_id = ${WS} and type = 'meeting_notes_ready' order by created_at desc limit 1`
    : []
  const inbox = await A(`/notifications?workspaceId=${WS}&types=meeting_notes_ready`)
  const fromInbox = (Array.isArray(inbox.data) ? inbox.data : inbox.data?.items ?? []).find((n) => n.type === 'meeting_notes_ready')
  chk(
    !!notice && /Meeting notes are ready/.test(notice.title) && !!fromInbox && JSON.stringify(fromInbox).includes(`meeting=${meeting?.id}`),
    'and its owner is told in the Inbox, the notice opening the meeting',
    JSON.stringify({ notice: notice ?? null, inbox: fromInbox ? { type: fromInbox.type, title: fromInbox.title } : said(inbox) }),
  )

  // ══ 7. OPEN NOTES ══════════════════════════════════════════════════════════
  const notesLink = page.getByTestId(`notetaker-notes-${sentRun?.id}`)
  const shown = await waitUntil(() => notesLink.isVisible().catch(() => false), { timeoutMs: 15_000 })
  await notesLink.click({ timeout: 5000 }).catch(() => {})
  const opened = meeting
    ? await waitUntil(async () => (await page.getByTestId(`meeting-${meeting.id}`).getAttribute('data-highlighted', { timeout: 2000 }).catch(() => null)) === 'true', { timeoutMs: 15_000 })
    : false
  chk(
    shown && opened && page.url().includes(`meeting=${meeting?.id}`),
    'the visit, done, opens the notes it wrote',
    JSON.stringify({ shown, opened, at: page.url() }),
  )

  // ══ 8. CALLED BACK ═════════════════════════════════════════════════════════
  console.log('\n▶ a visit called back, and its owner’s alone')
  // ══ 9 first: a colleague sees none of it, and cannot call it back.
  const anas = await ANA(`/workspaces/${WS}/notetaker`)
  const anaCancel = calRun ? await ANA(`/workspaces/${WS}/notetaker/runs/${calRun.id}`, { method: 'DELETE' }) : { status: 0 }
  chk(
    anas.ok && Array.isArray(anas.data?.runs) && anas.data.runs.length === 0 && anas.data.calendars?.length === 0 && anaCancel.status === 404,
    'a person’s visits and calendars are theirs: a colleague sees none of them, and cannot call one back',
    JSON.stringify({ runs: anas.data?.runs?.length ?? said(anas), calendars: anas.data?.calendars?.length, cancel: anaCancel.status }),
  )
  await page.goto(`${B}/app/${WS}/meetings`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId(`notetaker-cancel-${calRun?.id}`).click({ timeout: 15_000 }).catch(() => {})
  const cancelled = calRun
    ? await waitUntil(async () => (await sql`select status from notetaker_bots where id = ${calRun.id}`)[0]?.status === 'cancelled', { timeoutMs: 15_000 })
    : false
  const unscheduled = calBot ? (await bots()).find((b) => b.id === calBot.id)?.removed === true : false
  // The calendar is looked at every two seconds here: a visit called back is not sent again.
  await new Promise((r) => setTimeout(r, 5000))
  const again = await sql`select count(*)::int as n from notetaker_bots where workspace_id = ${WS} and calendar_event_id = ${EV.id}`
  const toStub = (await bots()).filter((b) => b.meeting_url === CAL_LINK).length
  chk(
    cancelled && unscheduled && again[0].n === 1 && toStub === 1,
    'a scheduled visit is called back — unscheduled at the service — and is not sent again',
    JSON.stringify({ cancelled, unscheduled, rows: again[0].n, bots: toStub }),
  )

  // ══ 10. A BOT THE SERVICE GIVES UP ON ══════════════════════════════════════
  const second = await A(`/workspaces/${WS}/notetaker/runs`, { method: 'POST', body: { meetingUrl: `https://teams.live.com/meet/${stamp}` } })
  const secondBot = (await bots()).find((b) => b.meeting_url === `https://teams.live.com/meet/${stamp}`)
  if (secondBot) {
    await control(`/__control/recall/bots/${secondBot.id}`, { code: 'joining_call' })
    await control(`/__control/recall/bots/${secondBot.id}`, { code: 'fatal', sub_code: 'meeting_not_found' })
  }
  const failedRun = second.ok
    ? await waitUntil(async () => {
        const r = (await A(`/workspaces/${WS}/notetaker`)).data?.runs?.find((x) => x.id === second.data.id)
        return r?.status === 'failed' ? r : null
      }, { timeoutMs: 20_000 })
    : null
  chk(
    !!failedRun && failedRun.statusDetail === 'meeting_not_found' && failedRun.platform === 'teams',
    'a bot the service gives up on is said to have failed, with the service’s reason',
    JSON.stringify({ sent: second.ok ? second.data.status : said(second), failed: failedRun ?? null }),
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  // The stubs are the lane's, shared by every later run: a reset that did not answer is said, not swallowed.
  await control('/__control/recall/reset', {}).then(
    () => {},
    (e) => console.log(`  cleanup: the media stub did not reset — ${e.message}`),
  )
  await forgetCalendar(CAL, TOKEN).catch((e) => console.log(`  cleanup: the calendar stub did not forget — ${e.message}`))
  const leftBehind = []
  for (const { id, as } of workspacesMade) {
    const gone = await as(`/workspaces/${id}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) leftBehind.push(`DELETE workspace ${id} answered ${gone.status}`)
  }
  if (leftBehind.length) console.log(`  cleanup left behind: ${leftBehind.join('; ')}`)
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
