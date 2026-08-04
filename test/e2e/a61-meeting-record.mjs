/** A6.1/A6.2 — the meeting record: it must survive the page. */
import { chromium } from 'playwright'
const WS = 'f47622b5-fc76-47d0-82d4-3b68c00bbaed'
const B = 'http://127.0.0.1:5173'
const r = []
const ok = (m) => { r.push(1); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { r.push(0); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
const chk = (c, g, b) => (c ? ok(g) : bad(b))
const TITLE = `A61 retro ${Date.now().toString(36)}`
const NOTES = 'Ali will write the migration by Thursday. Sara reviews the export path on Friday.'

const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] })
const p = await (await br.newContext({ viewport: { width: 1600, height: 1100 } })).newPage()
try {
  await p.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await p.fill('input[type=email]', 'verify@rundesk.internal')
  await p.fill('input[type=password]', 'Verify@123!')
  await p.click('button[type=submit]')
  await p.waitForURL(/\/app\//, { timeout: 25000 })
  await p.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  // The tab is component state, not a route param, so it has to be clicked.
  const openNotes = async () => {
    await p.getByRole('button', { name: 'Meeting notes', exact: true }).click()
    await p.waitForTimeout(2500)
  }
  await p.goto(`${B}/app/${WS}/ai`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(3000)
  await openNotes()

  console.log('\n▶ the panel is there')
  const body0 = await p.locator('body').innerText()
  chk(/Meeting record/i.test(body0), 'the Meeting record panel renders', `not on the page: ${body0.slice(0, 200)}`)
  chk(/does not transcribe/i.test(body0), 'it says plainly that calls are not transcribed',
    'no honesty line about transcription')

  console.log('\n▶ recording a meeting')
  await p.getByPlaceholder('Weekly sync').fill(TITLE)
  await p.locator('input[type=datetime-local]').fill('2026-08-04T09:30')
  await p.getByPlaceholder('https://…').fill('https://example.com/rec/a61.mp4')
  const chip = p.locator('button[aria-pressed]').filter({ hasText: /Colleague/ }).first()
  chk(await chip.count() > 0, 'workspace members are offered as attendees', 'no attendee chips')
  await chip.click()
  chk(await chip.getAttribute('aria-pressed') === 'true', 'an attendee can be picked', 'the chip did not toggle on')

  await p.locator('textarea').first().fill(NOTES)
  await p.getByRole('button', { name: /^Save meeting$/ }).click()
  await p.waitForTimeout(3000)
  const afterSave = await p.locator('body').innerText()
  chk(/Update meeting/.test(afterSave), 'saving switches the button to Update — the row exists now',
    'still offering Save after a save')
  chk(/Open recording/.test(afterSave), 'the recording link is kept and offered', 'the recording url was dropped')

  console.log('\n▶ it survives a reload — the point of the whole thing')
  await p.reload({ waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(3000)
  await openNotes()
  const sel = p.locator('label').filter({ hasText: 'Open a saved meeting' }).locator('select').first()
  const opts = await sel.locator('option').allInnerTexts()
  chk(opts.some((o) => o.includes(TITLE)), 'the saved meeting is listed after a reload',
    `saved meetings: ${JSON.stringify(opts).slice(0, 200)}`)

  const value = await sel.locator('option').filter({ hasText: TITLE }).first().getAttribute('value')
  await sel.selectOption(value)
  await p.waitForTimeout(1800)
  chk((await p.locator('textarea').first().inputValue()).includes('Ali will write the migration'),
    'reopening it brings the notes back', 'the notes did not come back')
  const reopened = await p.locator('body').innerText()
  chk(/Open recording/.test(reopened), 'the recording link comes back too', 'the recording link is gone')
  const chip2 = p.locator('button[aria-pressed]').filter({ hasText: /Colleague/ }).first()
  chk(await chip2.getAttribute('aria-pressed') === 'true', 'the attendee list comes back',
    'the attendee was not remembered')

  console.log('\n▶ starting a new one clears the record, not the app')
  await p.getByRole('button', { name: /Start a new one/ }).click()
  await p.waitForTimeout(1200)
  chk((await p.getByPlaceholder('Weekly sync').inputValue()) === '', 'the title clears', 'the title stuck')
  chk(await p.getByRole('button', { name: /^Save meeting$/ }).count() > 0,
    'the button goes back to Save', 'still offering Update after starting a new one')
} catch (e) {
  bad(`threw: ${e.message}`)
  await p.screenshot({ path: '/tmp/a61-fail.png', fullPage: true }).catch(() => {})
} finally { await br.close() }
const f = r.filter((x) => !x).length
console.log(`\n${r.length - f} passed, ${f} failed`)
process.exit(f ? 1 : 0)
