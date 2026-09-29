/**
 * §V2-06 `[07:20]` — ClickApps are gated by the PLAN.
 *
 * > "ClickUp Apps is also dependent on that — ke aap ke paas PACKAGE PLAN
 * > kaun sa hai."
 * > `[07:24]` "[Free] mein of course apna option LIMITED hota hai, lekin agar
 * > aap jaate ho [premium ki taraf]…"
 *
 * The video never opens the ClickApps panel — frame `07:20` shows only the
 * collapsed row, "Tags, Time Estimates, Priority, Time Tracking, Incomplete
 * Warning, Custom Fields, Milest…". So the SET is not readable from the
 * pixels and the transcript is the whole requirement, which is why this suite
 * is about the LADDER and not about a count: fewer on free, more when you pay.
 *
 * WHAT WAS THERE BEFORE. Gating on a space's ClickApps was by
 * `packages/feature-flags` and never by plan. Plans were a separate,
 * unconnected system: `@RequirePlan` was used in exactly one controller, and
 * `resolvePlanConfig` failed open to enterprise without saying so.
 *
 * THE LOAD-BEARING CHECK IS THE SERVER ONE. A padlock drawn in the wizard is
 * not a gate — `curl` does not render padlocks. So this asserts, first and
 * foremost, that `POST /spaces` and `PUT /spaces/:id` REFUSE a gated ClickApp
 * for a free-plan workspace, and that a workspace that is merely READ after a
 * downgrade stops seeing it too. The browser half comes after, and only says
 * that the UI agrees with the server it cannot overrule.
 *
 * FIXTURES: this run makes its OWN workspace and puts THAT on the free plan.
 * The e2e database is shared and every other suite runs against the seeded
 * workspace, which is `enterprise`; moving that one to free would take Custom
 * Fields away from whatever else is running.
 *
 *   node test/e2e/clickapps-plan-gating.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login, pickWorkspace } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'

const chromium = await resolveChromium()
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". Exact, so a skipped branch is a failure. */
const EXPECTED_CHECKS = 15

const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const REPO = path.resolve(import.meta.dirname, '../..')
const TAG = `capg-${Date.now()}`

/** The ladder, as `space-presets.ts` writes it. Free reaches the first two. */
const FREE_CLICKAPPS = ['priority', 'tags']
const PRO_CLICKAPPS = ['customFields', 'milestones']
const BUSINESS_CLICKAPPS = ['wipLimits', 'listEmail']
const ALL_CLICKAPPS = [...FREE_CLICKAPPS, ...PRO_CLICKAPPS, ...BUSINESS_CLICKAPPS]

let stack = null
let B = (process.env.BASE ?? '').replace(/\/$/, '')
if (!B) {
  stack = await startLocalStack({
    dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')),
    apiPort: Number(argOf('--api', process.env.E2E_API_PORT ?? 3011)),
  })
  B = stack.base
}

const results = []
const ok = (m) => { results.push(1); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push(0); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
// THE SENTENCE, THEN THE REASON: a failing check that printed only its reason
// named no check `check-break-reddened.mjs` could find when the reason was
// built from the run (`found-29-sep/failing-checks-print-only-their-reason`).
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg && badMsg !== good ? `${good} \u2014 ${badMsg}` : good))

const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
const api = apiClient(`${B}/api/v1`, auth.accessToken)
/** The seeded workspace, left on its own plan — the control group. */
const PAID_WS = process.env.E2E_WS ?? (await pickWorkspace(api)).id

/*
 * This run's own workspace, on the free plan. Every status below is read
 * explicitly: the fixture's `apiClient` NEVER THROWS — it returns
 * {status, data, error} — so a refused setup step would otherwise sail on and
 * the gating checks would pass against an enterprise workspace, reporting the
 * opposite of the truth.
 */
const wsRes = await api('/workspaces', { method: 'POST', body: { name: `Free plan ${TAG}` } })
const FREE_WS = wsRes.data?.workspace?.id ?? wsRes.data?.id
if (wsRes.status >= 400 || !FREE_WS) {
  throw new Error(`could not create this suite's workspace: ${wsRes.status} ${JSON.stringify(wsRes.error)}`)
}
const planSet = await api(`/workspaces/${FREE_WS}/plan`, { method: 'PATCH', body: { plan: 'free' } })
if (planSet.status >= 400) {
  throw new Error(`could not put this suite's workspace on the free plan: ${planSet.status} ${JSON.stringify(planSet.error)}`)
}
console.log(`\x1b[2m  free workspace ${FREE_WS}, paid (control) workspace ${PAID_WS}\x1b[0m`)

const madeSpaces = []
const makeSpace = async (workspaceId, body) => {
  const res = await api('/spaces', { method: 'POST', body: { workspaceId, ...body } })
  if (res.data?.id) madeSpaces.push(res.data.id)
  return res
}

const browser = await chromium.launch(launchOptions())
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
const page = await ctx.newPage()

