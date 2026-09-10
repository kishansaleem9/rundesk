/** A6.1/A6.2 — the meeting record: it must survive the page. */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login, pickWorkspace, ensureSweepFixture, ensureDm } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
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
  await ensureSweepFixture(api, WS)
  const dm = await ensureDm(api, WS, auth.user?.id ?? auth.id)
  if (dm?.name) DM_NAME = dm.name
  console.log(`\x1b[2m  workspace ${WS}${dm ? `, DM with ${DM_NAME}` : ''}\x1b[0m`)
}
/*
 * A client that outlives the discovery block above, whose own `api` is scoped
 * to it. The tag checks seed a meeting and read the filter back off the server.
 */
const rootAuth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
const rootApi = apiClient(`${B}/api/v1`, rootAuth.accessToken)

const r = []
const ok = (m) => { r.push(1); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { r.push(0); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
const chk = (c, g, b) => (c ? ok(g) : bad(b))
const TITLE = `A61 retro ${Date.now().toString(36)}`
const NOTES = 'Ali will write the migration by Thursday. Sara reviews the export path on Friday.'

const br = await chromium.launch(launchOptions())
const p = await (await br.newContext({ viewport: { width: 1600, height: 1100 } })).newPage()
try {
  await p.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await p.fill('input[type=email]', EMAIL)
  await p.fill('input[type=password]', PASSWORD)
  await p.click('button[type=submit]')
  await p.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })
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
  const chip = p.locator('button[aria-pressed]').filter({ hasText: new RegExp(DM_NAME) }).first()
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
  const chip2 = p.locator('button[aria-pressed]').filter({ hasText: new RegExp(DM_NAME) }).first()
  chk(await chip2.getAttribute('aria-pressed') === 'true', 'the attendee list comes back',
    'the attendee was not remembered')

  console.log('\n▶ starting a new one clears the record, not the app')
  await p.getByRole('button', { name: /Start a new one/ }).click()
  await p.waitForTimeout(1200)
  chk((await p.getByPlaceholder('Weekly sync').inputValue()) === '', 'the title clears', 'the title stuck')
  chk(await p.getByRole('button', { name: /^Save meeting$/ }).count() > 0,
    'the button goes back to Save', 'still offering Update after starting a new one')
  // -------------------------------------------------------------------
  console.log('\n▶ §A6 [19:16–19:20] — "Tags:" in the meeting-notes toolbar')
  // -------------------------------------------------------------------
  /*
   * Her toolbar is "Filters · My notes · Tags: <chips> · Search". My notes and
   * Search shipped; tags did not exist at all — no column, no relation.
   *
   * Seeded here rather than borrowed from whatever meetings happen to exist: a
   * chip row built from ambient data might have no tags in it, and a filter
   * with nothing to filter passes by not running.
   */
  {
    const tag = `suite-tag-${Date.now()}`
    const tagged = (await rootApi(`/workspaces/${WS}/meetings`, {
      method: 'POST',
      body: { title: `tagged ${tag}`, tags: [tag] },
    })).data
    const plain = (await rootApi(`/workspaces/${WS}/meetings`, {
      method: 'POST',
      body: { title: `untagged ${tag}` },
    })).data
    chk(!!tagged?.id && !!plain?.id, 'a tagged and an untagged meeting could be seeded',
      'could not seed meetings')

    await p.goto(`${B}/app/${WS}/meetings`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(3000)

    chk(
      await p.getByTestId('meetings-tags').isVisible().catch(() => false),
      'the toolbar shows a Tags row',
      'no Tags row in the meetings toolbar',
    )
    const chip = p.getByTestId(`meetings-tag-${tag}`)
    chk(await chip.isVisible().catch(() => false), 'with a chip for a tag in use',
      `no chip for ${tag}`)

    if (await chip.isVisible().catch(() => false)) {
      const rows = () => p.locator('[data-testid^="meeting-row-"], article, li').filter({ hasText: tag }).count()
      const before = await rows()
      await chip.click()
      await p.waitForTimeout(900)
      const after = await rows()
      chk(after > 0 && after < before, `choosing it narrows the list (${before} → ${after})`,
        `the chip changed nothing: ${before} → ${after}`)
      await chip.click()
      await p.waitForTimeout(700)
      chk((await rows()) === before, 'and choosing it again clears the filter',
        'the chip could not be turned off')
    } else {
      chk(false, 'choosing it narrows the list', 'no chip')
      chk(false, 'and choosing it again clears the filter', 'no chip')
    }

    // The server filters too, so a tag on the 201st meeting is still reachable.
    const filtered = (await rootApi(`/workspaces/${WS}/meetings?tag=${encodeURIComponent(tag)}`)).data ?? []
    chk(
      filtered.length === 1 && filtered[0].id === tagged.id,
      'and the server filters by tag rather than the client after a limit',
      `server returned ${filtered.length} for ?tag=`,
    )
  }

  /*
   * ── §G14-15 — a meeting you can find, and land on ─────────────────────────
   *
   * Meetings were the one kind of workspace content search could not see: you
   * could read one on its own page and find it from nowhere else, and the
   * notes are often the only written record of a decision.
   *
   * The phrase lives in the NOTES, not the title. Searching a title would pass
   * against an index that only ever looked at headings, which is the half that
   * matters least — "what did we decide about pricing" is a question about the
   * body.
   */
  console.log('\n▶ §G14-15 — a meeting is findable from search')
  /*
   * The phrase appears in the NOTES ONLY, and the title is deliberately
   * ordinary.
   *
   * The first version put it in both, so a search that looked at titles alone
   * still found it — and a break that reduced the query to titles passed
   * cleanly. A fixture that satisfies the check by two routes cannot tell you
   * which one is working.
   */
  const phrase = `zephyrine-${Date.now()}`
  const findable = (await rootApi(`/workspaces/${WS}/meetings`, {
    method: 'POST',
    body: { title: 'Quarterly planning', notes: `We decided the ${phrase} tier ships in Q3.` },
  })).data
  chk(!!findable?.id, 'there is a meeting with a decision in its notes', 'could not create one')

  const hits = (await rootApi(`/search/${WS}?q=${encodeURIComponent(phrase)}`)).data ?? []
  const hit = hits.find((h) => h.entityType === 'meeting' && h.id === `meeting-${findable.id}`)
  chk(!!hit, 'and searching what the notes say finds it',
    `${hits.length} hits, types ${JSON.stringify([...new Set(hits.map((h) => h.entityType))])}`)

  /*
   * And the hit LANDS on it. A url pointing at the meetings page drops you
   * among every meeting in the workspace and leaves you to find it — search
   * that found something rather than search that took you to it.
   */
  chk(
    !!hit?.url && hit.url.includes(`meeting=${findable.id}`),
    'and the result points at that meeting, not just the meetings page',
    `url was ${hit?.url}`,
  )
  if (hit?.url) {
    await p.goto(`${B}${hit.url}`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(3500)
    const row = p.getByTestId(`meeting-${findable.id}`)
    chk(
      (await row.getAttribute('data-highlighted').catch(() => null)) === 'true',
      'and following it marks the one you came for',
      'the linked meeting is not distinguished from the rest of the list',
    )
  } else {
    chk(false, 'and following it marks the one you came for', 'no url to follow')
  }

  /*
   * ── §G14-15 — and the assistant can ground an answer in one ───────────────
   *
   * Keyword search finding a meeting is half of it. The notes are frequently
   * the only written record of a decision, and the assistant could not cite
   * one: "what did we decide about pricing" returned everything except the
   * place the decision was written down.
   *
   * Reindexed explicitly rather than waiting for the cron, so this measures
   * the indexer rather than whether a scheduled job happened to have run.
   */
  console.log('\n▶ §G14-15 — the assistant can cite a meeting')
  const reindexed = await rootApi(`/workspaces/${WS}/knowledge/reindex`, { method: 'POST' })
  chk(reindexed.status < 400, 'the workspace can be reindexed',
    `reindex returned ${reindexed.status}: ${JSON.stringify(reindexed.error)}`)

  const asked = await rootApi('/ai/knowledge', {
    method: 'POST',
    body: { workspaceId: WS, question: `what did we decide about the ${phrase} tier` },
  })
  const cited = (asked.data?.sources ?? []).filter((x) => x.type === 'meeting')
  chk(
    cited.length > 0,
    'and asking about what a meeting decided cites a meeting',
    `sources were ${JSON.stringify((asked.data?.sources ?? []).map((x) => x.type))}`,
  )
  /*
   * Citing the right one. Any meeting would satisfy the check above, and with
   * 46 of them in the workspace that is a low bar — the phrase appears in
   * exactly one set of notes.
   */
  chk(
    cited.some((x) => x.id === findable.id),
    'and cites the one whose notes actually say it',
    `cited ${JSON.stringify(cited.map((x) => x.title))}`,
  )

} catch (e) {
  bad(`threw: ${e.message}`)
  await p.screenshot({ path: '/tmp/a61-fail.png', fullPage: true }).catch(() => {})
} finally { await br.close() }
const f = r.filter((x) => !x).length
console.log(`\n${r.length - f} passed, ${f} failed`)
await stack?.close?.()
process.exit(f ? 1 : 0)
