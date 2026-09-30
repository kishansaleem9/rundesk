/**
 * §V2-S02 frame `01:55` / `02:00` — THE ATTACHMENT THUMBNAIL AND ITS HOVER
 * ACTIONS, plus §V2-S07 frames `06:05`–`06:08`, the rail icon whose tooltip
 * reads "Related items".
 *
 * A WORDING CORRECTION THE FRAMES FORCED, recorded here because the next reader
 * will meet the ledger's sentence before they meet the frame. The row says
 * *"attachment thumbnail hover actions; attachments header view-toggle"*, and a
 * later correction in the ledger said the header carries *"a magnifier, an
 * expand arrow and a `+`"* rather than a toggle. Both put that cluster on the
 * wrong header. At `01:55` the magnifier / expand / `+` are drawn on the
 * **Fields** header near the top of the shot; the **Attachments** header three
 * rows below it carries a disclosure triangle and the count `1`, and nothing
 * else. `02:00`, where the section has scrolled to the middle of the viewport,
 * shows the same thing at a larger size.
 *
 * So the header control this row really asks for is THE COUNT, and that is what
 * is checked. Building a grid/list toggle to satisfy the row's wording would
 * have been building to a summary of a frame instead of to the frame.
 *
 * WHY THE FIXTURE USES LINK ATTACHMENTS. `POST /tasks/:id/attachments` with a
 * `url` is the product's own second attachment path (the composer's "attach by
 * link"), and it produces rows with a resolvable `url` — which is exactly what
 * the two link actions are about. This paragraph used to add that R2 was not
 * configured here or in CI; every lane and the CI job now run `s3-stub.mjs`,
 * and the last section uploads a real file to prove that removing one still
 * deletes its object while removing a link deletes nothing.
 *
 * AND THE LINKS WERE BEING SIGNED. "Attach by link" stores the URL where an
 * upload stores its key, and every reader signed it as a key: the API handed
 * back `${CDN}/https://…` or a presigned GET for an object named after the
 * URL, and removing one sent the bucket a DELETE for it. The anchor checks
 * compared the card with the API's url and passed, because both were the same
 * dead address. The checks added below compare with what was LINKED.
 *
 *   node test/e2e/task-attachments.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'
import { storeBase, storeRequests } from './lib/store.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 17

const REPO = path.resolve(import.meta.dirname, '../..')
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const STORE = storeBase(API_PORT, argOf('--store', undefined))
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  // The SENTENCE, then the reason. This printed `${bad ?? good}`, so a failing
  // check named only its reason and never itself — and for a check inside a
  // loop the reason is all a reader (or `check-break-reddened.mjs`) has to go
  // on. Seventy suites shared the line.
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` \u2014 ${bad}` : ''}`) }
}

/* `apiAs` never throws on a status — it resolves `{status, data, error}`. Judged
 * on `status`, every time. It is lib/fixture.mjs's one client, not a copy
 * (`suite-hygiene/apiAs-duplicated-62`), and like the copy it throws only when
 * nothing answers at all. */
const apiAs = apiAsAt(API, { noAnswer: 'throw' })

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let sql = null

const TAG = `e2e-attach-${Date.now()}`
/** The fixture's own size, so "the count is 3" is not a claim about the database. */
const SEEDED = 3

/*
 * EVERY CLICK IN THIS SUITE IS BOUNDED. A control one of this suite's own break
 * patches removes is a failing check below; an unqualified `.click()` is instead
 * thirty seconds and a run that ends where it stood, with the checks after it
 * never reported. Eleven patches across nine suites did exactly that before this
 * was applied ahead of the runs rather than after them.
 */
