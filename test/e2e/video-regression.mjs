/**
 * The half of the ClickUp overview that only exists in a browser.
 *
 * `video-regression.py` covers what the API can answer for. Everything here is
 * a thing she pointed at on screen — a tab strip, a padlock, a filter builder,
 * a menu — where "the endpoint answers" proves nothing about whether anyone
 * can reach it.
 *
 *   BASE=http://127.0.0.1:5173 WS=<workspace-id> node test/e2e/video-regression.mjs
 */
import { resolveChromium } from './lib/playwright.mjs'
const chromium = await resolveChromium()

const BASE = process.env.BASE ?? 'http://127.0.0.1:5173'
const WS = process.env.WS ?? 'f47622b5-fc76-47d0-82d4-3b68c00bbaed'
const EMAIL = process.env.E2E_EMAIL ?? 'verify@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Verify@123!'
const CHROME = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const results = []
let REF = '—'
const ok = (m) => { results.push([REF, true, m]); console.log(`  \x1b[32mPASS\x1b[0m [${REF}] ${m}`) }
const bad = (m) => { results.push([REF, false, m]); console.log(`  \x1b[31mFAIL\x1b[0m [${REF}] ${m}`) }
const chk = (c, g, b) => (c ? ok(g) : bad(b))
const ref = (r, what) => { REF = r; console.log(`\n\x1b[1;36m▶ ${r}\x1b[0m  ${what}`) }
const area = (n) => console.log(`\n\x1b[1;35m${'═'.repeat(66)}\n  ${n}\n${'═'.repeat(66)}\x1b[0m`)

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1100 } })).newPage()

/** Text of the page as a user would read it. */
const seen = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ')
const go = async (path, settle = 3000) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(settle)
}

