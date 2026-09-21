/**
 * §V2-14 — more than one calendar account, and they belong to a person.
 *
 * `[13:32]`–`[13:38]` "'Manage Account' pe click karoongi … 'Add Account' … aur
 * jitna chahoon main add kar sakti hoon." Frame `13:50` is the Accounts page:
 * the connected account with a `…` menu, + Add account, then **Default
 * calendar** and **Busy calendars**.
 *
 * WHAT WAS WRONG, and it is worse than "only one".
 * `workspace_integration_connections` is unique on (workspace_id, provider) and
 * the OAuth callback UPSERTS on that key — so connecting a second Google
 * account never failed, it silently OVERWROTE the first. The first check below
 * demonstrates that against the real table, so the bug this item fixes is on
 * the record rather than described.
 *
 * THE TWO FLAGS ARE DIFFERENT IN KIND, which is what "primary and secondary"
 * means: `isDefault` is where events are WRITTEN and there can be only one;
 * `countsAsBusy` is whether a calendar is READ for availability and any number
 * may be. Checks below pin both, including that the database — not just the
 * service — refuses two defaults.
 *
 * AND TOKENS MUST NOT LEAVE. These rows hold OAuth refresh tokens for somebody's
 * personal Google account. A response that carried one would look completely
 * ordinary, so it is asserted directly.
 *
 * ACCOUNTS ARE INSERTED DIRECTLY, because the only way to create one for real
 * is a Google OAuth grant and this environment has no credentials. So these
 * checks cover the ownership, the flags and the API — not the OAuth exchange,
 * which is the provider's half.
 *
 *   node test/e2e/calendar-accounts.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
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
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`) }
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

const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let sql = null
const TAG = `e2e-cal-${Date.now()}`

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const me = (await A('/users/me')).data
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite cannot stage calendar grants')

  const accounts = () => A(`/workspaces/${workspaceId}/calendar-sync/accounts`)
  const stage = (externalId, email) => sql`
    insert into user_calendar_accounts
      (user_id, workspace_id, provider, external_account_id, external_account_email,
       access_token, refresh_token, is_default, counts_as_busy)
    values (${me.id}, ${workspaceId}, 'gcal', ${`${TAG}-${externalId}`}, ${email},
            ${'ACCESS-' + TAG}, ${'REFRESH-' + TAG},
            ${externalId === 'a'}, true)
    returning id
  `

  /*
   * THE OLD BEHAVIOUR, demonstrated rather than described. The workspace table
   * is unique on (workspace_id, provider), so the second row cannot exist — a
   * second account could only ever replace the first.
   */
  console.log('\n▶ §V2-14 — why a second account could never be added before')
  let evicted = false
  try {
    await sql`
      insert into workspace_integration_connections (workspace_id, provider, status)
      values (${workspaceId}, ${`${TAG}-probe`}, 'connected')
    `
    await sql`
      insert into workspace_integration_connections (workspace_id, provider, status)
      values (${workspaceId}, ${`${TAG}-probe`}, 'connected')
    `
  } catch {
    evicted = true
  }
  await sql`delete from workspace_integration_connections where provider = ${`${TAG}-probe`}`
  chk(
    evicted,
    'the old workspace table still allows only one connection per provider',
    'a second workspace connection inserted cleanly — then the eviction this item fixes ' +
      'was never real, and the reasoning behind the new table is wrong',
  )

  console.log('\n▶ a person can connect more than one')
  const first = (await stage('a', `work-${TAG}@example.com`))[0]
  const second = (await stage('b', `personal-${TAG}@example.com`))[0]
  let list = (await accounts()).data ?? []
  const mine = list.filter((a) => (a.externalAccountEmail ?? '').includes(TAG))
  chk(
    mine.length === 2,
    'both accounts are listed',
    `${mine.length} of 2 came back — ${JSON.stringify(list).slice(0, 160)}`,
  )
  chk(
    mine.some((a) => a.externalAccountEmail?.startsWith('work-')) &&
      mine.some((a) => a.externalAccountEmail?.startsWith('personal-')),
    'and they are the two different addresses, not one twice',
    `they came back as ${JSON.stringify(mine.map((a) => a.externalAccountEmail))}`,
  )

  /*
   * THE CHECK THAT MATTERS MOST HERE. A refresh token in this response would
   * look exactly like an ordinary payload, and would hand any reader long-lived
   * access to somebody's personal Google account.
   */
  console.log('\n▶ and their tokens never leave the API')
  const raw = JSON.stringify(list)
  chk(
    !raw.includes('ACCESS-') && !raw.includes('REFRESH-'),
    'no access or refresh token is in the response',
    'a token was returned by the accounts endpoint — that is long-lived access to a personal Google account',
  )
  chk(
    !('accessToken' in (mine[0] ?? {})) && !('refreshToken' in (mine[0] ?? {})),
    'and the fields are absent rather than blanked',
    `the row carried ${JSON.stringify(Object.keys(mine[0] ?? {}))}`,
  )

  console.log('\n▶ "Default calendar" — one, and only one')
  chk(
    mine.filter((a) => a.isDefault).length === 1,
    'exactly one account is the default',
    `${mine.filter((a) => a.isDefault).length} accounts claimed to be the default`,
  )
  const moved = await A(`/workspaces/${workspaceId}/calendar-sync/accounts/${second.id}/default`, { method: 'POST' })
  chk(moved.status === 200 || moved.status === 201, 'the default can be moved',
    `setting the default returned ${moved.status} ${JSON.stringify(moved.error)}`)
  list = (await accounts()).data ?? []
  const after = list.filter((a) => (a.externalAccountEmail ?? '').includes(TAG))
  chk(
    after.find((a) => a.id === second.id)?.isDefault === true &&
      after.find((a) => a.id === first.id)?.isDefault === false,
    'and moving it takes it away from the other one',
    `defaults are now ${JSON.stringify(after.map((a) => [a.externalAccountEmail, a.isDefault]))}`,
  )

  /*
   * Enforced by the DATABASE, not only by the service. A partial unique index
   * means a future endpoint that forgets to clear the old default fails loudly
   * instead of leaving two rows claiming to be where events go.
   */
  let twoDefaults = false
  try {
    await sql`update user_calendar_accounts set is_default = true where id = ${first.id}`
  } catch {
    twoDefaults = true
  }
  chk(
    twoDefaults,
    'and the database itself refuses a second default',
    'two accounts were both marked default — the partial unique index is not doing its job, ' +
      'so any endpoint that forgets to clear the old one leaves the write target ambiguous',
  )

  console.log('\n▶ "Busy calendars" — any number of them')
  const off = await A(`/workspaces/${workspaceId}/calendar-sync/accounts/${first.id}/busy`, {
    method: 'PATCH', body: { countsAsBusy: false },
  })
  chk(off.status === 200 || off.status === 201, 'an account can stop counting as busy',
    `it returned ${off.status}`)
  list = (await accounts()).data ?? []
  const busyNow = list.filter((a) => (a.externalAccountEmail ?? '').includes(TAG))
  chk(
    busyNow.find((a) => a.id === first.id)?.countsAsBusy === false &&
      busyNow.find((a) => a.id === second.id)?.countsAsBusy === true,
    'without touching the other, because any number may be busy',
    `busy flags are ${JSON.stringify(busyNow.map((a) => [a.externalAccountEmail, a.countsAsBusy]))}`,
  )

  /*
   * A calendar account holds a token for somebody's personal Google account, so
   * the id in a URL must never be enough on its own.
   */
  console.log('\n▶ somebody else’s account is not yours to touch')
  const otherEmail = `calpeer-${Date.now()}@rundesk.invalid`
  const otherPass = 'CalPeer@123!'
  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: otherEmail, displayName: `Cal Peer`, password: otherPass }),
  })
  if (!reg.ok) throw new Error(`could not register a second person: ${reg.status}`)
  await A(`/workspaces/${workspaceId}/members`, { method: 'POST', body: { email: otherEmail, role: 'member' } })
  const asOther = apiAs((await signInApi(API, otherEmail, otherPass)).accessToken)

  const theirs = (await asOther(`/workspaces/${workspaceId}/calendar-sync/accounts`)).data ?? []
  chk(
    theirs.length === 0,
    'a colleague sees none of my calendars',
    `they saw ${theirs.length} — calendar accounts are leaking across people`,
  )
  const steal = await asOther(`/workspaces/${workspaceId}/calendar-sync/accounts/${first.id}`, { method: 'DELETE' })
  chk(
    steal.status === 404,
    'and cannot disconnect one of mine',
    `deleting my account as somebody else returned ${steal.status} — it must be a 404, both because ` +
      'they may not do it and because they should not learn that it exists',
  )

  console.log('\n▶ disconnecting hands the default on')
  await A(`/workspaces/${workspaceId}/calendar-sync/accounts/${second.id}`, { method: 'DELETE' })
  list = (await accounts()).data ?? []
  const left = list.filter((a) => (a.externalAccountEmail ?? '').includes(TAG))
  chk(
    left.length === 1 && left[0].isDefault === true,
    'removing the default promotes the one that is left',
    `after removing the default, ${left.length} remain and default is ` +
      `${JSON.stringify(left.map((a) => a.isDefault))} — a person with calendars and no default writes nowhere`,
  )
  // ── The Accounts page, frame `13:50` ─────────────────────────────────────
  console.log('\n\u25b6 the Accounts page in Planner settings')
  // Re-stage, because the checks above disconnected one and promoted the other.
  await sql`delete from user_calendar_accounts where external_account_id like ${TAG + '%'}`
  await stage('a', `work-${TAG}@example.com`)
  await stage('b', `personal-${TAG}@example.com`)

  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(`${stack.base}/app/${workspaceId}/calendar`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="planner-page"]', { timeout: 20_000 })
  await page.getByTestId('planner-settings').click()
  await page.getByTestId('planner-settings-nav-accounts').click({ timeout: 10_000 })

  const shown = await waitUntil(
    async () => (await page.getByTestId('planner-account-row').count()) >= 2,
    { timeoutMs: 15_000 },
  )
  chk(
    shown,
    'both accounts are on the page — the nav item is no longer a dead page',
    `the Accounts page listed ${await page.getByTestId('planner-account-row').count()} accounts`,
  )

  chk(
    (await page.getByTestId('planner-account-default-on').count()) === 1,
    'exactly one is marked as where new events go',
    `${await page.getByTestId('planner-account-default-on').count()} rows claimed to be the default`,
  )

  /*
   * DRIVEN FROM THE PAGE, then read back from the API. A settings control that
   * saves and reads back without changing anything is this codebase's most
   * common defect, so the assertion is on the stored state rather than on the
   * button having moved.
   */
  await page.getByTestId('planner-account-make-default').first().click()
  const flipped = await waitUntil(async () => {
    const rows = ((await accounts()).data ?? []).filter((a) => (a.externalAccountEmail ?? '').includes(TAG))
    return rows.some((a) => a.isDefault && a.externalAccountEmail?.startsWith('personal-'))
  }, { timeoutMs: 15_000 })
  chk(
    flipped,
    'and pressing the other one really moves it, in the database',
    'the button changed the page and not the account — a settings control attached to nothing',
  )

  await page.getByTestId('planner-account-busy').first().click()
  const busyChanged = await waitUntil(async () => {
    const rows = ((await accounts()).data ?? []).filter((a) => (a.externalAccountEmail ?? '').includes(TAG))
    return rows.some((a) => a.countsAsBusy === false)
  }, { timeoutMs: 15_000 })
  chk(busyChanged, 'and a calendar can be told to stop counting as busy',
    'toggling busy on the page changed nothing behind it')

  chk(
    await page.getByTestId('planner-account-add').isVisible().catch(() => false),
    'with "Add account" on the page, as the frame has it',
    'there is no way to add a second account from here',
  )

  // ── §V2-14c "These calendars decide when you're busy", frame `13:50` ──────
  /*
   * WHAT THESE CHECKS CAN AND CANNOT SEE. There are no Google credentials in
   * this environment, so nothing here reaches Google's freeBusy endpoint — the
   * staged accounts carry deliberately bogus tokens. What IS proven: that the
   * endpoint answers with a merged `busy` list at all, that a window can never
   * carry what somebody is doing, that overlapping time merges rather than
   * stacking, that a calendar with a dead token degrades to Rundesk's own time
   * instead of taking the panel down with it, and that the planner reads the
   * new field rather than the old one. The provider's half is the provider's.
   */
  console.log('\n▶ §V2-14c — busy time is the union, and it says nothing about what')
  const base = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  base.setUTCHours(9, 0, 0, 0)
  const at = (h) => new Date(base.getTime() + h * 3_600_000).toISOString()
  const meet = async (title, startsAt, endsAt) => {
    const [m] = await sql`
      insert into meetings (workspace_id, title, starts_at, ends_at, tags)
      values (${workspaceId}, ${title}, ${startsAt}, ${endsAt}, ${[TAG]})
      returning id
    `
    await sql`insert into meeting_attendees (meeting_id, user_id) values (${m.id}, ${me.id})`
    return m.id
  }
  // 9–10:30 and 10–11 overlap and must become ONE window; 14–15 stays its own.
  await meet(`MRI results ${TAG}`, at(0), at(1.5))
  await meet(`Overlapping ${TAG}`, at(1), at(2))
  await meet(`Separate ${TAG}`, at(5), at(6))

  const range = `?from=${at(-1)}&to=${at(8)}`
  const cal = await A(`/workspaces/${workspaceId}/people/${me.id}/calendar${range}`)
  chk(
    cal.status === 200 && Array.isArray(cal.data?.busy),
    'the calendar endpoint answers with busy time at all',
    `it returned ${cal.status} and busy was ${JSON.stringify(cal.data?.busy)} — before this item ` +
      'the only availability anyone could see was Rundesk meetings, so a colleague blocked ' +
      'out in their own Google Calendar read as free',
  )
  const busy = cal.data?.busy ?? []
  chk(
    busy.length === 2,
    'two overlapping meetings and one apart make two windows, not three',
    `it returned ${busy.length}: ${JSON.stringify(busy)} — unmerged windows offer a free ` +
      'minute at the seam that does not exist',
  )
  chk(
    busy[0]?.startsAt === at(0) && busy[0]?.endsAt === at(2),
    'and the merged one runs from the first start to the last end',
    `the first window was ${JSON.stringify(busy[0])}, expected ${at(0)}–${at(2)}`,
  )

  /*
   * THE PRIVACY RULE AT THE HTTP BOUNDARY. The unit test asserts the shape of
   * the type; this asserts the shape of what actually went over the wire, and
   * it is the one that would catch a controller that helpfully enriched it.
   */
  const shapes = busy.map((w) => Object.keys(w).sort().join(','))
  chk(
    // `.every` on an empty list is true, and an empty list is what a
    // not-yet-restarted API returns — so the length is part of the claim.
    shapes.length > 0 && shapes.every((s) => s === 'endsAt,source,startsAt'),
    'a busy window carries when, and nothing about what',
    `windows came back shaped ${JSON.stringify(shapes)} — a personal calendar says things ` +
      'like "MRI results", and a colleague is entitled to know you are busy and to nothing else',
  )
  chk(
    busy.length > 0 && !JSON.stringify(busy).includes('MRI results'),
    'so the title of a meeting is nowhere in the busy list',
    'a meeting title reached the busy list, which is exactly the leak this shape prevents',
  )

  /*
   * The degradation guarantee. Those staged accounts count as busy and hold
   * tokens that cannot work, which is what a revoked grant looks like from
   * here. The answer must still be Rundesk's own time.
   */
  chk(
    // Deliberately NOT `busy.length === 2`: that is the merge's job, asserted
    // above, and folding it in here would make one break report two faults.
    busy.length > 0 && (cal.data?.meetings ?? []).length >= 3,
    'a calendar whose token no longer works costs its own busy time and nothing else',
    `Rundesk’s own half came back as ${(cal.data?.meetings ?? []).length} meetings and ` +
      `${busy.length} busy windows — an unreadable external calendar took the panel down with it`,
  )

  console.log('\n▶ and the planner draws that union, not just Rundesk’s half')
  /*
   * THE CHECK HAS TO DISTINGUISH, or it proves nothing. The page falls back to
   * `meetings` when an older API returns no `busy`, and that fallback ALSO
   * produces hatched blocks with a source — so counting blocks would pass on
   * the very code this item replaces.
   *
   * Two OVERLAPPING meetings separate the two readings cleanly, but only if
   * the check counts BLOCKS. The tooltip does not discriminate: it names every
   * meeting overlapping the window it is on, so under the fallback both blocks
   * name both meetings and a "names them both" assertion passes on the code
   * this replaces. Merged draws ONE block mentioning Alpha; unmerged draws two.
   * Counting only the blocks that mention this run's own fixture keeps other
   * suites' meetings out of the number.
   *
   * They are staged for today rather than for the deterministic window above,
   * because the planner asks for the week it is showing.
   */
  const noon = new Date()
  noon.setHours(12, 0, 0, 0)
  const todayAt = (h) => new Date(noon.getTime() + h * 3_600_000).toISOString()
  await meet(`Alpha ${TAG}`, todayAt(0), todayAt(1.5))
  await meet(`Beta ${TAG}`, todayAt(1), todayAt(2))

  await page.goto(`${stack.base}/app/${workspaceId}/calendar`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="planner-page"]', { timeout: 20_000 })
  // The needle is whatever the page itself would show for me, because the
  // search matches on `displayName || email` and guessing which is a flake.
  const members = (await A(`/workspaces/${workspaceId}/members`)).data ?? []
  const mineRow = members.find((m) => (m.userId ?? m.user?.id) === me.id)
  await page.getByTestId('planner-meet-with').fill(mineRow?.displayName || mineRow?.email || ME.email)
  await page.getByTestId('planner-meet-result').first().click({ timeout: 15_000 })

  const titleOf = () =>
    page.locator('[data-testid="planner-busy-block"]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('title') ?? ''),
    )
  const mineOnly = async () => (await titleOf()).filter((x) => x.includes(`Alpha ${TAG}`))
  const merged = await waitUntil(async () => (await mineOnly()).length === 1, { timeoutMs: 15_000 })
  chk(
    merged,
    'two overlapping meetings become one hatched block, and it names them both',
    `${(await mineOnly()).length} blocks covered this run's fixture: ${JSON.stringify(await mineOnly())} — ` +
      'two means the page is still reading `meetings`, and everything built for this item ' +
      'is an endpoint nobody calls',
  )
  chk(
    (await mineOnly())[0]?.includes(`Beta ${TAG}`) === true,
    'and the names of Rundesk’s own meetings survive the merge',
    `the merged block read ${JSON.stringify((await mineOnly())[0])} — dropping to "busy" for ` +
      'time this workspace can explain hides something the viewer is allowed to read',
  )
  chk(
    (await page.locator('[data-busy-source="rundesk"]').count()) > 0,
    'and each block says where the time came from, so external time can be drawn apart',
    'no block carried a source',
  )

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ §V2-14d the calendar picker, frame `13:28` — grouped by account')

  /*
   * The frame: a group headed with the ACCOUNT'S ADDRESS holding its
   * calendars, then a group headed with the WORKSPACE'S NAME holding exactly
   * **Time off** and **Holidays**, then **Manage accounts**. The chip beside
   * it reads `1` over four rows with one ticked — a count of what is ON.
   */
  await page.getByTestId('planner-calendars-toggle').click()
  await page.waitForSelector('[data-testid="planner-calendars-menu"]', { timeout: 10_000 })

  const groupKinds = await page
    .locator('[data-testid="planner-calendar-group"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-group-kind')))
  const workspaceRows = await page
    .locator('[data-testid="planner-calendar-group"][data-group-kind="workspace"] [data-testid="planner-calendar-row"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-calendar-id')))
  chk(
    groupKinds.filter((k) => k === 'account').length >= 1 &&
      groupKinds.at(-1) === 'workspace' &&
      JSON.stringify(workspaceRows) ===
        JSON.stringify(['workspace:timeOff', 'workspace:holidays']),
    'the picker groups the connected accounts first and the workspace calendars last, ' +
      'and the workspace group holds exactly Time off and Holidays',
    `the groups were ${JSON.stringify(groupKinds)} and the workspace group held ` +
      `${JSON.stringify(workspaceRows)} — frame \`13:28\` puts the workspace's own two beneath ` +
      'the external ones, and a picker missing them is the row this closes',
  )

  /*
   * THE CHIP IS A COUNT OF WHAT IS ON. Counted against the ticked rows the
   * popover itself is showing, which is the only comparison that can fail: a
   * badge rendering the NUMBER OF ROWS is the facade class — correct-looking,
   * and incapable of ever saying anything else.
   */
  const chipBefore = Number((await page.getByTestId('planner-calendars-count').textContent())?.trim())
  const tickedBefore = await page
    .locator('[data-testid="planner-calendar-row"][data-checked="true"]')
    .count()
  const totalRows = await page.locator('[data-testid="planner-calendar-row"]').count()
  chk(
    Number.isFinite(chipBefore) && chipBefore === tickedBefore && totalRows > tickedBefore,
    `the chip counts the calendars that are ON — ${chipBefore} of ${totalRows} rows`,
    `the chip read ${chipBefore} against ${tickedBefore} ticked of ${totalRows} rows; equal to the ` +
      'row count would mean it is rendering the list length and can never say anything else',
  )

  /* Unticking one has to STICK and has to move the chip — a checkbox whose
   * only effect is local state is the dead control, and one whose only effect
   * is a stored row is its mirror. */
  await page.getByTestId('planner-calendar-check-workspace:holidays').click()
  const chipFell = await waitUntil(
    async () =>
      Number((await page.getByTestId('planner-calendars-count').textContent())?.trim()) ===
      chipBefore - 1,
    { timeoutMs: 10_000 },
  )
  const stored = (await A(`/planner/${workspaceId}/settings`)).data ?? {}
  chk(
    chipFell && (stored.hiddenCalendarIds ?? []).includes('workspace:holidays'),
    'unticking Holidays drops the chip by one and is remembered on the account',
    `the chip read ${(await page.getByTestId('planner-calendars-count').textContent())?.trim()} and the ` +
      `stored settings were ${JSON.stringify(stored.hiddenCalendarIds ?? null)}`,
  )

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ §V2-14e Conferencing, frame `13:36` — the Zoom row')

  await page.keyboard.press('Escape')
  await page.getByTestId('planner-settings').click()
  await page.getByTestId('planner-settings-nav-accounts').click({ timeout: 10_000 })
  await page.waitForSelector('[data-testid="planner-conferencing"]', { timeout: 10_000 })

  chk(
    (await page.getByTestId('planner-conferencing-zoom').count()) === 1 &&
      ((await page.getByTestId('planner-conferencing-connect').count()) +
        (await page.getByTestId('planner-conferencing-disconnect').count())) === 1,
    'the Accounts page ends in a Conferencing section with a Zoom row and exactly one action',
    'the Conferencing row frame `13:36` draws was missing, or offered Connect and Disconnect at once',
  )

  /*
   * IT IS THE SAME FACT THE APP CENTER HOLDS, asked of the server directly.
   *
   * The risk this row carried was a second "is Zoom connected?" answer kept
   * beside the calendar settings — two surfaces disagreeing about whether an
   * integration somebody relies on is live. So the row's state is compared
   * against `integrations/connections`, which is what the App Center reads.
   *
   * AND THE MESSAGE, NOT THE STATUS. `oauth/start` answers 400 both when the
   * server has no Zoom credentials and when the caller may not connect apps —
   * one status for two mechanisms, which cannot tell them apart. `.status` is
   * checked explicitly because `apiAs` never throws: it returns
   * `{status, data, error}`, so a `.catch` here would be inert and a failed
   * call would read as success.
   */
  const conns = await A(`/workspaces/${workspaceId}/integrations/connections`)
  const zoomLive =
    conns.status === 200 &&
    (conns.data ?? []).some((c) => c.provider === 'zoom' && c.status === 'connected')
  const rowSaysConnected =
    (await page.getByTestId('planner-conferencing-zoom').getAttribute('data-connected')) === 'true'
  const started = await A(
    `/workspaces/${workspaceId}/integrations/connections/zoom/oauth/start`,
    { method: 'POST' },
  )
  const reason = String(started.error?.message ?? started.error ?? '')
  chk(
    conns.status === 200 &&
      rowSaysConnected === zoomLive &&
      (started.status === 200 ||
        (started.status === 400 && /zoom|not configured|client/i.test(reason))),
    `the row agrees with the App Center (connected: ${zoomLive}), and the connect flow either ` +
      `starts or refuses for a Zoom reason — ${started.status}${reason ? ` ${JSON.stringify(reason)}` : ''}`,
    `connections answered ${conns.status}, the row said connected=${rowSaysConnected} against ` +
      `${zoomLive}, and oauth/start answered ${started.status} ${JSON.stringify(reason)} — a 400 ` +
      'with a generic message could equally be a permission refusal, which is a different bug',
  )

} catch (e) {
  const lines = e.message.split('\n')
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${lines[0]}`)
} finally {
  if (sql) {
    await sql`delete from user_calendar_accounts where external_account_id like ${TAG + '%'}`.catch(() => {})
    await sql`delete from workspace_integration_connections where provider like ${TAG + '%'}`.catch(() => {})
    // Attendees first: the fixture meetings are tagged, and leaving them behind
    // would put busy time on this user's calendar in every later run.
    await sql`
      delete from meeting_attendees
       where meeting_id in (select id from meetings where ${TAG} = any(tags))
    `.catch(() => {})
    await sql`delete from meetings where ${TAG} = any(tags)`.catch(() => {})
    /*
     * §V2-14d — put the calendar picker back.
     *
     * This suite unticks Holidays, and `plannerSettings` is a column on the
     * SHARED fixture user rather than a tagged row that can be deleted. Left
     * behind, every later run of every planner suite would start with a
     * workspace calendar switched off — a fixture that quietly changes the
     * product for the next suite is the "one runner at a time" trap arriving
     * by a different door. Only this key is touched, so a setting some other
     * suite left is not disturbed.
     */
    await sql`
      update users
         set planner_settings = coalesce(planner_settings, '{}'::jsonb) - 'hiddenCalendarIds'
       where email = ${ME.email}
    `.catch(() => {})
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
