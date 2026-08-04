/** A3.9 — the DM Chat / Calendar / Tasks tab strip, live in the browser. */
import { chromium } from 'playwright'
const WS = 'f47622b5-fc76-47d0-82d4-3b68c00bbaed'
const B = 'http://127.0.0.1:5173'
const r = []
const ok = (m) => { r.push(1); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { r.push(0); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
const chk = (c, g, b) => (c ? ok(g) : bad(b))

const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] })
const p = await (await br.newContext({ viewport: { width: 1600, height: 1000 } })).newPage()
try {
  await p.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await p.fill('input[type=email]', 'verify@rundesk.internal')
  await p.fill('input[type=password]', 'Verify@123!')
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
  const dm = p.getByText('Colleague', { exact: true }).first()
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
  chk(/A39 Sprint sync with colleague/.test(body), 'the meeting both attended is listed',
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
  chk(/A39 open task for the pair/.test(body), 'the shared open task is listed', 'the shared task is missing')
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
process.exit(f ? 1 : 0)
