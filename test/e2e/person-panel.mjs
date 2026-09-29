/**
 * §G06 [05:35–06:35] — the person profile panel.
 *
 * A full minute of the walkthrough on one panel, and six of the 157 gaps in
 * it. The API is checked separately; what needs a browser is that the panel
 * exists, opens over whatever page you were on, and answers her six questions
 * — and, specifically, that it renders BELOW 1280px, because the member card
 * it replaced was `hidden xl:flex` and simply did not exist for anybody on a
 * laptop.
 *
 *   node test/e2e/person-panel.mjs --api 3011 --dist apps/web/dist
 *   BASE=https://rundesk.theaura.agency node test/e2e/person-panel.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { readText } from './lib/wait.mjs'
import { makeChain } from './lib/chain.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const require_ = createRequire(path.join(REPO, 'noop.cjs'))

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

const BASE = (process.env.BASE ?? argOf('--base', '')).replace(/\/$/, '')
const REMOTE = BASE.length > 0
const HOST = REMOTE ? new URL(BASE).hostname : ''
const IS_LOOPBACK = REMOTE && /^(127\.|localhost$|\[?::1)/.test(HOST)

const fromEnvFile = (key) => {
  try {
    const txt = fs.readFileSync(path.join(REPO, '.env'), 'utf8')
    return new RegExp(`^${key}=(.*)$`, 'm').exec(txt)?.[1].trim().replace(/^["']|["']$/g, '') || null
  } catch {
    return null
  }
}

const API_PORT =
  Number(process.env.API_HOST_PORT) ||
  Number(argOf('--api', '')) ||
  (REMOTE ? Number(fromEnvFile('API_HOST_PORT')) || 3010 : 3011)
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))

const PW_DIRS = [
  process.env.PLAYWRIGHT_DIR,
  '/opt/rundesk-pw/node_modules',
  `${process.env.HOME ?? '/root'}/.rundesk-pw/node_modules`,
  '/usr/lib/node_modules',
].filter(Boolean)

let chromium
for (const id of ['playwright', '@playwright/test', 'playwright-core']) {
  try {
    ;({ chromium } = require_(id))
  } catch {
    /* next */
  }
  if (chromium) break
}
if (!chromium) {
  for (const dir of PW_DIRS) {
    for (const entry of ['playwright/index.mjs', 'playwright/index.js']) {
      const file = `${dir}/${entry}`
      if (!fs.existsSync(file)) continue
      try {
        ;({ chromium } = await import(pathToFileURL(file).href))
      } catch {
        /* try the next */
      }
      if (chromium) break
    }
    if (chromium) break
  }
}
if (!chromium) {
  console.error(
    '\x1b[31m✗ playwright is not installed anywhere this script can see.\x1b[0m\n' +
      `  Searched: ${PW_DIRS.join(', ')}\n` +
      '  Exiting 2 rather than reporting checks nobody ran.',
  )
  process.exit(2)
}

