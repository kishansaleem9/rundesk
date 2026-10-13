/**
 * AI CREDITS AND A PLAN'S FREE USES, AS CLICKUP WORKS THEM
 * (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`).
 *
 * ClickUp (help centre: "New plans and pricing options", "Which features are
 * included with the AI add-ons?", "Purchase or track ClickUp AI Super
 * Credits", "Views feature availability and limits"; read 12 October):
 *
 *   · each user brings a monthly number of AI credits, pooled across the
 *     workspace; they renew each month and do not roll over; a credit is a
 *     tenth of a cent, sold in $10 packs; the workspace is warned at 80% and at
 *     100%, and past 100% AI pauses until the month renews or credits are
 *     bought; the AI hub shows used, remaining and the share used, and admins
 *     add credits — a suggested amount or a custom one — and check out;
 *   · a Free plan has a number of uses of some paid features, which add up and
 *     never reset; spent, the feature is refused and nothing made is lost.
 *
 * Measured before it was built (main's lanes): there was no `/ai/credits`
 * (404), no credits on a call, AI never paused, and a plan without Team View
 * was refused it from the first use.
 *
 * A workspace of this run's own, on the Pro plan (1,000 credits a member):
 * Olga owns it, Mia and Max are members, Gus is a guest. Where a model
 * answers (a lane's stub) a call is read for what it cost; where none answers
 * (CI), for costing nothing. The same number of checks either way.
 *
 *   node test/e2e/ai-credits.mjs --api 3029 --dist /tmp/claude-0/dist-9
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 18

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const stamp = Date.now()
const TAG = `crd${stamp}`
const PASSWORD = 'AiCredits@12345!'

const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error, message, details}`. Every call site reads `status`. */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`

const now = new Date()
const renewsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the usage, purchases and uses are staged and read back by SQL')
  const owner = await signUpApi(API, { fullName: `olga ${stamp}`, email: `${TAG}-olga@rundesk.invalid`, password: PASSWORD, organizationName: `Credits olga ${stamp}`, organizationSlug: `credits-olga-${stamp}` })
  A = apiAs(owner.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: `Credits ${TAG}` } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const olgaId = owner.user.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `${who} ${stamp}`, email, password: PASSWORD, organizationName: `Credits ${who} ${stamp}`, organizationSlug: `credits-${who}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add ${who}: ${said(added)}`)
    return { email, id: signed.user.id, token: signed.accessToken, api: apiAs(signed.accessToken) }
  }
  const mia = await person('mia', 'member')
  const max = await person('max', 'member')
  await person('gus', 'guest')
  const M = mia.api
  const must = (res, what) => { if (!res.ok || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`); return res.data }
  const space = must(await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} team`, defaultPermission: 'admin' } }), 'the space')
  const project = must(await A('/projects', { method: 'POST', body: { spaceId: space.id, name: `${TAG} work` } }), 'the folder')
  const list = must(await A('/lists', { method: 'POST', body: { projectId: project.id, name: `${TAG} launch` } }), 'the list')
  must(await A('/tasks', { method: 'POST', body: { listId: list.id, title: `Plan the launch ${TAG}`, assigneeIds: [mia.id] } }), 'a task')

  const credits = (api = M) => api(`/ai/credits?workspaceId=${WS}`)
  const stageUsed = (n) => sql`insert into ai_usage (workspace_id, user_id, feature, model, input_tokens, output_tokens, status, credits) values (${WS}, ${olgaId}, 'summarize', 'claude-haiku-4-5', 0, 0, 'succeeded', ${n})`
  const summarize = (api = M) => api('/ai/summarize', { method: 'POST', body: { workspaceId: WS, content: `The launch plan for ${TAG} is drafted.` } })
  const aiStatus = await A('/ai/status')
  const MODEL_ON = aiStatus.status === 200 && aiStatus.data?.available === true
  console.log(`  · /ai/status says a model is ${MODEL_ON ? 'configured' : 'not configured'}`)

  // ══ 1. THE MONTH'S CREDITS ═══════════════════════════════════════════════════
  console.log('\n▶ the month’s credits: the plan’s per member, times the members')
  const unlimited = await credits()
  await sql`update workspaces set plan = 'pro' where id = ${WS}`
  const pro = await credits()
  chk(
    unlimited.status === 200 && unlimited.data?.state === 'unlimited' && unlimited.data?.allowance === null
      && pro.status === 200 && pro.data?.perMember === 1000 && pro.data?.members === 3 && pro.data?.allowance === 3000
      && pro.data?.used === 0 && pro.data?.left === 3000 && pro.data?.state === 'ok' && pro.data?.renewsAt === renewsAt,
    'the month’s credits are the plan’s per member times its members — a guest brings none — unlimited on Enterprise, and renew on the 1st',
    JSON.stringify({ unlimited: unlimited.data ?? said(unlimited), pro: pro.data ?? said(pro) }),
  )

  // ══ 2. A CALL IS METERED IN CREDITS ══════════════════════════════════════════
  console.log('\n▶ a call costs credits, a refusal none')
  const asked = await summarize()
  // A call's use is written beside its answer, not before it: waited for.
  let row = null
  await waitUntil(async () => {
    ;[row] = await sql`select status, credits from ai_usage where workspace_id = ${WS} and user_id = ${mia.id} and feature = 'summarize' order by created_at desc limit 1`
    return !!row
  }, { timeoutMs: 10_000 }).catch(() => {})
  const afterCall = await credits()
  if (MODEL_ON) {
    chk(
      [200, 201].includes(asked.status) && row?.status === 'succeeded' && row?.credits >= 1 && afterCall.data?.used === row?.credits,
      'a call the model answers costs credits — its cost at a tenth of a cent a credit, at least one — and the month’s use counts it (read by SQL)',
      JSON.stringify({ asked: said(asked), row, used: afterCall.data?.used }),
    )
  } else {
    chk(
      asked.status === 503 && row?.status === 'failed' && row?.credits === 0 && afterCall.data?.used === 0,
      'a call the model answers costs credits — its cost at a tenth of a cent a credit, at least one — and the month’s use counts it (read by SQL)',
      `no model here: the refusal costs nothing — ${JSON.stringify({ asked: said(asked), row, used: afterCall.data?.used })}`,
    )
  }

  // ══ 3. WARNED AT 80% ════════════════════════════════════════════════════════
  console.log('\n▶ at 80%, a warning')
  const usedSoFar = afterCall.data?.used ?? 0
  await stageUsed(2400 - usedSoFar)
  const warned = await credits()
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const signIn = async (email) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', PASSWORD)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    return page
  }
  const miaPage = await signIn(mia.email)
  const banner = async () => {
    await miaPage.goto(`${B}/app/${WS}/ai`, { waitUntil: 'domcontentloaded' })
    const b = miaPage.getByTestId('ai-credit-banner')
    await b.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    return {
      state: await b.getAttribute('data-state').catch(() => null),
      text: (await b.filter({ visible: true }).innerText({ timeout: 3000 }).catch(() => '')).trim(),
      meter: (await miaPage.getByTestId('ai-credit-meter').filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '')).trim(),
    }
  }
  const warnedUi = await banner()
  chk(
    warned.data?.state === 'warning' && warned.data?.percent === 80 && warned.data?.left === 600
      && warnedUi.state === 'warning' && warnedUi.text.includes('80%') && warnedUi.meter.includes('600') && warnedUi.meter.includes('3,000'),
    'at 80% of the month’s credits the workspace is warned: the composer says so and how many are left',
    JSON.stringify({ api: warned.data ?? said(warned), ui: warnedUi }),
  )

  // ══ 4. PAUSED AT 100% ═══════════════════════════════════════════════════════
  console.log('\n▶ at 100%, AI pauses')
  await stageUsed(600)
  const paused = await credits()
  const refused = await summarize()
  const [refusedRow] = await sql`select status, error_code, credits from ai_usage where workspace_id = ${WS} and user_id = ${mia.id} order by created_at desc limit 1`
  const renewWords = new Date(renewsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  chk(
    paused.data?.state === 'paused' && paused.data?.left === 0
      && refused.status === 402 && (refused.message ?? '').includes('paused') && (refused.message ?? '').includes(renewWords)
      && refused.error?.details?.code === 'out_of_credits'
      && refusedRow?.status === 'failed' && refusedRow?.error_code === 'out_of_credits' && refusedRow?.credits === 0,
    'with the month’s credits used, AI pauses: a call is refused in words with when they renew (402), written down as a refusal that cost nothing (read by SQL)',
    JSON.stringify({ state: paused.data?.state, refused: said(refused), code: refused.error?.details?.code, row: refusedRow }),
  )
  // A chat turn streams, and was refused only after its stream had opened: nobody was told, and
  // the turn stood on a 201 with no frame until its client gave up (`found-13-oct/a-refused-chat-turn-never-ends`).
  // Read raw and bounded, so a turn left open fails here rather than waiting it out.
  const turn = await fetch(`${API}/ai/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${mia.token}` },
    body: JSON.stringify({ workspaceId: WS, messages: [{ role: 'user', content: `What is due for ${TAG}?` }] }),
    signal: AbortSignal.timeout(15_000),
  }).catch((e) => ({ status: 0, cut: String(e?.message ?? e) }))
  const turnBody = turn.text ? await turn.text().catch((e) => `(left open: ${e?.message ?? e})`) : `(no answer: ${turn.cut})`
  let turnSaid = ''
  try {
    const parsed = JSON.parse(turnBody)
    turnSaid = String(typeof parsed?.error === 'string' ? parsed.error : parsed?.error?.message ?? '')
  } catch {}
  chk(
    turn.status === 402 && turnSaid.includes('paused') && turnSaid.includes(renewWords),
    'and a chat turn is refused the same way, before anything streams and whatever the server has — not left open (402)',
    `${turn.status} ${turnBody.slice(0, 200)}`,
  )
  // And a summary streamed: it asked the credits only where a model answers, so a server without one
  // told a paused workspace it had no model (503).
  const streamedSummary = await fetch(`${API}/ai/summarize/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${mia.token}` },
    body: JSON.stringify({ workspaceId: WS, content: `The launch plan for ${TAG} is drafted.` }),
    signal: AbortSignal.timeout(15_000),
  }).catch((e) => ({ status: 0, cut: String(e?.message ?? e) }))
  const summaryBody = streamedSummary.text ? await streamedSummary.text().catch((e) => `(left open: ${e?.message ?? e})`) : `(no answer: ${streamedSummary.cut})`
  let summarySaid = ''
  try {
    const parsed = JSON.parse(summaryBody)
    summarySaid = String(typeof parsed?.error === 'string' ? parsed.error : parsed?.error?.message ?? '')
  } catch {}
  chk(
    streamedSummary.status === 402 && summarySaid.includes('paused') && summarySaid.includes(renewWords),
    'and so is a summary streamed, whatever the server has (402)',
    `${streamedSummary.status} ${summaryBody.slice(0, 200)}`,
  )

  // ══ 5. THE COMPOSER SAYS IT IS PAUSED ═══════════════════════════════════════
  const pausedUi = await banner()
  chk(
    pausedUi.state === 'paused' && pausedUi.text.includes('paused') && pausedUi.meter.includes('0 of 3,000'),
    'the composer says AI is paused, until when, and that an admin can add credits — none left of the month’s',
    JSON.stringify(pausedUi),
  )

  // ══ 6. BOUGHT CREDITS LIFT THE PAUSE ═════════════════════════════════════════
  console.log('\n▶ credits bought, and paid for, count this month')
  await sql`insert into ai_credit_purchases (workspace_id, credits, amount_cents, status, checkout_session_id, created_by_id, paid_at) values (${WS}, 10000, 1000, 'paid', ${`cs_paid_${TAG}`}, ${olgaId}, now())`
  const lifted = await credits()
  const again = await summarize()
  chk(
    lifted.data?.purchased === 10000 && lifted.data?.allowance === 13000 && lifted.data?.state === 'ok' && again.status !== 402,
    'credits bought and paid for count toward the month: the allowance grows by them and AI is no longer paused',
    JSON.stringify({ lifted: lifted.data ?? said(lifted), again: said(again) }),
  )

  // ══ 7. A PENDING PURCHASE GRANTS NOTHING ═════════════════════════════════════
  await sql`insert into ai_credit_purchases (workspace_id, credits, amount_cents, status, checkout_session_id, created_by_id) values (${WS}, 50000, 5000, 'pending', ${`cs_pending_${TAG}`}, ${olgaId})`
  const pendingSeen = await credits()
  chk(
    pendingSeen.data?.purchased === 10000 && pendingSeen.data?.allowance === 13000,
    'a purchase not yet paid for counts for nothing',
    JSON.stringify({ purchased: pendingSeen.data?.purchased, allowance: pendingSeen.data?.allowance }),
  )

  // ══ 8. ADD CREDITS: WHO, HOW MANY, AND A SERVER WITHOUT STRIPE ═════════════════
  console.log('\n▶ Add credits')
  const checkout = (api, credits) => api(`/workspaces/${WS}/billing/ai-credits/checkout`, { method: 'POST', body: { credits } })
  const before = (await sql`select count(*)::int as n from ai_credit_purchases where workspace_id = ${WS}`)[0].n
  const member = await checkout(M, 20000)
  const odd = await checkout(A, 15000)
  const noStripe = await checkout(A, 20000)
  const after = (await sql`select count(*)::int as n from ai_credit_purchases where workspace_id = ${WS}`)[0].n
  chk(
    member.status === 403 && odd.status === 400 && /packs of 10,000/.test(odd.message ?? '')
      && noStripe.status === 400 && /Billing is not configured/.test(noStripe.message ?? '') && after === before,
    'only whoever holds billing adds credits (a member is refused, 403); credits come in packs of 10,000 (400, in words); and a server with no payment provider says so — nothing kept (read by SQL)',
    JSON.stringify({ member: said(member), odd: said(odd), noStripe: said(noStripe), rows: { before, after } }),
  )

  // ══ 9. THE CREDITS CARD ═════════════════════════════════════════════════════
  console.log('\n▶ Settings → AI usage: the credits card')
  const olgaPage = await signIn(`${TAG}-olga@rundesk.invalid`)
  await olgaPage.goto(`${B}/app/${WS}/settings?tab=aiUsage`, { waitUntil: 'domcontentloaded' })
  const card = olgaPage.getByTestId('ai-credits-card')
  await card.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  const text = async (id) => (await olgaPage.getByTestId(id).filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '')).trim()
  const ui = {
    allowance: await text('ai-credits-allowance'),
    used: await text('ai-credits-used'),
    bought: await text('ai-credits-bought'),
    limit: await olgaPage.getByTestId('ai-credits-limit-line').getAttribute('data-value').catch(() => null),
    days: await olgaPage.getByTestId('ai-credits-trend').getAttribute('data-days').catch(() => null),
    summaries: await olgaPage.getByTestId('ai-credits-category-summaries').count().catch(() => 0),
    add: await olgaPage.getByTestId('ai-credits-add').count().catch(() => 0),
  }
  // What the month has used now — the call above, where a model answered it, used some too.
  const used = (await credits()).data?.used ?? -1
  chk(
    ui.allowance === '13,000' && ui.used === used.toLocaleString('en-US') && ui.bought === '10,000'
      && ui.limit === '13000' && Number(ui.days) === now.getUTCDate() && ui.summaries === 1 && ui.add === 1,
    'the credits card shows the month’s credits, used and bought, each day’s running total against the limit line, what each kind of AI used, and Add credits to the owner',
    JSON.stringify(ui),
  )

  // ══ 10. A MEMBER READS THEM IN THE AI HUB, WITH NO ADD CREDITS ══════════════
  await miaPage.goto(`${B}/app/${WS}/ai`, { waitUntil: 'domcontentloaded' })
  await miaPage.getByTestId('ai-tab-credits').click({ timeout: 20_000 }).catch(() => {})
  await miaPage.getByTestId('ai-credits-card').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  const miaCard = await miaPage.getByTestId('ai-credits-card').count().catch(() => 0)
  const miaLeft = (await miaPage.getByTestId('ai-credits-left').filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '')).trim()
  const miaAdd = await miaPage.getByTestId('ai-credits-add').count().catch(() => 0)
  const leftNow = (await credits()).data?.left ?? -1
  chk(
    miaCard === 1 && miaLeft === leftNow.toLocaleString('en-US') && miaAdd === 0,
    'a member reads the same credits, and is offered no Add credits',
    JSON.stringify({ miaCard, miaLeft, leftNow, miaAdd }),
  )

  // ══ 11. THE ADD CREDITS DIALOG ═══════════════════════════════════════════════
  console.log('\n▶ the Add credits dialog')
  await olgaPage.getByTestId('ai-credits-add').click({ timeout: 10_000 }).catch(() => {})
  const dialog = olgaPage.getByTestId('ai-credits-dialog')
  await dialog.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  const amounts = await dialog.locator('[data-testid^="ai-credits-amount-"]').count().catch(() => 0)
  await olgaPage.getByTestId('ai-credits-custom').fill('3').catch(() => {})
  const buttonWords = (await olgaPage.getByTestId('ai-credits-checkout').filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '')).trim()
  await olgaPage.getByTestId('ai-credits-checkout').click({ timeout: 8000 }).catch(() => {})
  const dialogError = (await olgaPage.getByTestId('ai-credits-error').filter({ visible: true }).innerText({ timeout: 10_000 }).catch(() => '')).trim()
  const afterDialog = (await sql`select count(*)::int as n from ai_credit_purchases where workspace_id = ${WS}`)[0].n
  chk(
    amounts === 3 && buttonWords.includes('30,000') && /Billing is not configured/.test(dialogError) && afterDialog === before,
    'Add credits offers three amounts and a custom number of packs; Get credits asks for that many, and the server’s refusal is said in the dialog',
    JSON.stringify({ amounts, buttonWords, dialogError, rows: afterDialog }),
  )

  // ══ 12. FREE USES OF TEAM VIEW, A MEMBER'S DAY EACH ══════════════════════════
  console.log('\n▶ a plan without Team View: its free uses')
  const team = (api) => api(`/tasks/list/${list.id}/team`)
  const planOf = async () => (await A(`/workspaces/${WS}/plan`)).data?.freeUses?.find((u) => u.feature === 'teamView') ?? null
  const fresh = await planOf()
  const t1 = await team(M)
  const t2 = await team(M)
  const afterMia = await planOf()
  const t3 = await team(A)
  const afterOlga = await planOf()
  chk(
    fresh?.allowance === 60 && fresh?.left === 60 && t1.status === 200 && t2.status === 200 && afterMia?.used === 1
      && t3.status === 200 && afterOlga?.used === 2,
    'Pro has sixty free uses of Team View, each a member’s day with it: Mia opening it twice takes one, Olga another',
    JSON.stringify({ fresh, mia: [t1.status, t2.status], afterMia, olga: t3.status, afterOlga }),
  )

  // ══ 13. THE TEAM VIEW SAYS HOW MANY ARE LEFT ═════════════════════════════════
  await miaPage.goto(`${B}/app/${WS}/${space.id}/${project.id}/${list.id}`, { waitUntil: 'domcontentloaded' })
  await miaPage.getByTestId('work-view-tab-type-team').click({ timeout: 20_000 }).catch(() => {})
  const leftNote = miaPage.getByTestId('team-view-free-uses')
  await leftNote.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  const leftText = (await leftNote.filter({ visible: true }).innerText({ timeout: 3000 }).catch(() => '')).trim()
  chk(
    /58 of 60/.test(leftText),
    'the Team View says how many of its free uses are left',
    JSON.stringify({ leftText }),
  )

  // ══ 14. SPENT, IT IS REFUSED IN WORDS ═══════════════════════════════════════
  console.log('\n▶ the uses spent')
  await sql`insert into plan_feature_uses (workspace_id, feature, user_id, day)
    select ${WS}, 'teamView', ${mia.id}, (current_date - g)::date from generate_series(1, 58) as g`
  const spentMax = await team(max.api)
  const stillOlga = await team(A)
  chk(
    spentMax.status === 403 && spentMax.error?.details?.code === 'uses_expired' && /used all 60 of its free uses of Team View/.test(spentMax.message ?? '')
      && /Nothing made with it is lost/.test(spentMax.message ?? '') && stillOlga.status === 200,
    'with its sixty uses spent, Team View is refused in words — nothing made with it lost — to a member with no use today, and not to one who already has today’s',
    JSON.stringify({ max: said(spentMax), code: spentMax.error?.details?.code, olga: stillOlga.status }),
  )

  // ══ 15. THE PAYWALL SAYS THE USES ARE SPENT ══════════════════════════════════
  const maxPage = await signIn(max.email)
  await maxPage.goto(`${B}/app/${WS}/${space.id}/${project.id}/${list.id}`, { waitUntil: 'domcontentloaded' })
  await maxPage.getByTestId('work-view-tab-type-team').click({ timeout: 20_000 }).catch(() => {})
  const gate = maxPage.getByTestId('feature-gate')
  /*
   * Two ways to the paywall, both the product's: the tab opens it when the plan
   * has loaded and says the uses are spent; pressed before the plan has loaded,
   * the view opens, the server refuses it, and its locked card opens it.
   */
  await waitUntil(
    async () => (await gate.isVisible().catch(() => false)) || (await maxPage.getByTestId('team-view-locked').isVisible().catch(() => false)),
    { timeoutMs: 20_000 },
  ).catch(() => {})
  if (!(await gate.isVisible().catch(() => false))) {
    await maxPage.getByTestId('team-view-unlock').click({ timeout: 8000 }).catch(() => {})
  }
  await gate.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  // Still the plan's gate (frame `09:26`), with `09:30`'s sentence under it: the uses are spent, nothing is lost.
  const gateKind = await gate.getAttribute('data-gate-kind').catch(() => null)
  const usesSpent = await gate.getAttribute('data-uses-spent').catch(() => null)
  const usesLine = (await maxPage.getByTestId('feature-gate-uses').filter({ visible: true }).innerText({ timeout: 3000 }).catch(() => '')).trim()
  chk(
    gateKind === 'plan' && usesSpent === 'yes' && /used all 60 of its free uses of Team View/.test(usesLine) && /Nothing made with it is lost|nothing made with it is lost/.test(usesLine),
    'the paywall says the free uses are spent, and nothing made is lost',
    JSON.stringify({ gateKind, usesSpent, usesLine }),
  )

  // ══ 16. A PLAN WITH TEAM VIEW COUNTS NO USE ══════════════════════════════════
  await sql`update workspaces set plan = 'business' where id = ${WS}`
  const usesBefore = (await sql`select count(*)::int as n from plan_feature_uses where workspace_id = ${WS}`)[0].n
  const business = await team(max.api)
  const usesAfter = (await sql`select count(*)::int as n from plan_feature_uses where workspace_id = ${WS}`)[0].n
  const businessPlan = await A(`/workspaces/${WS}/plan`)
  chk(
    business.status === 200 && usesAfter === usesBefore && (businessPlan.data?.freeUses ?? []).length === 0,
    'on Business, which has Team View, it is not counted, and no free uses are offered',
    JSON.stringify({ business: business.status, uses: { usesBefore, usesAfter }, freeUses: businessPlan.data?.freeUses }),
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (WS && A) {
    if (sql) await sql`update workspaces set plan = 'enterprise' where id = ${WS}`.catch(() => {})
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  // Only now: the DELETE above goes through this proxy, and a closed one refuses it.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
