/** A3.9 — the DM Chat / Calendar / Tasks tab strip, live in the browser. */
import path from 'node:path'
import { resolveChromium } from './lib/playwright.mjs'
import { apiClient, login, pickWorkspace, ensureSweepFixture, ensureDm, ensureShared } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
const chromium = await resolveChromium()

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

const EMAIL = process.env.E2E_EMAIL ?? 'verify@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Verify@123!'

/*
 * Serve the app, find a workspace, and make sure the DM this reads actually
 * exists. All three were hardcoded — a dev server on 5173, one workspace's
 * UUID, and a colleague called "Colleague" — which is why this could only ever
 * run against one machine, and why it was never in CI.
 */
const REPO = path.resolve(import.meta.dirname, '../..')
let DM_NAME = process.env.E2E_DM_NAME ?? 'Colleague'
const SHARED_TASK = 'A39 open task for the pair'
const SHARED_MEETING = 'A39 Sprint sync with colleague'
let stack = null
let B = (process.env.BASE ?? '').replace(/\/$/, '')
if (!B) {
  stack = await startLocalStack({
    dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')),
    apiPort: Number(argOf('--api', process.env.E2E_API_PORT ?? 3011)),
  })
  B = stack.base
}
let WS = process.env.E2E_WS
{
  const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
  const api = apiClient(`${B}/api/v1`, auth.accessToken)
  WS = WS ?? (await pickWorkspace(api)).id
  const fixture = await ensureSweepFixture(api, WS)
  const dm = await ensureDm(api, WS, auth.user?.id ?? auth.id)
  if (dm?.name) DM_NAME = dm.name
  // The two rows the Calendar and Tasks tabs are supposed to surface.
  if (dm?.peer?.userId) {
    await ensureShared(api, WS, fixture.listId, auth.user?.id ?? auth.id, dm.peer.userId, {
      taskTitle: SHARED_TASK,
      meetingTitle: SHARED_MEETING,
    })
  }
  console.log(`\x1b[2m  workspace ${WS}${dm ? `, DM with ${DM_NAME}` : ''}\x1b[0m`)
}
const r = []
const ok = (m) => { r.push(1); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { r.push(0); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
const chk = (c, g, b) => (c ? ok(g) : bad(b))

const br = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] })
const p = await (await br.newContext({ viewport: { width: 1600, height: 1000 } })).newPage()
try {
  await p.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await p.fill('input[type=email]', EMAIL)
  await p.fill('input[type=password]', PASSWORD)
  await p.click('button[type=submit]')
  await p.waitForURL(/\/app\//, { timeout: 25000 })
  await p.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  await p.goto(`${B}/app/${WS}/chat`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(3500)

  const strip = () => p.locator('button[aria-pressed]').filter({ hasText: /^(Chat|Calendar|Tasks)$/ })

  console.log('\n▶ a channel gets no tab strip')
  // Land on whatever the default channel is — it is not a DM.
  chk(await strip().count() === 0,
    'no Chat/Calendar/Tasks strip on a channel', `a channel showed ${await strip().count()} tabs`)
  chk(await p.locator('textarea:visible').count() > 0, 'the channel shows its composer', 'no composer on a channel')

  console.log('\n▶ opening the DM')
  // The row is an avatar plus a label, so anchor on the label text and click
  // the row it sits in.
  const dm = p.getByText(DM_NAME, { exact: true }).first()
  chk(await dm.count() > 0, 'the DM is listed in the sidebar', 'the DM is not in the sidebar')
  await dm.click()
  await p.waitForTimeout(2500)
  chk(await strip().count() === 3, 'a DM shows all three tabs', `saw ${await strip().count()} tabs`)
  const chatTab = p.getByRole('button', { name: 'Chat', exact: true })
  chk(await chatTab.getAttribute('aria-pressed') === 'true', 'Chat is the tab it opens on',
    'the DM did not open on Chat')

  console.log('\n▶ a message to prove the stream is hidden, not just empty')
  const MSG = 'a39 stream marker message'
  await p.locator('textarea:visible').first().fill(MSG)
  await p.keyboard.press('Enter')
  await p.waitForTimeout(2500)
  chk(await p.getByText(MSG, { exact: false }).first().isVisible().catch(() => false),
    'the message lands in the DM stream', 'the message never appeared')

  console.log('\n▶ Calendar')
  await p.getByRole('button', { name: 'Calendar', exact: true }).click()
  await p.waitForTimeout(2200)
  let body = await p.locator('main, body').first().innerText()
  chk(/Meetings with/i.test(body), 'Calendar names whose meetings these are', `no heading: ${body.slice(0, 120)}`)
  chk(body.includes(SHARED_MEETING), 'the meeting both attended is listed',
    'the shared meeting is not on screen')
  chk(!/A39 Solo planning/.test(body), 'the meeting only one attended is absent',
    'a solo meeting leaked into the shared calendar')
  chk(await p.locator('textarea:visible').count() === 0, 'the composer is out of the way on Calendar',
    'the message composer is still showing under Calendar')
  chk(!(await p.getByText(MSG, { exact: false }).first().isVisible().catch(() => false)),
    'the message stream is hidden under Calendar', 'the chat stream is still on screen under Calendar')

  console.log('\n▶ Tasks')
  await p.getByRole('button', { name: 'Tasks', exact: true }).click()
  await p.waitForTimeout(2200)
  body = await p.locator('main, body').first().innerText()
  chk(/Open tasks with/i.test(body), 'Tasks names whose tasks these are', `no heading: ${body.slice(0, 120)}`)
  chk(body.includes(SHARED_TASK), 'the shared open task is listed', 'the shared task is missing')
  chk(!/A39 finished task/.test(body), 'a closed task is not listed under "open tasks"',
    'a closed task showed under Open tasks')

  console.log('\n▶ back to Chat, and the reset on switching')
  await p.getByRole('button', { name: 'Chat', exact: true }).click()
  await p.waitForTimeout(1500)
  chk(await p.locator('textarea:visible').count() > 0, 'the composer comes back on Chat', 'the composer did not come back')
  chk(await p.getByText(MSG, { exact: false }).first().isVisible().catch(() => false),
    'the stream comes back on Chat', 'the stream did not come back')

  // A draft must survive the round trip — the panel hides the composer, it
  // does not throw it away.
  await p.locator('textarea:visible').first().fill('draft that must survive')
  await p.getByRole('button', { name: 'Tasks', exact: true }).click()
  await p.waitForTimeout(1200)
  await p.getByRole('button', { name: 'Chat', exact: true }).click()
  await p.waitForTimeout(1200)
  chk((await p.locator('textarea:visible').first().inputValue()) === 'draft that must survive',
    'an unsent draft survives a trip through Tasks', 'the draft was lost')

  // Leave it on Tasks, switch conversations, and it must land back on Chat.
  await p.getByRole('button', { name: 'Tasks', exact: true }).click()
  await p.waitForTimeout(1200)
  const other = p.getByText('general', { exact: true }).first()
  if (await other.count()) {
    await other.click()
    await p.waitForTimeout(1800)
    chk(await strip().count() === 0, 'switching to a channel drops the strip entirely',
      'the strip survived a switch to a channel')
    await dm.click()
    await p.waitForTimeout(1800)
    chk(await p.getByRole('button', { name: 'Chat', exact: true }).getAttribute('aria-pressed') === 'true',
      'coming back to the DM lands on Chat, not on stale Tasks', 'the DM reopened on the old tab')
  } else {
    bad('could not find a channel to switch to')
  }
} catch (e) {
  bad(`threw: ${e.message}`)
  await p.screenshot({ path: '/tmp/a39-fail.png', fullPage: true }).catch(() => {})
} finally { await br.close() }
const f = r.filter((x) => !x).length
console.log(`\n${r.length - f} passed, ${f} failed`)
await stack?.close?.()
process.exit(f ? 1 : 0)