const CHROME = process.env.CHROME || process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const LAUNCH = {
  ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}),
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    ...(REMOTE && !IS_LOOPBACK ? [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`] : []),
  ],
}

let passed = 0
let failed = 0
const check = (ok, label, detail = '') => {
  if (ok) {
    passed++
    console.log(`  PASS  ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}


const chain = makeChain(check)
/** Raise this when checks are added — a suite that quietly shrinks reads as green. */
const EXPECTED_CHECKS = 60

const ADMIN = {
  email: process.env.RUNDESK_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.RUNDESK_PASSWORD ?? 'Admin@123!',
}

const API = `http://127.0.0.1:${API_PORT}/api/v1`

const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

const done = async (browser, stack, restore) => {
  // The timezone, priorities and time off are the admin's, and so every later
  // suite's: putting them back is part of this run. The restore returns its answers.
  let refused
  try {
    refused = ((await restore?.()) ?? []).filter((res) => res.status >= 300 && res.status !== 404).map((res) => res.status)
  } catch (err) {
    refused = [`no answer (${err?.message ?? err})`]
  }
  check(refused.length === 0, 'and the timezone, priorities and time off this run changed are put back', `refused: ${refused.join(', ')}`)
  await browser?.close().catch(() => {})
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

let browser
let stack
let restore

try {
  try {
    const ping = await fetch(`${API}/health`)
    if (!ping.ok) throw new Error(`health returned ${ping.status}`)
  } catch (err) {
    console.error(
      `\x1b[31m✗ no API on 127.0.0.1:${API_PORT}\x1b[0m — ${err.message}\n` +
        '  Start one there, or pass --api <port> / API_HOST_PORT=<port>.',
    )
    process.exit(2)
  }

  const admin = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(admin.accessToken)
  const workspaceId = admin.workspaces[0].id
  const meId = admin.user?.id ?? admin.id
  // Somewhere to seed the bucket fixtures; the panel reads across the whole
  // workspace, so any list in it will do.
  const bucketSpaces = await A(`/spaces/workspace/${workspaceId}`)
  const bucketProjects = await A(`/projects/space/${bucketSpaces.data?.[0]?.id}`)
  const bucketLists = await A(`/lists/project/${bucketProjects.data?.[0]?.id}`)
  const bucketListId = bucketLists.data?.[0]?.id

  // A known timezone, so the clock check is about rendering rather than about
  // whatever this account happened to be set to.
  const before = await A('/users/me')
  const priorTz = before.data?.timezone ?? null
  await A('/users/me', { method: 'PATCH', body: { timezone: 'Asia/Karachi' } })
  restore = async () => {
    const answers = []
    if (priorTz) answers.push(await A('/users/me', { method: 'PATCH', body: { timezone: priorTz } }))
    const mine = await A(`/workspaces/${workspaceId}/priorities`)
    answers.push(mine)
    for (const p of mine.data ?? []) {
      answers.push(await A(`/workspaces/${workspaceId}/priorities/${p.id}`, { method: 'DELETE' }))
    }
    // A run that dies mid-section must not leave this account booked away.
    const leave = await A(`/workspaces/${workspaceId}/time-off`)
    answers.push(leave)
    for (const e of leave.data ?? []) {
      if (e.userId === meId) answers.push(await A(`/workspaces/${workspaceId}/time-off/${e.id}`, { method: 'DELETE' }))
    }
    return answers
  }
  // Start from an empty list so the empty state is checkable.
  const existing = await A(`/workspaces/${workspaceId}/priorities`)
  for (const p of existing.data ?? []) {
    await A(`/workspaces/${workspaceId}/priorities/${p.id}`, { method: 'DELETE' })
  }

  const origin = REMOTE
    ? BASE
    : await (async () => {
        stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
        return stack.base
      })()

  browser = await chromium.launch(LAUNCH)
  /*
   * 1100px wide, on purpose.
   *
   * The card this panel replaced was `hidden xl:flex` — it did not render
   * below 1280px at all, so clicking a name on a 13" laptop did nothing. A
   * suite that runs at 1680 would pass on the old code too.
   */
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 } })).newPage()
  await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(`${origin}/app/${workspaceId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)

  // ---------------------------------------------------------------------
  console.log('\n▶ §G06 [05:43] — the panel exists, and opens over the page')
  // ---------------------------------------------------------------------
  const urlBefore = page.url()
  await page.getByTestId('user-menu').click()
  await page.waitForTimeout(900)
  check(
    await page.getByTestId('menu-my-profile').isVisible().catch(() => false),
    'the avatar menu offers a profile that is not account settings',
  )
  await page.getByTestId('menu-my-profile').click({ timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(1800)

  const panel = page.getByTestId('person-panel')
  check(await panel.isVisible().catch(() => false), 'the panel opens')
  check(page.url() === urlBefore, 'over the page you were on — no navigation, no lost place', page.url())
  // `boundingBox()` THROWS when the locator matches nothing — it waits for the
  // element first — and returns null only for one that exists with no box. Every
  // check below reads the size through `?? 0` or a null test, so absence reports
  // as zero and reddens; unguarded it spent thirty seconds and ended the section
  // (ledger §10).
  const box = await panel.boundingBox({ timeout: 6000 }).catch(() => null)
  check((box?.width ?? 0) > 300, 'and it renders at 1100px, where the old card did not exist', `${box?.width}`)

  // ---------------------------------------------------------------------
  console.log('\n▶ …and answers what she asked it to')
  // ---------------------------------------------------------------------
  check(await page.getByTestId('person-name').isVisible().catch(() => false), 'it names the person')
  // The email is drawn only once the person's profile has answered (the name's
  // slot is there from the start, holding a skeleton), so it is waited for —
  // bounded — rather than read the moment the panel opens, which a sweep's load
  // outran (`found-24-sep/three-suites-fail-under-a-full-sweep`).
  await page.getByTestId('person-email').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  check(await page.getByTestId('person-email').isVisible().catch(() => false), 'shows their email')
  // §G06 [05:46] — "mera TIME ZONE kya chal raha hai".
  const clock = await page.getByTestId('person-local-time').innerText().catch(() => '')
  check(/\d/.test(clock), 'and their LOCAL TIME as a clock, not a zone name', clock)
  check(
    await page.getByTestId('person-reporting').isVisible().catch(() => false),
    'the reporting line is a section on the person (§G06 [06:28])',
  )
  check(
    (await page.getByTestId('person-no-manager').isVisible().catch(() => false)) ||
      (await page.getByTestId('person-manager').isVisible().catch(() => false)),
    '"No manager" is rendered as an answer, not left blank',
  )

  /*
   * ---------------------------------------------------------------------
   * G05-8 [05:43] — "+ Add time off", the first row of her Activity tab.
   *
   * Time off was fully built — schema, service, controller — and its only way
   * in was a collapsed accordion inside the workload heat map. Nobody opens a
   * capacity chart to say "I'm out on Friday". This is the class of defect
   * where reading the diff convinces you it works, so every assertion below
   * that claims something was saved reads it back off the API.
   * ---------------------------------------------------------------------
   */
  console.log('\n▶ G05-8 [05:43] — time off, from the profile rather than the heat map')
  // Start clean: a leftover entry would make the empty state unassertable and
  // would let the "it saved" check pass on somebody else's row.
  const priorLeave = await A(`/workspaces/${workspaceId}/time-off`)
  for (const e of priorLeave.data ?? []) {
    if (e.userId === meId) await A(`/workspaces/${workspaceId}/time-off/${e.id}`, { method: 'DELETE' })
  }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page.getByTestId('user-menu').click({ timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(900)
  await page.getByTestId('menu-my-profile').click({ timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(2000)

  check(
    await page.getByTestId('person-time-off').isVisible().catch(() => false),
    'time off is a section on the profile, not only on the workload page',
  )
  check(
    await page.getByTestId('person-time-off-empty').isVisible().catch(() => false),
    'with nothing booked it says so rather than showing an empty box',
  )

  // The frames put "+ Add time off" on the row itself, not behind a tab.
  check(
    await page.getByTestId('person-time-off-add').isVisible().catch(() => false),
    'and "Add time off" is offered right there',
  )
  await page.getByTestId('person-time-off-add').click({ timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(500)
  check(
    await page.getByTestId('person-time-off-form').isVisible().catch(() => false),
    'which opens the dates rather than sending you to another page',
  )

  // Two known days, far enough out that no seeded fixture collides with them.
  const away = new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-CA')
  const back = new Date(Date.now() + 32 * 86400000).toLocaleDateString('en-CA')
  await page.getByTestId('person-time-off-from').fill(away)
  await page.getByTestId('person-time-off-to').fill(back)
  await page.getByTestId('person-time-off-save').click()
  await page.waitForTimeout(2200)

  const savedLeave = await A(`/workspaces/${workspaceId}/time-off`)
  const savedRow = (savedLeave.data ?? []).find(
    (e) => e.userId === meId && e.startsOn === away && e.endsOn === back,
  )
  check(
    !!savedRow,
    'booking it from the profile actually stores it',
    JSON.stringify((savedLeave.data ?? []).map((e) => [e.startsOn, e.endsOn])).slice(0, 160),
  )
  check(
    (await page.getByTestId('person-time-off-list').innerText().catch(() => '')).includes(away),
    'and the panel shows the days back, without a reload',
  )

  /*
   * AND A BACKWARDS RANGE IS REFUSED IN WORDS.
   *
   * `time-off.service.ts` refuses `endsOn < startsOn` with "endsOn must not be
   * before startsOn", and migration 0090 also carries
   * `CONSTRAINT time_off_range_check CHECK (ends_on >= starts_on)` — so
   * AllExceptionsFilter would answer 400 with "A value failed a database
   * constraint" even with the service check gone. Neither the refusal nor the
   * sentence was tested at all; the service check is the only thing that tells
   * somebody which of the two dates to change.
   *
   * Sent through the API rather than the form, because a date input that
   * refuses to hold a backwards range client-side would make this untestable
   * from the page without saying so.
   */
  const backwards = await A(`/workspaces/${workspaceId}/time-off`, {
    method: 'POST',
    body: { userId: meId, startsOn: back, endsOn: away },
  })
  if (backwards.data?.id) {
    await A(`/workspaces/${workspaceId}/time-off/${backwards.data.id}`, { method: 'DELETE' })
  }
  check(
    backwards.status >= 400 && backwards.status < 500,
    'time off that ends before it starts is refused',
    `it answered ${backwards.status} and stored ${JSON.stringify(backwards.data ?? null)}`,
  )
  check(
    /must not be before/i.test(JSON.stringify(backwards.error ?? '')),
    'and says which of the two dates is wrong, rather than naming a constraint',
    `it said ${JSON.stringify(backwards.error)} — a database-constraint message here leaves ` +
      'somebody staring at two date fields with no idea which one to move',
  )

  const removal = chain('and taking it back off removes it too — plans change')
  if (savedRow) {
    await page.getByTestId(`person-time-off-remove-${savedRow.id}`).click()
    await page.waitForTimeout(2000)
    const afterRemove = await A(`/workspaces/${workspaceId}/time-off`)
    removal.step(
      afterRemove.status === 200 && !(afterRemove.data ?? []).some((e) => e.id === savedRow.id),
      `the time off list (${afterRemove.status}) still holds ${savedRow.id}`,
    )
  } else {
    removal.rest('skipped: nothing was saved to remove')
  }

  // ---------------------------------------------------------------------
  console.log('\n▶ §G06 [05:54] — Priorities, the one thing that is a decision')
  // ---------------------------------------------------------------------
  check(
    await page.getByTestId('person-priorities').isVisible().catch(() => false),
    'Priorities is the tab it opens on',
  )
  const emptyText = await readText(page.getByTestId('person-priorities'))
  check(/most important/i.test(emptyText), 'the empty state invites you to add them', emptyText.slice(0, 90))

  await page.getByTestId('priority-input').fill('Ship the release')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2000)
  const stored = await A(`/workspaces/${workspaceId}/priorities`)
  check(
    (stored.data ?? []).some((p) => p.title === 'Ship the release'),
    'typing one and pressing Enter stores it',
    JSON.stringify((stored.data ?? []).map((p) => p.title)),
  )

  const first = (stored.data ?? [])[0]
  await page.getByTestId(`priority-done-${first.id}`).click()
  await page.waitForTimeout(1800)
  const afterDone = await A(`/workspaces/${workspaceId}/priorities`)
  const doneRow = (afterDone.data ?? []).find((p) => p.id === first.id)
  check(!!doneRow?.doneAt, 'ticking one off marks it done')
  check(!!doneRow, 'and it stays on the list — "I did that today" survives')

  // ---------------------------------------------------------------------
  console.log('\n▶ §G06 [06:00] / [06:22] — activity and calendar')
  // ---------------------------------------------------------------------
  await page.getByTestId('person-tab-activity').click()
  await page.waitForTimeout(1500)
  check(await page.getByTestId('person-activity').isVisible().catch(() => false), 'the activity feed opens')
  check(
    await page.getByTestId('activity-search').isVisible().catch(() => false),
    'with the search box the frames show on its header',
  )

  await page.getByTestId('person-tab-calendar').click()
  await page.waitForTimeout(1500)
  check(await page.getByTestId('person-calendar').isVisible().catch(() => false), 'and a calendar for the person')

  // ---------------------------------------------------------------------
  console.log('\n▶ it closes without taking you anywhere')
  // ---------------------------------------------------------------------
  await page.keyboard.press('Escape')
  await page.waitForTimeout(800)
  /*
   * §G05 [06:08–06:14] — the buckets she names, in her order.
   *
   * > "TODAY ke kya task hain, OVERDUE kaun se ho gaye the, NEXT kaun se
   * >  upcoming task mere paas aa sakte hain, kaun si aisi cheezein jo maine
   * >  CREATE ki hain par abhi tak maine kisi ko assign nahi kiya."
   *
   * The panel showed one flat "Working on" list, which answers none of those
   * four questions. Seeded here rather than hoped for: a bucket check against
   * whatever work happens to exist passes for the wrong reason on an empty
   * account and fails for the wrong reason on a busy one.
   */
  const now = new Date()

  /**
   * MIDDAY today in a given timezone, as an instant.
   *
   * The buckets are computed in the PERSON'S zone — deliberately, and the
   * service says so: *"'Today' is today WHERE THEY ARE … a deadline is a fact
   * about their day, not about the server's."* This suite sets that zone to
   * Asia/Karachi a few lines above, and then built its "due today" fixture from
   * `new Date(y, m, d, 14, 0)` — 14:00 in the CONTAINER's zone.
   *
   * Those are the same day for nineteen hours out of twenty-four and different
   * for the other five. From 19:00 UTC (midnight in Karachi) the container's
   * "today 14:00" is already yesterday for the person, so the task landed in
   * OVERDUE and two checks failed — on a docs-only commit, which is what made
   * it look like flake rather than a fixture that has always been wrong after
   * 19:00 UTC.
   *
   * Shifting from the current instant rather than constructing a local date
   * keeps it correct across DST. "Midday" rather than "noon" because a
   * spring-forward day lands on 13:00 — checked over a year of samples in
   * seven zones (incl. Lord Howe's 30-minute and Chatham's 45-minute offsets):
   * the hour stays within 10:00-14:00 and the DAY, which is the only thing
   * this fixture needs, is never wrong.
   */
  const middayIn = (zone) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      })
        .formatToParts(now)
        .filter((p) => p.type !== 'literal')
        .map((p) => [p.type, p.value]),
    )
    const minutesFromNoon = (12 - (Number(parts.hour) % 24)) * 60 - Number(parts.minute)
    return new Date(now.getTime() + minutesFromNoon * 60_000)
  }

  const seedTask = async (title, dueDate, assign) => {
    const created = await A('/tasks', {
      method: 'POST',
      body: { listId: bucketListId, title, ...(dueDate ? { dueDate } : {}) },
    })
    if (assign && created.data?.id) {
      await A(`/tasks/${created.data.id}/assignees`, { method: 'POST', body: { userId: meId } })
    }
    return created.data
  }
  // Midday in the zone this suite set on the account, so "today" means the
  // same thing to the fixture and to the service.
  const bToday = await seedTask(`bucket today ${Date.now()}`, middayIn('Asia/Karachi').toISOString(), true)
  // ±4 days: further than any timezone offset can move a boundary, so these two
  // do not need the same care.
  const bOver = await seedTask(`bucket overdue ${Date.now()}`,
    new Date(now.getTime() - 4 * 86400000).toISOString(), true)
  const bNext = await seedTask(`bucket next ${Date.now()}`,
    new Date(now.getTime() + 4 * 86400000).toISOString(), true)
  const bMine = await seedTask(`bucket unassigned ${Date.now()}`, null, false)

  const profile = await A(`/workspaces/${workspaceId}/people/${meId}`)
  const buckets = profile.data?.taskBuckets
  const bucketChain = chain(
    'a profile answers with task buckets, not one flat list',
    'TODAY holds what is due today',
    'OVERDUE holds what has already passed',
    'NEXT holds what is coming',
    'and "created, not assigned to anyone" is its own question',
    'a task with an assignee is not counted as unassigned',
  )
  bucketChain.step(Boolean(buckets), 'the profile returned no taskBuckets at all')
  if (!buckets) {
    bucketChain.rest('skipped: there were no buckets to look in')
  } else {
    const holds = (key, id) => (buckets[key] ?? []).some((row) => row.id === id)
    bucketChain.step(holds('today', bToday?.id), 'the seeded due-today task is not in TODAY')
    bucketChain.step(holds('overdue', bOver?.id), 'the seeded overdue task is not in OVERDUE')
    bucketChain.step(holds('next', bNext?.id), 'the seeded upcoming task is not in NEXT')
    bucketChain.step(holds('createdUnassigned', bMine?.id),
      'the seeded unassigned task is not in createdUnassigned')
    // The one that would quietly be wrong: anything with an assignee on it is
    // somebody's, and must not appear in the pile that is sitting on nobody.
    bucketChain.step(!holds('createdUnassigned', bToday?.id),
      'an assigned task is sitting in the unassigned pile')
  }

  /*
   * The bug the four checks above could only catch by accident.
   *
   * The buckets were computed by fetching the 25 earliest-due assigned tasks
   * and splitting THAT PAGE four ways in JavaScript. Sorted by due date
   * ascending, the page fills with the oldest overdue work first — so on any
   * account with 25+ dated tasks, NEXT and UNSCHEDULED were structurally
   * unreachable, not merely short. Measured on a working account before the
   * fix: 18 overdue + 7 today = 25, `next: 0` while upcoming work existed.
   *
   * The checks above only caught it because this database had accumulated
   * enough tasks; on a fresh one they would have passed over the same bug. So
   * this seeds past the limit deliberately, and cleans up after itself — a
   * regression check that does not depend on how old the database is.
   */
  const CROWD = 25
  const crowd = []
  for (let i = 0; i < CROWD; i++) {
    crowd.push(
      await seedTask(
        `bucket crowd ${i} ${Date.now()}`,
        new Date(now.getTime() - (10 + i) * 86400000).toISOString(),
        true,
      ),
    )
  }
  const crowded = await A(`/workspaces/${workspaceId}/people/${meId}`)
  const crowdedBuckets = crowded.data?.taskBuckets
  check(
    (crowdedBuckets?.next ?? []).some((row) => row.id === bNext?.id),
    `NEXT survives ${CROWD} overdue tasks ahead of it in the sort`,
    `next held ${(crowdedBuckets?.next ?? []).length} rows and not the seeded one`,
  )
  check(
    (crowdedBuckets?.unscheduled ?? []).length > 0 || (crowdedBuckets?.overdue ?? []).length >= CROWD,
    'and each bucket is filled on its own, not carved out of one shared page',
    `overdue held ${(crowdedBuckets?.overdue ?? []).length} of ${CROWD}+ seeded`,
  )
  for (const t of crowd) {
    if (t?.id) await A(`/tasks/${t.id}`, { method: 'DELETE' })
  }

  /*
   * ---------------------------------------------------------------------
   * G05-4 [06:08] — Done and Delegated
   *
   * The other two buckets she counts off. `done` deliberately breaks the
   * "open work only" filter every other bucket uses — that IS the bucket:
   * what did this person actually finish. `delegated` is the mirror of
   * createdUnassigned: things you made and handed to somebody else, so the
   * two together answer accountability in both directions — what I passed on,
   * and what I dropped.
   *
   * Both are driven with fixtures rather than read off ambient data: an empty
   * bucket and a bucket whose query is wrong look identical from outside.
   * ---------------------------------------------------------------------
   */
  // Still tolerant of there being no second account: the checks below say so
  // out loud rather than the suite dying on it.
  const otherForBuckets = await signInApi(
    API,
    process.env.RUNDESK_EMAIL_2 ?? 'org-admin@rundesk.internal',
    process.env.RUNDESK_PASSWORD_2 ?? 'OrgAdmin@123!',
  ).catch(() => null)

  /*
   * SIX CHECKS WHICHEVER WAY THIS GOES, UNDER THEIR OWN SENTENCES. Without the
   * second account this used to report six sentences about the fixture — "a
   * second account to delegate to", "so DONE was never driven" — that no
   * passing run prints, so a failure could not be matched to the check it
   * stood in for. The reason belongs in the detail.
   */
  const handedOver = chain(
    'DELEGATED holds what you handed to somebody else',
    'DONE holds what you actually finished',
    'and a task you created and kept is not "delegated"',
    'and DONE holds only finished work, not everything assigned to you',
    'and one you assigned to nobody is dropped, not delegated',
    'and finished work is not still counted as owed',
  )
  if (!otherForBuckets?.user?.id) {
    handedOver.rest('skipped: could not sign in as the second user, so there was nobody to delegate to')
  } else {
    // Delegated: created by me, assigned to somebody who is not me.
    const bDelegated = await seedTask(`bucket delegated ${Date.now()}`, null, false)
    await A(`/tasks/${bDelegated.id}/assignees`, {
      method: 'POST',
      body: { userId: otherForBuckets.user.id },
    })
    // Done: assigned to me, then finished.
    const bDone = await seedTask(`bucket done ${Date.now()}`, null, true)
    await A(`/tasks/${bDone.id}`, { method: 'PATCH', body: { status: 'done' } })

    const withBoth = await A(`/workspaces/${workspaceId}/people/${meId}`)
    const b2 = withBoth.data?.taskBuckets ?? {}
    const holds2 = (key, id) => (b2[key] ?? []).some((row) => row.id === id)

    handedOver.step(holds2('delegated', bDelegated.id), 'the delegated task is not in DELEGATED')
    handedOver.step(holds2('done', bDone.id), 'the finished task is not in DONE')
    /*
     * The distinction that would be easy to get wrong: a task you created and
     * kept is your own work, not something you delegated. Without the
     * "somebody who is not you is on it" clause, every task you made would
     * appear here.
     */
    /*
     * Driven with an OPEN task you created and kept — `bToday` — not the done
     * one.
     *
     * Using bDone made this check unable to fail: `delegated` excludes
     * finished work anyway, so deleting the "nobody who is me is on it" clause
     * changed nothing about it. A break test caught that; the fixture has to
     * be something delegated would otherwise be willing to include.
     */
    handedOver.step(!holds2('delegated', bToday?.id), 'your own work is being counted as handed over')
    /*
     * And DONE must mean finished. Asserting only that the finished task is
     * present leaves the bucket free to contain everything else too — which is
     * exactly what dropping the closed-status filter does.
     */
    handedOver.step(!holds2('done', bToday?.id), 'an open task is being reported as done')
    /*
     * The other half of the same distinction, and the one a "nobody who is me
     * is on it" clause alone would get wrong: a task you created and assigned
     * to NOBODY was not delegated — it was dropped, which is what
     * createdUnassigned is for. Without an "somebody IS on it" clause the two
     * buckets would show the same rows.
     */
    handedOver.step(
      !holds2('delegated', bMine?.id) && holds2('createdUnassigned', bMine?.id),
      'created-unassigned work is being counted as handed over',
    )
    // …and DONE must not leak into the buckets that mean "still owed".
    handedOver.step(
      !holds2('today', bDone.id) && !holds2('overdue', bDone.id) && !holds2('unscheduled', bDone.id),
      'a done task is still sitting in an open bucket',
    )
    await A(`/tasks/${bDelegated.id}`, { method: 'DELETE' })
    await A(`/tasks/${bDone.id}`, { method: 'DELETE' })
  }

  /*
   * A task you deleted must stop being work you owe.
   *
   * Deleting a task archives the row rather than removing it, and the bucket
   * queries filtered on `status` alone — so deleted work kept appearing on the
   * profile as due today, with nothing you could do about it from here. The
   * createdUnassigned query had always excluded archived rows; the four
   * assigned buckets never did, which is why this went unnoticed.
   *
   * The delete is sent with no content-type header on purpose: Fastify rejects
   * a DELETE that declares a JSON body and sends none, which made an earlier
   * version of this check "pass" against tasks it had never actually deleted.
   */
  const bGone = await seedTask(
    `bucket deleted ${Date.now()}`,
    new Date(now.getTime() + 3 * 86400000).toISOString(),
    true,
  )
  const inAssignedBuckets = async () => {
    const p = await A(`/workspaces/${workspaceId}/people/${meId}`)
    const b = p.data?.taskBuckets ?? {}
    return [...(b.today ?? []), ...(b.overdue ?? []), ...(b.next ?? []), ...(b.unscheduled ?? [])]
      .some((row) => row.id === bGone?.id)
  }
  check(await inAssignedBuckets(), 'a task assigned to you shows up in a bucket to begin with')
  const gone = await A(`/tasks/${bGone.id}`, { method: 'DELETE' })
  check(gone.status === 200, 'and deleting it is accepted', `DELETE returned ${gone.status}`)
  check(
    !(await inAssignedBuckets()),
    'after which it is no longer work you owe',
    'a deleted task still shows on the profile as assigned work',
  )

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  await page.getByTestId('user-menu').click({ timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(900)
  await page.getByTestId('menu-my-profile').click({ timeout: 10_000 }).catch(() => {})
  // The buckets are drawn from the same profile answer as the email, in the same
  // render — so they are counted once the email is there (bounded), not 2.2
  // fixed seconds after the panel opened.
  await page.getByTestId('person-email').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  check((await page.locator('[data-testid^=person-bucket-]').count()) >= 4,
    'and the panel draws them as separate sections')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)

  // ---------------------------------------------------------------------
  console.log('\n▶ §G05 [05:40] — “✦ Get StandUp”')
  // ---------------------------------------------------------------------
  /*
   * The frames put a StandUp button beside the message icon and nothing in
   * Rundesk answered it. The daily briefing is about YOURSELF and arrives on a
   * schedule; the contribution report is a chart in another part of the app.
   * Neither is "what has this person been doing", pulled from their profile.
   *
   * Seeded rather than read off whatever exists. A standup checked against an
   * account's ambient work passes trivially on a busy workspace and silently
   * on an empty one — and "every bucket came back empty" is exactly how a
   * broken join reads, which is how the search regression earlier in this
   * engagement got as far as it did.
   */
  /*
   * The finished task carries a PAST due date, and that is the whole point of
   * it. Seeded without one, "a finished task is not also reported as overdue"
   * cannot fail: a task with no date never matches the overdue predicate, so
   * the check passed just as happily against a build with the closed-status
   * filter deleted. It was only worth anything once the fixture could actually
   * land in the wrong bucket.
   */
  const finished = await seedTask(
    `standup finished ${Date.now()}`,
    new Date(now.getTime() - 2 * 86400000).toISOString(),
    true,
  )
  const late = await seedTask(
    `standup late ${Date.now()}`,
    new Date(now.getTime() - 3 * 86400000).toISOString(),
    true,
  )
  // Closed through the API, so completedAt is set the way the app sets it.
  if (finished?.id) await A(`/tasks/${finished.id}`, { method: 'PATCH', body: { status: 'done' } })

  const standup = await A(`/workspaces/${workspaceId}/people/${meId}/standup`, {
    method: 'POST',
    body: { days: 7 },
  })
  check(standup.status === 200 || standup.status === 201, 'a standup can be asked for', `-> ${standup.status} ${JSON.stringify(standup.error ?? '').slice(0, 160)}`)

  const sd = standup.data
  check(
    typeof sd?.text === 'string' && sd.text.trim().length > 0,
    'and it answers with prose, with or without a model configured',
    `text was ${JSON.stringify(sd?.text)}`,
  )

  /*
   * The buckets, individually. A summary that says something plausible while
   * every list behind it is empty is the failure worth catching, and the
   * sentence alone cannot tell you which query is wrong.
   */
  const holdsTask = (bucket, id) => (sd?.data?.[bucket] ?? []).some((r) => r.id === id)
  check(holdsTask('done', finished?.id), 'work finished in the window is counted as finished', JSON.stringify(sd?.data?.done ?? []).slice(0, 160))
  check(holdsTask('overdue', late?.id), 'and work already past its date is counted as overdue', JSON.stringify(sd?.data?.overdue ?? []).slice(0, 160))
  check(!holdsTask('overdue', finished?.id), 'a task that is finished is not also reported as overdue')
  check(!holdsTask('active', finished?.id), 'and a finished task is not reported as still in progress')

  // The prose has to be about the same rows, or the panel is showing a
  // paragraph that its own data does not support.
  /*
   * Asked differently depending on who wrote it. Without a model the text is
   * the deterministic formatter's, so it MUST name the task — that is what
   * proves the rows reached it. With a model it is prose, and demanding an
   * exact title back would fail a deployment whose only sin is having an API
   * key; what can still be insisted on is that the model was not handed an
   * empty person, which is the wiring failure worth catching either way.
   */
  if (sd?.generated) {
    check(
      (sd?.text ?? '').trim().length > 20 && !/no recorded task activity/i.test(sd?.text ?? ''),
      'and the sentence was written from real work, not from an empty week',
      (sd?.text ?? '').slice(0, 200),
    )
  } else {
    check(
      !!finished?.title && (sd?.text ?? '').includes(finished.title),
      'and the sentence names the work it was written from',
      (sd?.text ?? '').slice(0, 200),
    )
  }

  // The one that says whether this is honest about itself.
  check(
    typeof sd?.generated === 'boolean',
    'and it says whether a model wrote it or the rows did',
    `generated was ${JSON.stringify(sd?.generated)}`,
  )

  // Somebody outside the workspace must not be able to pull it.
  const outsider = await fetch(`${API}/workspaces/${workspaceId}/people/${meId}/standup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ days: 7 }),
  })
  check(outsider.status === 401, 'and it is not readable without signing in', `-> ${outsider.status}`)

  // …and through the UI, which is where it was asked for.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  await page.getByTestId('user-menu').click({ timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(900)
  await page.getByTestId('menu-my-profile').click({ timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(2200)

  const standupBtn = page.getByTestId('person-standup')
  const hasBtn = await standupBtn.isVisible().catch(() => false)
  check(hasBtn, 'the profile panel offers it beside the message button')
  /*
   * THREE CHECKS EITHER WAY. With no button this reported one, where the path
   * with a button reports three, so a missing Get StandUp read as the run
   * stopping early — and "does not spend a model call before anybody asks" was
   * never reported at all on that path.
   */
  const standupPanel = chain(
    'and does not spend a model call before anybody asks',
    'and pressing it writes a summary into the panel',
    'with something actually in it',
  )
  if (!hasBtn) {
    standupPanel.rest('skipped: there was no Get StandUp button to press')
  } else {
    standupPanel.step(
      !(await page.getByTestId('person-standup-result').isVisible().catch(() => false)),
      'the summary was already on screen before the button was pressed',
    )
    await standupBtn.click()
    const wrote = await page
      .getByTestId('person-standup-result')
      .waitFor({ timeout: 25000 })
      .then(() => true)
      .catch(() => false)
    standupPanel.step(wrote, 'nothing appeared after pressing Get StandUp')
    if (!wrote) {
      standupPanel.rest('skipped: nothing was written, so there was nothing to read')
    } else {
      const shown = (await page.getByTestId('person-standup-result').innerText().catch(() => '')) ?? ''
      standupPanel.step(shown.trim().length > 10, JSON.stringify(shown.slice(0, 120)))
    }
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)

  for (const row of [bToday, bOver, bNext, bMine, finished, late]) {
    if (row?.id) await A(`/tasks/${row.id}`, { method: 'DELETE' })
  }

  check(!(await page.getByTestId('person-panel').isVisible().catch(() => false)), 'Escape closes it')
  check(page.url() === urlBefore, 'and you are still where you started', page.url())

  await done(browser, stack, restore)
} catch (err) {
  console.error(`\n\x1b[31m✗ ${err?.stack ?? err}\x1b[0m`)
  failed++
  await done(browser, stack, restore)
}