try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  if (!workspaceId) throw new Error('no workspace')

  const space = (await A('/spaces', { method: 'POST', body: { workspaceId, name: `Space ${TAG}` } })).data
  const project = (await A('/projects', { method: 'POST', body: { spaceId: space.id, name: `Project ${TAG}` } })).data
  const list = (await A('/lists', { method: 'POST', body: { projectId: project.id, name: `List ${TAG}` } })).data
  const task = (await A('/tasks', { method: 'POST', body: { listId: list.id, title: `Subject ${TAG}` } })).data
  if (!task?.id) throw new Error('could not make a task')

  for (let i = 0; i < SEEDED; i += 1) {
    const r = await A(`/tasks/${task.id}/attachments`, {
      method: 'POST',
      body: {
        fileName: `file-${i}-${TAG}.png`,
        url: `https://example.invalid/${TAG}/${i}.png`,
        contentType: 'image/png',
        sizeBytes: 1024 * (i + 1),
      },
    })
    if (r.status >= 400) throw new Error(`seeding attachment ${i} answered ${r.status}`)
  }

  const seeded = await A(`/tasks/${task.id}/attachments`)
  const seededRows = seeded.data ?? []
  chk(
    seeded.status === 200 && seededRows.length === SEEDED,
    `the fixture put ${SEEDED} attachments on a task of its own`,
    `GET /tasks/:id/attachments answered ${seeded.status} with ${seededRows.length} rows against ${SEEDED} seeded`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ the panel, frame `01:55`')

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await ctx.newPage()

  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  const settleCookies = async () => {
    const accept = page.getByTestId('cookie-accept').first()
    if (await accept.isVisible().catch(() => false)) { await accept.click().catch(() => {}); return }
    const fallback = page.locator('button:has-text("Accept")').first()
    if (await fallback.isVisible().catch(() => false)) await fallback.click().catch(() => {})
  }
  await settleCookies()
  await page.goto(
    `${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${list.id}?task=${task.id}`,
    { waitUntil: 'domcontentloaded' },
  )
  await settleCookies()
  if (!(await waitUntil(() => page.getByTestId('task-tab-overview').isVisible().catch(() => false), { timeoutMs: 25_000 }))) {
    throw new Error('the task sheet never mounted')
  }
  await page.getByTestId('task-tab-attachments').click({ timeout: 8000 }).catch(() => {})
  const cards = page.getByTestId('attachment-card')
  if (!(await waitUntil(async () => (await cards.count()) === SEEDED, { timeoutMs: 20_000 }))) {
    throw new Error(`the attachments panel drew ${await cards.count()} cards, not ${SEEDED}`)
  }

  const header = page.getByTestId('task-attachments-header')
  // DRAWN: the header is shown, and then its innerText leaves out a count hidden inside it.
  chk(
    (await header.isVisible().catch(() => false))
      && (await header.getAttribute('data-count')) === String(SEEDED)
      && ((await header.innerText()) ?? '').includes(String(SEEDED)),
    `the header carries the frame's count — ${SEEDED}, drawn as well as recorded`,
    `the header reads "${(await header.textContent().catch(() => '—'))?.trim()}" with data-count=` +
      `${await header.getAttribute('data-count').catch(() => '—')} against ${SEEDED} attachments`,
  )

  chk(
    (await page.getByTestId('attachment-thumb').count()) === SEEDED,
    `every one of the ${SEEDED} is drawn as a thumbnail card, which is what frame \`02:00\` shows`,
    `${await page.getByTestId('attachment-thumb').count()} thumbnails for ${SEEDED} attachments`,
  )

  /*
   * ONE action cluster per card. Counted rather than eyeballed because
   * `attachment-actions` is what every later check locates by, and two clusters
   * under one card would make ".first()" mean whichever React happened to draw
   * first.
   */
  chk(
    (await page.getByTestId('attachment-actions').count()) === SEEDED,
    'each card carries exactly one hover-action cluster',
    `${await page.getByTestId('attachment-actions').count()} action clusters over ${SEEDED} cards`,
  )

  /*
   * HIDDEN UNTIL HOVER, MEASURED. `toBeVisible()` would pass on a cluster that
   * is always painted — it has a box either way — so this reads the computed
   * opacity before and after the pointer arrives. A frame draws these over the
   * thumbnail, not beside it permanently.
   */
  const firstCard = cards.first()
  const firstActions = page.getByTestId('attachment-actions').first()
  const opacityOf = (loc) => loc.evaluate((el) => Number(getComputedStyle(el).opacity))
  const before = await opacityOf(firstActions)
  await firstCard.hover({ timeout: 8000 }).catch(() => {})
  const shown = await waitUntil(async () => (await opacityOf(firstActions)) > 0.9, { timeoutMs: 8_000 })
  const after = await opacityOf(firstActions)
  chk(
    before < 0.1 && shown,
    `the actions are invisible at rest (opacity ${before}) and come up on hover (opacity ${after})`,
    before >= 0.1
      ? `the actions are already at opacity ${before} before the pointer arrives — they are not hover actions, ` +
        'they are three icons permanently on every card'
      : `hovering left them at opacity ${after}`,
  )

  /*
   * GEOMETRY: the cluster belongs to ITS card. A cluster measured outside the
   * card's box would still be "visible" and still be wired to the right id
   * while pointing at the wrong row on screen.
   */
  // `boundingBox()` THROWS when the locator matches nothing — it waits for the
  // element first — and returns null only for one that exists with no box. Every
  // check below reads the size through `?? 0` or a null test, so absence reports
  // as zero and reddens; unguarded it spent thirty seconds and ended the section
  // (ledger §10).
  const cardBox = await firstCard.boundingBox({ timeout: 6000 }).catch(() => null)
  const actionsBox = await firstActions.boundingBox({ timeout: 6000 }).catch(() => null)
  chk(
    !!cardBox && !!actionsBox
      && actionsBox.x >= cardBox.x - 1 && actionsBox.y >= cardBox.y - 1
      && actionsBox.x + actionsBox.width <= cardBox.x + cardBox.width + 1
      && actionsBox.y + actionsBox.height <= cardBox.y + cardBox.height + 1,
    'and the cluster sits inside its own card\'s box',
    `the cluster is at ${JSON.stringify(actionsBox)} against a card at ${JSON.stringify(cardBox)}`,
  )

  /*
   * THE SAME OBJECT, NOT THE SAME STRING — and the difference only appeared
   * once the lanes gained an object store.
   *
   * These two checks compared a rendered `href` against the url the API had
   * just returned, by `===`. That was a fair proxy while storage was
   * unconfigured and the url was a static value. With a store configured,
   * `r2.getObjectUrl` PRESIGNS on every call, so two reads two seconds apart
   * differ in `X-Amz-Date` and `X-Amz-Signature` and the equality can never
   * hold. The baseline went 11 passed 2 failed, and `wt-break.sh` correctly
   * REFUSED to run the set: against a red baseline no patch can be told apart
   * from what is already broken.
   *
   * The intent was never the query string. It was "this anchor points at THIS
   * attachment's file, not a placeholder and not a sibling's". Origin plus
   * pathname carries the bucket and the object key, which is exactly that —
   * and it still fails on `#`, on an absent href, and on another attachment's
   * key, which are the three things the check is for.
   */
  const sameObject = (a, b) => {
    if (!a || !b) return false
    try {
      const [x, y] = [new URL(a), new URL(b)]
      return x.origin === y.origin && x.pathname === y.pathname
    } catch {
      // Not a url on one side or the other: fall back to exact equality rather
      // than letting a parse failure read as a match.
      return a === b
    }
  }

  const firstRow = seededRows.find((r) => (r.fileName ?? '').includes('file-0-'))
  const download = page.getByTestId('attachment-download').first()
  // A chk MESSAGE is an argument, so it is evaluated on a pass as well as a fail:
  // both reads are bounded and caught up here rather than inside the call. The
  // anchor is a locator held in a variable — the shape rule six could not see
  // until it learnt to track locator variables.
  const dlHref = await download.getAttribute('href', { timeout: 8000 }).catch(() => null)
  const dlDownload = await download.getAttribute('download', { timeout: 8000 }).catch(() => null)
  chk(
    dlDownload !== null && !!dlHref && dlHref !== '#' && sameObject(dlHref, firstRow?.url),
    'Download is a real anchor with a `download` attribute, pointing at THIS attachment\'s url',
    `the download anchor points at ${JSON.stringify(dlHref)} with download=${JSON.stringify(dlDownload)}; ` +
      `the attachment's own url is "${firstRow?.url}"`,
  )

  const expand = page.getByTestId('attachment-expand').first()
  // The same shape, and the same reason: the message runs either way, so these
  // reads are bounded and caught above the call, off a locator held in a variable.
  const expandTarget = await expand.getAttribute('target', { timeout: 8000 }).catch(() => null)
  const expandHref = await expand.getAttribute('href', { timeout: 8000 }).catch(() => null)
  // `!!expandHref` first: both sides of the url comparison can be absent — the
  // read answers null for an anchor with no href, and `firstRow?.url` answers
  // undefined for a row that was never seeded — and a check that compares two
  // absences is a check that passes on the defect. The sibling above carries
  // the same guard as `!!dlHref`.
  chk(
    expandTarget === '_blank' && !!expandHref && sameObject(expandHref, firstRow?.url),
    'and Expand opens the same file in a new tab',
    `the expand anchor is href=${JSON.stringify(expandHref)} target=${JSON.stringify(expandTarget)}`,
  )

  /*
   * A LINK IS HANDED BACK AS IT WAS LINKED. The two checks above compare an
   * anchor with the url the API returned — and passed for as long as the API
   * signed every link as though it were a key in the bucket, because both sides
   * were the same dead address. This one compares with what the fixture
   * LINKED, which is what somebody pressing it expects to reach.
   */
  const LINK0 = `https://example.invalid/${TAG}/0.png`
  chk(
    firstRow?.kind === 'link' && firstRow?.url === LINK0 && dlHref === LINK0,
    'and for a linked file that url IS the link, byte for byte — not signed as if it were a key in the bucket',
    `the API answered kind=${JSON.stringify(firstRow?.kind)} url=${JSON.stringify(firstRow?.url)} and the card ` +
      `links ${JSON.stringify(dlHref)}; the fixture linked ${JSON.stringify(LINK0)}`,
  )

  /*
   * NO DEAD LINKS, over a set proved non-empty first. `href="#"` on a file that
   * is still arriving was a real defect in the comment clip player (§0), and a
   * negative assertion over a list that can be empty is true when there is
   * nothing to check.
   */
  const anchors = await page.locator('[data-testid="attachment-card"] a').evaluateAll((els) =>
    els.map((el) => el.getAttribute('href')),
  )
  chk(
    anchors.length >= SEEDED * 2 && anchors.every((h) => !!h && h !== '#'),
    `all ${anchors.length} links on the cards point somewhere — none is a paperclip over "#"`,
    anchors.length < SEEDED * 2
      ? `only ${anchors.length} anchors were found over ${SEEDED} cards, so "none of them is dead" would have been ` +
        'a claim about almost nothing'
      : `a link points at "${anchors.find((h) => !h || h === '#')}"`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ "more" removes it, on the server, and the header follows')

  /*
   * NOT A THROW. This was `throw new Error('the attachment "more" menu never
   * opened')`, and `tat-6-cluster-escapes-its-card` moves the action cluster out
   * of its card — so the menu was unreachable and the run ended at 10 of 13 with
   * `SUITE ERROR`, three checks never asked. A menu that will not open is a
   * reason the removal could not be tried, and a reason belongs in the detail of
   * a failing check.
   */
  // What the bucket had been asked before this removal, so the check after it
  // reads only this removal's traffic.
  const logBefore = await storeRequests(STORE)
  await page.getByTestId('attachment-more').first().click({ timeout: 8000 }).catch(() => {})
  const removeItem = page.getByTestId('attachment-remove')
  const menuOpened = await waitUntil(() => removeItem.isVisible().catch(() => false), {
    timeoutMs: 10_000,
  })
  if (menuOpened) await removeItem.click({ timeout: 8000 }).catch(() => {})

  const gone =
    menuOpened && (await waitUntil(async () => (await cards.count()) === SEEDED - 1, { timeoutMs: 20_000 }))
  const serverAfter = (await A(`/tasks/${task.id}/attachments`)).data ?? []
  chk(
    gone && serverAfter.length === SEEDED - 1,
    `Remove took it off the server too — ${serverAfter.length} rows left, not just ${SEEDED - 1} on screen`,
    menuOpened
      ? `the screen shows ${await cards.count()} and the server holds ${serverAfter.length}: a removal that only ` +
        'happened in the browser comes back on the next load'
      : 'the attachment "more" menu never opened, so Remove could not be tried at all',
  )

  // The message is evaluated either way, so the count is read once, bounded and
  // caught. `header` is a locator held in a variable — the shape rule six could
  // not see until it learnt to track locator variables. A missing header reads
  // as null, which is not `String(SEEDED - 1)`, so absence reddens.
  const headerCountAfter = await header.getAttribute('data-count', { timeout: 8000 }).catch(() => null)
  chk(
    headerCountAfter === String(SEEDED - 1),
    'and the header\'s count follows the removal rather than staying where it was drawn',
    `the header still reads ${JSON.stringify(headerCountAfter)} after a removal — a count that is rendered ` +
      'once and never recomputed is the facade this audit names first',
  )

  /*
   * AND A LINK HAS NO OBJECT TO DELETE. Removing one sent the bucket a DELETE
   * for the link itself, which S3 answers 204 whatever the key — so nothing
   * failed and nothing showed. The stub's request log is the only witness.
   * Its positive twin is the last section: removing an uploaded FILE still
   * deletes its object, so this cannot pass by the API deleting nothing.
   */
  const logAfter = await storeRequests(STORE)
  const linkDeletes = (logAfter?.requests ?? []).filter(
    (r) => r.n > (logBefore?.seq ?? Infinity) && r.method === 'DELETE' && /^https?:/i.test(r.key),
  )
  chk(
    logBefore !== null && logAfter !== null && gone && linkDeletes.length === 0,
    'and removing a linked file sends nothing to the bucket — there is no object behind a link',
    logBefore === null || logAfter === null
      ? `the store at ${STORE} gave no request log, so what the removal sent cannot be read`
      : gone
        ? `the removal sent ${linkDeletes.length} DELETE(s) for a link: ${JSON.stringify(linkDeletes.map((r) => r.key))}`
        : 'the removal never happened, so there is nothing to read the bucket traffic of',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ the rail icon and its tooltip, frames `06:05`–`06:08`')

  const rail = page.getByTestId('task-related-items-rail')
  chk(
    (await rail.isVisible().catch(() => false))
      && ((await rail.getAttribute('title')) ?? '').toLowerCase().includes('related'),
    // THE PASS MESSAGE IS EVALUATED EVEN WHEN THE CHECK FAILS, because it is an
    // argument. The FAIL message below already reads the title through a catch;
    // this one did not, so an absent rail threw here — out of the sentence
    // describing the rail being present.
    `the icon is there and its tooltip reads "${await rail.getAttribute('title', { timeout: 3_000 }).catch(() => '—')}"`,
    `the rail icon is ${(await rail.isVisible().catch(() => false)) ? 'present' : 'absent'} with title ` +
      `"${await rail.getAttribute('title').catch(() => '—')}"`,
  )

  await rail.click({ timeout: 8000 }).catch(() => {})
  const panel = page.getByTestId('related-items-panel')
  const opened = await waitUntil(() => panel.isVisible().catch(() => false), { timeoutMs: 15_000 })
  /*
   * ONE panel, not two. The icon is a second entry point to the panel the tab
   * strip already opens; a second copy of it would be the duplicated-list bug
   * with an icon on it, and both copies would look right in a screenshot.
   */
  // And here too: the message runs on a pass as well as a fail, so the pressed
  // state is read once, bounded and caught, off `rail` — a locator held in a
  // variable, the shape rule six could not see until it learnt to track them.
  const railPressed = await rail.getAttribute('aria-pressed', { timeout: 8000 }).catch(() => null)
  chk(
    opened && (await panel.count()) === 1 && railPressed === 'true',
    'pressing it opens the one Related Items panel the tab already opens — one panel in the document, not two',
    opened
      ? `${await panel.count()} Related Items panels are in the document, and the icon reports ` +
        `aria-pressed=${JSON.stringify(railPressed)}`
      : 'the icon did not open the panel: a tooltip over a dead control',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ removing an uploaded file still deletes its object')

  /*
   * THE TWIN OF THE LINK CHECK ABOVE. An uploaded file, the product's own way —
   * presign, PUT, record — and then removed: its object must be deleted, and
   * that DELETE must be in the log. Without this, "removing a link sends
   * nothing" would pass for an API that stopped deleting anything at all.
   */
  const FILE_NAME = `upload-${TAG}.txt`
  const FILE_BYTES = Buffer.from(`attachment bytes ${TAG}`)
  const pre = await A(`/tasks/${task.id}/attachments/presign`, {
    method: 'POST',
    body: { fileName: FILE_NAME, contentType: 'text/plain', sizeBytes: FILE_BYTES.length },
  })
  const FILE_KEY = pre.data?.storageKey ?? null
  const put = pre.data?.uploadUrl
    ? await fetch(pre.data.uploadUrl, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: FILE_BYTES })
        .then((r) => r.status, () => 0)
    : 0
  const recorded = FILE_KEY
    ? await A(`/tasks/${task.id}/attachments`, {
        method: 'POST',
        body: { fileName: FILE_NAME, storageKey: FILE_KEY, contentType: 'text/plain', sizeBytes: FILE_BYTES.length },
      })
    : { status: 0, data: null }
  chk(
    recorded.status < 300 && recorded.data?.kind === 'file' && typeof recorded.data?.url === 'string' &&
      recorded.data.url !== FILE_KEY,
    'an uploaded file is recorded as a file, and its url is signed rather than the bare key',
    `presign answered ${pre.status}, the PUT ${put}, recording it ${recorded.status} with kind=` +
      `${JSON.stringify(recorded.data?.kind)} url=${JSON.stringify(recorded.data?.url ?? null).slice(0, 120)}`,
  )
  const beforeFileDelete = await storeRequests(STORE)
  const removed = recorded.data?.id
    ? await A(`/tasks/${task.id}/attachments/${recorded.data.id}`, { method: 'DELETE' })
    : { status: 0 }
  const afterFileDelete = await storeRequests(STORE)
  const fileDeletes = (afterFileDelete?.requests ?? []).filter(
    (r) => r.n > (beforeFileDelete?.seq ?? Infinity) && r.method === 'DELETE' && r.key === FILE_KEY,
  )
  chk(
    removed.status < 300 && fileDeletes.length === 1,
    'and removing it deletes exactly its object from the bucket',
    `the removal answered ${removed.status} and the bucket saw ${fileDeletes.length} DELETE(s) for ` +
      `${JSON.stringify(FILE_KEY)}${afterFileDelete === null ? ' — the store gave no request log at all' : ''}`,
  )
} catch (err) {
  failed += 1
  const frame = String(err?.stack ?? '').split('\n').find((l) => l.includes('task-attachments.mjs'))
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err?.message ?? err, frame ? `\n  at ${frame.trim()}` : '')
} finally {
  sql = await openDb().catch(() => null)
  if (sql) {
    await sql`delete from tasks where title like ${'%' + TAG}`.catch(() => {})
    await sql`delete from lists where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from projects where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from spaces where name like ${'%' + TAG}`.catch(() => {})
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