try {
  console.log('\n▶ the plan decides which ClickApps exist for this workspace')
  const free = await api(`/space-presets/${FREE_WS}`)
  chk(
    free.status === 200 && free.data?.plan?.id === 'free' &&
      JSON.stringify(free.data?.allowedFeatures) === JSON.stringify(FREE_CLICKAPPS),
    `a free workspace is offered exactly ${FREE_CLICKAPPS.join(' and ')}`,
    `status ${free.status}, plan ${JSON.stringify(free.data?.plan?.id)}, ` +
      `allowed ${JSON.stringify(free.data?.allowedFeatures)}`,
  )
  const lockedByKey = Object.fromEntries((free.data?.lockedFeatures ?? []).map((r) => [r.key, r]))
  chk(
    PRO_CLICKAPPS.every((k) => lockedByKey[k]?.requiresLabel === 'Pro') &&
      BUSINESS_CLICKAPPS.every((k) => lockedByKey[k]?.requiresLabel === 'Business') &&
      Object.keys(lockedByKey).length === PRO_CLICKAPPS.length + BUSINESS_CLICKAPPS.length,
    'and told, per ClickApp, which tier would unlock it — Pro for two, Business for two',
    `lockedFeatures came back ${JSON.stringify(free.data?.lockedFeatures)}`,
  )

  const paid = await api(`/space-presets/${PAID_WS}`)
  chk(
    paid.status === 200 && (paid.data?.lockedFeatures ?? []).length === 0 &&
      JSON.stringify(paid.data?.allowedFeatures) === JSON.stringify(ALL_CLICKAPPS),
    'while the seeded (enterprise) workspace is gated on nothing — §14.1\'s invariant holds',
    `status ${paid.status}, plan ${JSON.stringify(paid.data?.plan?.id)}, ` +
      `locked ${JSON.stringify(paid.data?.lockedFeatures)}`,
  )

  console.log('\n▶ the SERVER refuses a gated ClickApp — a padlock is not a gate')
  const refused = await makeSpace(FREE_WS, {
    name: `Refused ${TAG}`,
    features: ['priority', 'customFields'],
  })
  chk(
    refused.status === 403,
    'POST /spaces asking for Custom Fields on a free plan is refused with 403',
    `it answered ${refused.status} — the gate is client-side only, which is no gate at all`,
  )
  chk(
    typeof refused.error?.message === 'string' && /customFields/.test(refused.error.message) &&
      /Pro/.test(refused.error.message),
    'and the refusal names the ClickApp and the tier that would allow it',
    `the message was ${JSON.stringify(refused.error?.message)}`,
  )

  const allowed = await makeSpace(FREE_WS, { name: `Allowed ${TAG}`, features: FREE_CLICKAPPS })
  chk(
    allowed.status < 400 && allowed.data?.features?.priority === true &&
      allowed.data?.features?.customFields === false,
    'asking only for what the plan reaches succeeds, with the rest stored as off',
    `status ${allowed.status}, features ${JSON.stringify(allowed.data?.features)}`,
  )

  /*
   * A PRESET IS NOT A REQUEST. "Marketing Teams" wants Custom Fields and
   * Email-to-List; refusing the card would make three of frame 07:06's four
   * un-clickable on free and blame the person for choosing one. So a preset is
   * FILTERED where an explicit array is refused — and the filter has to be
   * real, or the space comes out claiming a ClickApp its plan does not have.
   */
  const preset = await makeSpace(FREE_WS, { name: `Preset ${TAG}`, presetKey: 'marketing' })
  chk(
    preset.status < 400 && preset.data?.features?.tags === true &&
      preset.data?.features?.customFields === false && preset.data?.features?.listEmail === false,
    'a preset that wants a gated ClickApp is narrowed, not refused — the card stays choosable',
    `status ${preset.status}, features ${JSON.stringify(preset.data?.features)}`,
  )

  console.log('\n▶ and the gate holds on the way back in, and on the way out')
  const target = allowed.data?.id
  const putGated = await api(`/spaces/${target}`, {
    method: 'PUT',
    body: { features: { priority: true, tags: true, customFields: true } },
  })
  chk(
    putGated.status === 403,
    'PUT /spaces/:id cannot switch a gated ClickApp on either',
    `it answered ${putGated.status} — a gate that only fires on create is bypassed by creating then editing`,
  )

  const putAllowed = await api(`/spaces/${target}`, {
    method: 'PUT',
    body: { features: { priority: true, tags: false } },
  })
  const afterPut = await api(`/spaces/${target}`)
  chk(
    putAllowed.status < 400 && afterPut.status === 200 &&
      afterPut.data?.features?.priority === true && afterPut.data?.features?.tags === false,
    'and an ALLOWED change through PUT is actually written — it used to be silently dropped',
    `PUT ${putAllowed.status}, GET ${afterPut.status}, features ${JSON.stringify(afterPut.data?.features)}`,
  )

  /*
   * THE READ-TIME HALF. A space made with no feature map at all means "every
   * switch on" — on a free plan that answer has to come back narrowed, or the
   * gate only ever applied at the moment of choosing and a downgrade changes
   * nothing a person can see.
   */
  const legacy = await makeSpace(FREE_WS, { name: `Legacy ${TAG}` })
  chk(legacy.status < 400 && legacy.data?.features === null,
    'a space made without a preset stores no feature map (the pre-column shape)',
    `status ${legacy.status}, features ${JSON.stringify(legacy.data?.features)}`)
  const listed = await api(`/spaces/workspace/${FREE_WS}`)
  const legacyRow = (listed.data ?? []).find((s) => s.id === legacy.data?.id)
  chk(
    listed.status === 200 && legacyRow?.features?.priority === true &&
      legacyRow?.features?.customFields === false,
    'yet reading it back on a free plan reports Custom Fields OFF — the gate applies to readers',
    `status ${listed.status}, the row came back with ${JSON.stringify(legacyRow?.features)}`,
  )

  const paidSpace = await makeSpace(PAID_WS, {
    name: `Control ${TAG}`,
    features: ['priority', 'customFields', 'wipLimits'],
  })
  chk(
    paidSpace.status < 400 && paidSpace.data?.features?.customFields === true &&
      paidSpace.data?.features?.wipLimits === true,
    'the same request against the enterprise workspace is allowed — nothing existing was taken away',
    `status ${paidSpace.status}, features ${JSON.stringify(paidSpace.data?.features)}`,
  )

  console.log('\n▶ and the wizard says so, rather than offering a switch the server will refuse')
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  await page.goto(`${B}/app/${FREE_WS}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="nav-new-space"]', { timeout: 30_000 })
  await page.getByTestId('nav-new-space').click()
  await page.waitForSelector('[data-testid="space-wizard-step1"]', { timeout: 20_000 })
  await page.getByTestId('space-wizard-name').fill(`UI ${TAG}`)
  await page.getByTestId('space-wizard-continue').click()
  await page.waitForSelector('[data-testid="space-wizard-step2"]', { timeout: 15_000 })
  await page.getByTestId('space-wizard-row-features').click()
  await page.waitForSelector('[data-testid="space-wizard-features"]', { timeout: 15_000 })

  const lockedRows = await page.locator('[data-testid^="space-wizard-clickapp-lock-"]').evaluateAll((els) =>
    els.map((e) => (e.getAttribute('data-testid') ?? '').replace('space-wizard-clickapp-lock-', '')),
  )
  chk(
    JSON.stringify([...lockedRows].sort()) ===
      JSON.stringify([...PRO_CLICKAPPS, ...BUSINESS_CLICKAPPS].sort()),
    'the panel padlocks exactly the four this plan cannot reach',
    `it padlocked ${JSON.stringify(lockedRows)}`,
  )
  // `.catch` because `clickapps-plan-gating-8-nolockpayload` sends no lock
  // payload, so there is no badge to read: this waited out the default
  // timeout, threw, and ended the run at 14 of 15.
  const proBadge = (
    await page.getByTestId('space-wizard-clickapp-lock-customFields').innerText().catch(() => '')
  ).trim()
  // The badge read above was bounded for `-8-nolockpayload` and these two were
  // left bare — each of them read TWICE, once in the condition and once in the
  // message, and a `chk` message is evaluated whether the check passes or
  // fails. `null` is neither `true` nor `false`, so an absent switch fails this
  // check in a sentence instead of replacing it with an exception.
  const cfDisabled = await page
    .getByTestId('space-wizard-feature-customFields')
    .isDisabled({ timeout: 6000 })
    .catch(() => null)
  const prioDisabled = await page
    .getByTestId('space-wizard-feature-priority')
    .isDisabled({ timeout: 6000 })
    .catch(() => null)
  chk(
    proBadge === 'Pro' && cfDisabled === true && prioDisabled === false,
    'Custom Fields is marked "Pro" and un-switchable, while Priority stays switchable',
    `the badge read ${JSON.stringify(proBadge)}, customFields disabled=` +
      `${JSON.stringify(cfDisabled)}, priority disabled=${JSON.stringify(prioDisabled)}`,
  )
  const note = await page.getByTestId('space-wizard-plan-note').innerText().catch(() => '')
  chk(
    /Free/.test(note),
    'and the panel says which plan you are on, rather than leaving four grey rows to explain themselves',
    `the note read ${JSON.stringify(note)}`,
  )
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
  await page.screenshot({ path: '/tmp/claude-0/shots/clickapps-plan-gating-fail.png', fullPage: true }).catch(() => {})
} finally {
  for (const id of madeSpaces.reverse()) {
    await api(`/spaces/${id}`, { method: 'DELETE' })
  }
  const delWs = await api(`/workspaces/${FREE_WS}`, { method: 'DELETE' })
  if (delWs.status >= 400) console.log(`\x1b[2m  could not clean up workspace ${FREE_WS} (${delWs.status})\x1b[0m`)
  await browser.close().catch(() => {})
}

const failed = () => results.filter((x) => !x).length
if (results.length !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${results.length} checks, expected ${EXPECTED_CHECKS}`)
  results.push(0)
}
console.log(`\n${results.length - failed()} passed, ${failed()} failed`)
await stack?.close?.()
process.exit(failed() ? 1 : 0)