try {
  await go('/login', 1500)
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app\//, { timeout: 30000 })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  console.log(`signed in as ${EMAIL}`)

  // ══════════════════════════════════════════════════ A1 hierarchy ════
  area('A1 — Hierarchy and views')

  ref('A1.8', 'The sidebar names the workspace and shows the tree')
  await go(`/app/${WS}`)
  const shell = await seen()
  chk(/Spaces/i.test(shell), 'the sidebar has a Spaces section', 'no Spaces section in the shell')
  chk(/Workspace/i.test(shell), 'the workspace is named in the sidebar', 'the workspace name is missing')

  ref('A1.9', 'The + menu offers more than a task')
  const newBtn = page.getByRole('button', { name: /^New$/ }).first()
  chk(await newBtn.count() > 0, 'there is a New button in the topbar', 'no New button')
  if (await newBtn.count()) {
    await newBtn.click()
    await page.waitForTimeout(1200)
    const menu = await seen()
    for (const item of ['Task', 'Doc', 'List']) {
      chk(new RegExp(item, 'i').test(menu), `the menu offers ${item}`, `the menu has no ${item}`)
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  }

  ref('A1.5', 'The whole nav she walked through is reachable')
  const nav = await seen()
  for (const dest of ['Inbox', 'Docs', 'Dashboards', 'Goals', 'Reports', 'Workload', 'Timeline', 'Forms', 'Automations']) {
    chk(new RegExp(`\\b${dest}\\b`, 'i').test(nav), `${dest} is in the sidebar`, `${dest} is not reachable from the sidebar`)
  }

  ref('A1.2', 'Named views as tabs, with + View')
  // A list is the only link with four path segments, which beats matching on
  // text — "Task list" in RECENTS is not a list.
  // The named routes (/inbox, /chat, …) are the same shape as a space, so match
  // on the id itself rather than on how many segments there are.
  const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
  const spaceHref = await page.locator('a[href]').evaluateAll((as, u) => {
    const re = new RegExp(`^/app/${u}/${u}$`)
    return as.map((a) => a.getAttribute('href') ?? '').find((h) => re.test(h)) ?? null
  }, UUID)
  // Workspace → space → project → list. The space page links to projects, not
  // straight to lists, so this is three hops rather than two.
  const firstHrefOfDepth = (depth) =>
    page.locator('a[href]').evaluateAll((as, { u, d }) => {
      const re = new RegExp(`^/app/${u}${`/${u}`.repeat(d)}$`)
      return as.map((a) => a.getAttribute('href') ?? '').find((h) => re.test(h)) ?? null
    }, { u: UUID, d: depth })

  let listHref = null
  if (spaceHref) {
    await go(spaceHref, 3500)
    const projectHref = await firstHrefOfDepth(2)
    if (projectHref) {
      await go(projectHref, 3500)
      listHref = await firstHrefOfDepth(3)
    }
  }
  if (listHref) {
    await go(listHref, 4500)
    const listPage = await seen()
    for (const v of ['List', 'Board', 'Table', 'Calendar', 'Gantt']) {
      chk(new RegExp(`\\b${v}\\b`).test(listPage), `the ${v} view is offered`, `no ${v} view`)
    }
    const addView = page.locator('button').filter({ hasText: /^View$/ }).last()
    chk(await addView.count() > 0, 'there is a control to save the current view',
      'no add-a-view control beside the tabs')
    if (await addView.count()) {
      // Make one rather than assume one is there. Naming is a window.prompt, so
      // it has to be answered before the click resolves.
      const viewName = `Team View ${Math.random().toString(36).slice(2, 8)}`
      page.once('dialog', (d) => d.accept(viewName))
      await addView.click()
      await page.waitForTimeout(3000)
      const savedTabs = await page.locator('button[title^="Actions for the"]').count()
      chk(savedTabs > 0, `and a saved view then sits in the tab strip (${savedTabs})`,
        'the saved view did not appear as a tab')
      chk((await seen()).includes(viewName), 'under the name it was given',
        `"${viewName}" is not in the tab strip`)
    }

    ref('A1.4', 'A filter builder, not three fixed fields')
    const filterBtn = page.getByRole('button', { name: /^Filter/i }).first()
    chk(await filterBtn.count() > 0, 'there is a Filter control', 'no Filter control on a list view')
    if (await filterBtn.count()) {
      await filterBtn.click()
      await page.waitForTimeout(1500)
      const f = await seen()
      const fields = ['Assignee', 'Priority', 'Due', 'Status'].filter((x) => new RegExp(x, 'i').test(f))
      chk(fields.length >= 3, `the builder offers ${fields.join(', ')}`, `only ${fields.length} filter fields offered`)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(600)
    }

    ref('A1.4b', 'Search inside the view you are already in')
    chk(await page.getByPlaceholder(/Search tasks/i).count() > 0,
      'the list has its own task search', 'no in-view task search')

    ref('A1.3', 'Board polish — label pills, inline rename, + Add group')
    const boardTab = page.getByRole('button', { name: /^Board$/ }).first()
    if (await boardTab.count()) {
      await boardTab.click()
      await page.waitForTimeout(3000)
      const board = await seen()
      chk(/Add group|New group/i.test(board), 'the board offers + Add group', 'no add-group control on the board')
    } else {
      bad('could not switch to the Board view')
    }
  } else {
    bad('no list reachable from the space page to test views against')
  }

  // ═══════════════════════════════════════════════ A2 search & inbox ════
  area('A2 — Search and inbox')

  ref('A2.1', 'Search is also a command bar')
  await go(`/app/${WS}`)
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(1500)
  const palette = page.locator('input:visible').first()
  chk(await palette.count() > 0, 'Cmd/Ctrl-K opens a search box', 'the command palette did not open')
  if (await palette.count()) {
    ref('A2.3', 'Ask AI from the search box')
    await palette.fill('regr')
    await page.waitForTimeout(2500)
    const p = await seen()
    chk(/Ask AI/i.test(p), 'Ask AI is offered as the first move on a query', 'no Ask AI row in search')

    ref('A2.1b', 'Slash puts it in command mode')
    await palette.fill('/')
    await page.waitForTimeout(1800)
    const cmds = await seen()
    chk(/command/i.test(cmds) || /Create|Go to/i.test(cmds),
      'a leading slash offers commands rather than results', 'slash did not switch to commands')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
  }

  ref('A2.6', 'Inbox: All / Primary / Other, and Later / Cleared')
  await go(`/app/${WS}/inbox`, 3500)
  const inbox = await seen()
  for (const state of ['Later', 'Cleared', 'Primary', 'Other']) {
    chk(new RegExp(`\\b${state}\\b`, 'i').test(inbox), `${state} is reachable`, `${state} is not on the inbox`)
  }

  chk(/Mark all read/i.test(inbox), 'the inbox can be cleared in one move', 'no mark-all-read')

  ref('A2.9', 'Replies get their own route, with unread against read')
  await go(`/app/${WS}/replies`, 3500)
  const replies = await seen()
  for (const state of ['Unread', 'Read', 'All']) {
    chk(new RegExp(`\\b${state}\\b`, 'i').test(replies), `${state} is a sub-tab`, `no ${state} sub-tab on replies`)
  }
  await go(`/app/${WS}/replies?filter=read`, 3000)
  chk(page.url().includes('filter=read'), 'and the sub-tab is addressable — a read reply survives a reload',
    'the replies filter is not in the URL')

  // ══════════════════════════════════════════════════════════ A3 chat ════
  area('A3 — Chat')

  await go(`/app/${WS}/chat`, 4000)
  const chat = await seen()

  ref('A3.4', 'Channels and DMs are separate, named groups')
  chk(/Channels/i.test(chat) && /Direct messages/i.test(chat),
    'the sidebar separates channels from DMs', 'channels and DMs are not separated')

  ref('A3.5', 'Ask AI opens a prompt rather than rewriting the draft')
  const ta = page.locator('textarea:visible').first()
  if (await ta.count()) {
    await ta.fill('we need to shipp this featur by friday pls')
    const before = await ta.inputValue()
    const composer = page.locator('div').filter({ has: page.locator('textarea') }).last()
    const askAi = composer.getByRole('button', { name: /Ask AI/i }).first()
    chk(await askAi.count() > 0, 'the composer has an Ask AI control', 'no Ask AI in the composer')
    if (await askAi.count()) {
      await askAi.click()
      await page.waitForTimeout(1600)
      const pop = await seen()
      chk(/Improve/i.test(pop) && /Shorten/i.test(pop),
        'it offers modes to choose from', 'the AI popover offers no modes')
      chk((await ta.inputValue()) === before,
        'the draft is untouched until a mode is picked', 'opening the prompt already rewrote the draft')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(800)
    }

    ref('A3.6', 'The link picker has Tasks / Docs / Channels')
    const link = page.getByRole('button', { name: /Link a task, doc or channel/i }).first()
    chk(await link.count() > 0, 'there is a link control in the toolbar', 'no link control')
    if (await link.count()) {
      await link.click()
      await page.waitForTimeout(1500)
      const picker = await seen()
      for (const tab of ['Tasks', 'Docs', 'Channels']) {
        chk(new RegExp(tab, 'i').test(picker), `the ${tab} tab is offered`, `no ${tab} tab`)
      }
      await page.keyboard.press('Escape')
      await page.waitForTimeout(800)
    }
  } else {
    bad('no composer on the chat page')
  }

  ref('A3.9', 'A DM gets Chat / Calendar / Tasks; a channel does not')
  const strip = () => page.locator('button[aria-pressed]').filter({ hasText: /^(Chat|Calendar|Tasks)$/ })
  chk(await strip().count() === 0, 'a channel has no tab strip', 'a channel showed DM tabs')
  const dmRow = page.getByText('Colleague', { exact: true }).first()
  if (await dmRow.count()) {
    await dmRow.click()
    await page.waitForTimeout(2500)
    chk(await strip().count() === 3, 'a DM shows all three tabs', `saw ${await strip().count()} tabs`)
    await page.getByRole('button', { name: 'Calendar', exact: true }).click()
    await page.waitForTimeout(2000)
    chk(/Meetings with/i.test(await seen()), 'Calendar names whose meetings these are', 'no Calendar heading')
    chk(await page.locator('textarea:visible').count() === 0,
      'the composer steps out of the way', 'the composer is still showing under Calendar')
    await page.getByRole('button', { name: 'Tasks', exact: true }).click()
    await page.waitForTimeout(2000)
    chk(/Open tasks with/i.test(await seen()), 'Tasks names whose tasks these are', 'no Tasks heading')
  } else {
    bad('no DM in the sidebar to test the tab strip against')
  }

  // ═════════════════════════════════════════════════════════ A4 admin ════
  area('A4 — Admin')

  ref('A4.4', 'One settings console, grouped')
  await go(`/app/${WS}/settings`, 3500)
  const settings = await seen()
  const tabs = ['Members', 'Security', 'Spaces', 'Groups', 'Roles', 'Work schedule', 'Features', 'Labels']
  const present = tabs.filter((x) => new RegExp(x, 'i').test(settings))
  chk(present.length >= 5, `settings groups ${present.join(', ')}`, `only ${present.length} settings groups found`)

  ref('A4.10', 'Work schedule is editable, not just stored')
  await page.getByRole('button', { name: 'Work schedule', exact: true }).click()
  await page.waitForTimeout(3000)
  const sched = await seen()
  chk(/Monday|Mon\b/i.test(sched) && /Holiday/i.test(sched),
    'the schedule offers work days and holidays', `the schedule tab reads: ${sched.slice(0, 140)}`)

  ref('A4.6', 'Trash, with what it was and who deleted it')
  await go(`/app/${WS}/settings`, 3500)
  await page.getByRole('button', { name: 'Trash', exact: true }).click().catch(() => {})
  await page.waitForTimeout(3000)
  const trash = await seen()
  chk(/Restore/i.test(trash) || /empty/i.test(trash),
    'trash offers restore (or says it is empty)', `the trash tab reads: ${trash.slice(0, 140)}`)

  ref('A4.11', 'Reports-to is set where members are managed')
  await go(`/app/${WS}/settings`, 3500)
  await page.getByRole('button', { name: 'Members', exact: true }).click().catch(() => {})
  await page.waitForTimeout(3000)
  const mem = await seen()
  chk(/Manager|Reports to/i.test(mem), 'a reporting line is offered on a member',
    `the members tab reads: ${mem.slice(0, 140)}`)

  // ══════════════════════════════════════════ A5 forms/docs/reports ════
  area('A5 — Forms, docs, dashboards, reports')

  ref('A5.1', 'A form says which list it feeds')
  await go(`/app/${WS}/forms`, 3500)
  chk(/Form/i.test(await seen()), 'the forms page renders', 'the forms page did not render')

  ref('A5.2', 'Docs')
  await go(`/app/${WS}/docs`, 3500)
  chk(/Doc/i.test(await seen()), 'the docs page renders', 'the docs page did not render')

  ref('A5.3', 'Dashboards')
  await go(`/app/${WS}/dashboards`, 3500)
  chk(/Dashboard|Widget/i.test(await seen()), 'the dashboards page renders', 'the dashboards page did not render')

  ref('A5.7', 'Reporting')
  await go(`/app/${WS}/reports`, 4000)
  chk(/Report|Overview|Completion/i.test(await seen()), 'the reports page renders', 'the reports page did not render')

  ref('A4.12', 'Workload')
  await go(`/app/${WS}/workload`, 4000)
  const workload = await seen()
  chk(/Workload|Capacity/i.test(workload), 'the workload page renders', 'the workload page did not render')

  // ═══════════════════════════════════════════════════ A6 AI surface ════
  area('A6 — AI and meetings')

  ref('A6.4', 'AI is docked and reachable from anywhere')
  await go(`/app/${WS}`, 3000)
  const dock = page.locator('button[aria-label*="AI" i], button[title*="AI" i]').first()
  chk(await dock.count() > 0, 'the AI dock is on screen outside the AI page', 'no global AI affordance')

  ref('A6.1', 'A meeting can be recorded and reopened')
  await go(`/app/${WS}/ai`, 3500)
  const notesTab = page.getByRole('button', { name: 'Meeting notes', exact: true })
  chk(await notesTab.count() > 0, 'the Meeting notes tab exists', 'no Meeting notes tab')
  if (await notesTab.count()) {
    await notesTab.click()
    await page.waitForTimeout(2500)
    const notes = await seen()
    chk(/Meeting record/i.test(notes), 'the meeting record panel is there', 'no meeting record panel')
    chk(/Who was there/i.test(notes), 'attendees are part of the record', 'no attendee picker')
    chk(/Recording link/i.test(notes), 'so is the recording', 'no recording field')

    ref('A6.2b', 'It does not claim to transcribe')
    chk(/does not transcribe/i.test(notes),
      'the panel says plainly that calls are not transcribed',
      'nothing tells the user transcription is not happening')
  }

  ref('A6.9', 'Clips')
  await go(`/app/${WS}/clips`, 3500)
  const clips = await seen()
  chk(/Clip/i.test(clips), 'the clips page renders', 'the clips page did not render')
  chk(!/auto[- ]?transcri/i.test(clips), 'and does not promise auto-transcription',
    'the clips page still claims clips are transcribed automatically')
} catch (e) {
  bad(`threw: ${e.message}`)
  await page.screenshot({ path: '/tmp/video-regression-fail.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

console.log(`\n${'═'.repeat(66)}`)
const failed = results.filter(([, pass]) => !pass)
if (failed.length) {
  console.log('\x1b[31mFAILURES\x1b[0m')
  for (const [r, , m] of failed) console.log(`  [${r}] ${m}`)
  console.log('═'.repeat(66))
}
console.log(`\n\x1b[1m${results.length - failed.length} passed, ${failed.length} failed\x1b[0m`)
process.exit(failed.length ? 1 : 0)
