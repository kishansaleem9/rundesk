/**
 * §V2-S13 frame `12:05` — **Create › Imports › Document files**.
 *
 * The submenu's second row. No frame opens it, so what a document import should
 * DO was decided from what this product already does: `tiptapToMarkdown` turns
 * a Doc into GitHub-flavoured Markdown and `GET /docs/:id/export` serves it.
 * Import is that run backwards.
 *
 * WHICH DECIDES THE CHECKS, and this suite is written against the difference.
 * "It worked" is trivially easy to assert here and nearly worthless: an
 * importer that dropped the whole file into ONE PARAGRAPH would satisfy every
 * check anyone would naturally write — a doc exists, it is not empty, the
 * request answered 201. So the load-bearing assertion is a ROUND TRIP:
 *
 *     the file in  →  a Doc  →  export it  →  the same file back
 *
 * `exportDocMarkdown` is a fair judge because this work did not touch it.
 *
 * AND THREE THINGS THAT FAIL SILENTLY, each of which was a real defect in this
 * endpoint before it shipped, and none of which any content check can see:
 *
 *   · the doc must be IN THE SEARCH INDEX — you import a document in order to
 *     find it later, and an unindexed one is there and unreachable. Measurable
 *     only where the API searches through Meilisearch, which a lane named in
 *     RUNDESK_LANE_SEARCH does (`meili-stub.mjs`); elsewhere the same two
 *     checks read the Postgres half (`lib/search.mjs`);
 *   · the title must come from the file's leading H1 and be CONSUMED, or every
 *     export/import cycle adds another heading while the content round trip
 *     stays green;
 *   · a write must not land in a workspace you do not belong to, which
 *     succeeds quietly — no error, no failing check, no log line.
 *
 * A REFUSAL HAS TO SAY WHICH FORMATS WORK. `attachment-text.ts` already
 * recorded that binary documents need "a heavy parser dependency" and are out
 * of scope, so a `.docx` is refused — and "unsupported file" would tell the
 * person holding one nothing about what to do next.
 *
 *   DATABASE_URL=postgres://…/rundesk_v1 node test/e2e/doc-import.mjs --api 3021 --dist apps/web/dist [--search 9301]
 */
import path from 'node:path'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { searchStubBase, searchEngine, stubDocument, stubRequests, searchesSince } from './lib/search.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/**
 * Exact, with `!==`. With `<`, a branch that quietly skipped becomes a shorter
 * run that still passes — and a suite whose subject is an importer has several
 * steps that only run once an earlier one really happened.
 */
/*
 * THIRTEEN, counted from the RUN rather than from the diff. This said 14 on
 * the first pass and the run reported "13 of 14 checks ran", which reads as a
 * skipped branch and was a miscount — the same slip `task-cover` made going
 * from 32 to 37. An exact comparison is what turned a wrong number into a
 * visible one instead of a quiet pass.
 *
 * SIXTEEN since the index became measurable: the search section asserts what
 * the index holds as well as what the endpoint finds, with the same two checks
 * whichever engine answers.
 */
const EXPECTED_CHECKS = 16

const REPO = path.resolve(import.meta.dirname, '../..')
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
/** The lane's Meilisearch stub, where it has one: 9300 + lane, `--search` or E2E_SEARCH_PORT. */
const SEARCH = searchStubBase(API_PORT, argOf('--search', undefined))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const TAG = `docimp-${Date.now()}`

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  // The SENTENCE, then the reason: a failing check that named only its reason
  // left `check-break-reddened.mjs` nothing to match a claim against.
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/*
 * Every block `tiptapToMarkdown` can EMIT, so the round trip is a statement
 * about the whole vocabulary rather than about paragraphs. The leading H1 is
 * the doc's title and is consumed on import, so it is not part of the body the
 * export is compared against.
 */
const TITLE = `Imported notes ${TAG}`
const BODY = [
  'Opening prose with **bold**, *italic* and `code`.',
  '',
  '## A section',
  '',
  '- a bullet',
  '  - a nested bullet',
  '',
  '1. first',
  '2. second',
  '',
  '- [x] done',
  '- [ ] not done',
  '',
  '> A quoted remark.',
  '',
  '```sql',
  'select 1',
  '```',
  '',
  '---',
  '',
  '| column | meaning |',
  '| --- | --- |',
  '| one | the first |',
  '',
  'A [link](https://example.com/x) and an ![image](https://example.com/p.png).',
  '',
].join('\n')
const FILE = `# ${TITLE}\n\n${BODY}`

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const API = `${stack.base}/api/v1`
const browser = await chromium.launch(launchOptions())
let madeDocId = null
let api = null

try {
  const auth = await login(API, EMAIL, PASSWORD)
  api = apiClient(API, auth.accessToken)

  const wsRes = await api('/workspaces')
  if (wsRes.status >= 300) throw new Error(`GET /workspaces answered ${wsRes.status}`)
  const workspaceId = (wsRes.data ?? [])[0]?.workspace?.id ?? (wsRes.data ?? [])[0]?.id
  if (!workspaceId) throw new Error('this account can see no workspace')

  // ── the tab the frame draws ───────────────────────────────────────────────
  console.log('\n▶ frame `12:05` — Imports offers a Document files row')
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(`${stack.base}/app/${workspaceId}/import`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="import-tabs"]', { timeout: 20_000 }).catch(() => {})

  chk(
    (await page.getByTestId('import-tab-doc').count()) === 1,
    'the Imports page offers a Document files tab, as the frame\'s submenu lists one',
    'there is no Document files tab — the frame draws the row and this page did not',
  )
  await page.getByTestId('import-tab-doc').click({ timeout: 10_000 }).catch(() => {})
  chk(
    await page.getByTestId('import-doc-panel').isVisible().catch(() => false),
    'and pressing it opens a panel rather than a row that does nothing',
    'the Document files tab drew no panel — a tab named after an action that cannot start',
  )
  /*
   * A read in a chk MESSAGE is evaluated on a pass as well as a fail, so it is
   * bounded and caught up here rather than inside the call (rule six).
   */
  const accepted = (
    (await page.getByTestId('import-doc-accepted').innerText({ timeout: 8000 }).catch(() => null)) ?? ''
  ).trim()
  chk(
    /\.md\b/.test(accepted) && /\.txt\b/.test(accepted),
    'the panel names the formats it accepts, rather than leaving somebody to guess',
    `the accepted-formats line read ${JSON.stringify(accepted)}`,
  )

  // ── the import itself ─────────────────────────────────────────────────────
  console.log('\n▶ a Markdown file becomes a Doc, titled from its own first heading')
  const mdPath = path.join(tmpdir(), `${TAG}.md`)
  writeFileSync(mdPath, FILE)
  await page.getByTestId('import-doc-file').setInputFiles(mdPath, { timeout: 10_000 }).catch(() => {})
  const landed = await waitUntil(
    () => page.getByTestId('import-doc-result').isVisible().catch(() => false),
    { timeoutMs: 25_000 },
  )
  chk(
    landed,
    'choosing a document reports what it made, rather than nothing visible',
    'no result appeared — an import that says nothing is the state the Upload tab shipped in',
  )
  madeDocId = await page
    .getByTestId('import-doc-result')
    .getAttribute('data-doc-id', { timeout: 8000 })
    .catch(() => null)
  chk(
    typeof madeDocId === 'string' && madeDocId.length > 0,
    'and links to the doc it made, so the import is not a sentence you have to go hunting after',
    `the result carried data-doc-id=${JSON.stringify(madeDocId)}`,
  )
  const shownTitle = (
    (await page.getByTestId('import-doc-open').innerText({ timeout: 8000 }).catch(() => null)) ?? ''
  ).trim()
  chk(
    shownTitle === TITLE,
    'the doc is named by the file\'s own leading heading, not by "Untitled"',
    `the link read ${JSON.stringify(shownTitle)}, expected ${JSON.stringify(TITLE)}`,
  )

  // ── the round trip, which is the check a facade cannot pass ───────────────
  console.log('\n▶ and the doc exports back as the file that made it')
  const docRes = madeDocId ? await api(`/docs/${madeDocId}`) : { status: 599, data: null }
  chk(
    docRes.status < 300 && (docRes.data?.title ?? '') === TITLE,
    'the doc really exists on the server under that title',
    `GET /docs/:id answered ${docRes.status} with title ${JSON.stringify(docRes.data?.title ?? null)}`,
  )
  /*
   * THE WHOLE POINT OF THE SUITE. An importer that kept the text and lost the
   * SHAPE — every heading a paragraph, every list a line — passes every other
   * check here. Only the export can tell, and it knows nothing about the
   * parser.
   */
  const exported = madeDocId
    ? await fetch(`${API}/docs/${madeDocId}/export?format=markdown`, {
        headers: { authorization: `Bearer ${auth.accessToken}` },
      })
        .then((r) => (r.ok ? r.text() : null))
        .catch(() => null)
    : null
  /*
   * AND THE ROUND TRIP IS BLIND TO ONE THING, which a break run proved rather
   * than a reading. `doc-import-1-title-heading-kept` leaves the leading H1 in
   * the BODY, and the export compensates exactly: its rule is "prepend
   * `# <title>` unless the body already opens with one", so a doc carrying its
   * own title as content exports to the same bytes as one that does not. The
   * patch reddened NOTHING. So the stored document is asserted directly below,
   * beside the round trip rather than instead of it.
   */
  chk(
    exported === FILE,
    'exporting it gives back the file byte for byte — headings, lists, tables, code and links all survived',
    exported === null
      ? 'the export answered nothing at all'
      : `the export differs from the file it was made from; first difference at ` +
        `${[...FILE].findIndex((c, i) => exported[i] !== c)} of ${FILE.length}`,
  )

  const firstBlock = docRes.data?.content?.content?.[0]
  chk(
    !!firstBlock && !(firstBlock.type === 'heading' && Number(firstBlock.attrs?.level) === 1),
    'and the title was CONSUMED — the doc does not carry its own heading twice',
    `the doc's first block is ${JSON.stringify(firstBlock?.type)} level ` +
      `${JSON.stringify(firstBlock?.attrs?.level)}; a leading h1 here is the title stored twice, ` +
      'which the export hides by not prepending a second one',
  )

  // ── the two that fail silently ────────────────────────────────────────────
  /*
   * WHAT THIS PROVES, AND ON WHICH ENGINE (`commit-log/log-68c0345-1`).
   *
   * It was written to assert that `indexDocInSearch` runs, and for a week it
   * could not: `SearchService.search` uses Meilisearch only when the API was
   * started with one, no lane was, and `doc-import-2` reddened NOTHING when it
   * removed the index call. So indexing was recorded as unmeasurable, and
   * `doc-import-2` was re-aimed at the opening revision below.
   *
   * A lane that RUNDESK_LANE_SEARCH names now searches through
   * `meili-stub.mjs`, and this section asks which engine answers
   * (`lib/search.mjs` — the index configured by the API running now) and
   * holds either way, with the same two checks:
   *
   *   · where Meilisearch answers, the doc is IN THE INDEX — read back from
   *     the stub's own record under its title, its text and its workspace —
   *     and the endpoint finds it THROUGH the index: the stub received this
   *     run's query with the workspace filter, and on that path a doc comes
   *     from the index and from nowhere else, so an import that was never
   *     indexed is never found (`doc-import-5`, which needs such a lane);
   *   · where it does not, the doc is in the docs table under the title and
   *     the plaintext the database search matches, and the endpoint finds it.
   */
  const engine = await searchEngine(API, SEARCH)
  console.log(
    `\n▶ the imported doc can be found again — this lane searches through ${engine.meili ? 'Meilisearch' : 'Postgres'} (${engine.said})`,
  )
  const searchedFrom = engine.meili ? (await stubRequests(SEARCH))?.seq ?? 0 : 0
  const found = await waitUntil(
    async () => {
      const r = await api(`/search/${workspaceId}?q=${encodeURIComponent(TAG)}`)
      /*
       * THE INDEX PREFIXES ITS IDS. A hit for a doc comes back as
       * `id: "doc-<uuid>"` with `entityType: "doc"`, not as the bare uuid —
       * so comparing against `madeDocId` matched NOTHING and this check failed
       * against a product that indexes correctly. A check that fails for the
       * wrong reason is worse than no check: `doc-import-2-never-indexed`
       * would have "reddened" a check that was already red, and only
       * `wt-break.sh` refusing a non-green baseline would have caught it.
       */
      const hits = r.data?.results ?? r.data ?? []
      return (
        Array.isArray(hits) &&
        hits.some((h) => h.entityType === 'doc' && h.id === `doc-${madeDocId}`)
      )
    },
    { timeoutMs: 20_000 },
  )
  /*
   * Written AFTER the import answers (`void this.indexDocInSearch`), so it is
   * waited for rather than sampled — and by the time search found it through
   * the index, the index had it.
   */
  let indexed = null
  if (engine.meili && madeDocId) {
    await waitUntil(async () => (indexed = await stubDocument(SEARCH, `doc-${madeDocId}`)) !== null, { timeoutMs: 15_000 })
  }
  const plaintext = String(docRes.data?.plaintext ?? '')
  chk(
    engine.meili
      ? indexed?.title === TITLE && indexed?.entityType === 'doc' && indexed?.workspaceId === workspaceId &&
          String(indexed?.content ?? '').includes('Opening prose')
      : docRes.status < 300 && docRes.data?.title === TITLE && plaintext.includes('Opening prose'),
    'the doc is in what this lane’s search reads — the Meilisearch index, under its title, its text and its workspace, where one answers; the docs table the database search matches, where none does',
    engine.meili
      ? `the index holds ${indexed ? JSON.stringify({ title: indexed.title, entityType: indexed.entityType, workspaceId: indexed.workspaceId, content: String(indexed.content ?? '').slice(0, 40) }) : 'nothing'} under doc-${madeDocId} — the import was not indexed`
      : `GET /docs/:id answered ${docRes.status} with title ${JSON.stringify(docRes.data?.title ?? null)} and plaintext ${JSON.stringify(plaintext.slice(0, 40))}`,
  )
  const throughIndex = engine.meili ? await searchesSince(SEARCH, searchedFrom, TAG) : []
  chk(
    found && (!engine.meili || throughIndex.some((r) => (r.filter ?? []).includes(`workspaceId = "${workspaceId}"`))),
    'the search endpoint finds it, so an imported document is reachable again — through the index, with its workspace’s filter, where Meilisearch answers',
    !found
      ? 'search returned no hit for this doc — it exists and cannot be found, which no check about its content would notice'
      : `search found it, and the stub received ${throughIndex.length} search(es) for it with the workspace filter — found, but not through the index this lane runs`,
  )

  /*
   * THE OPENING REVISION, which `create` writes and the import did not when it
   * was first written. Without it the first edit has nothing to diff against
   * and the document's history begins AFTER its content — a silent loss, and
   * unlike the index this one is observable without extra infrastructure.
   */
  const revRes = madeDocId ? await api(`/docs/${madeDocId}/revisions`) : { status: 599, data: null }
  const revisions = Array.isArray(revRes.data) ? revRes.data : []
  chk(
    revRes.status < 300 && revisions.length >= 1,
    'and it has an opening revision, so the first edit has something to diff against',
    `GET /docs/:id/revisions answered ${revRes.status} with ${revisions.length} revision(s) — ` +
      'a doc whose history starts after its content has lost the import itself',
  )

  console.log('\n▶ what it refuses, and whether it says why')
  const docxPath = path.join(tmpdir(), `${TAG}.docx`)
  writeFileSync(docxPath, 'PK\u0003\u0004 not really a docx')
  await page.getByTestId('import-doc-file').setInputFiles(docxPath, { timeout: 10_000 }).catch(() => {})
  const refused = await waitUntil(
    () => page.getByTestId('import-doc-error').isVisible().catch(() => false),
    { timeoutMs: 20_000 },
  )
  const refusal = (
    (await page.getByTestId('import-doc-error').innerText({ timeout: 8000 }).catch(() => null)) ?? ''
  ).trim()
  chk(
    refused && refusal.length > 0,
    'a format it cannot read is refused out loud',
    `choosing a .docx reported ${refused ? JSON.stringify(refusal) : 'nothing at all'}`,
  )
  chk(
    /\.md\b/.test(refusal) || /markdown/i.test(refusal),
    'and the refusal names the formats that DO work, rather than only saying no',
    `the refusal read ${JSON.stringify(refusal)} — "unsupported" tells somebody holding a .docx nothing`,
  )

  console.log('\n▶ and what it refuses at the API, where the browser cannot help')
  const empty = await api(`/workspaces/${workspaceId}/docs/import`, {
    method: 'POST',
    body: { fileName: 'blank.md', markdown: '   \n\n  ' },
  })
  chk(
    empty.status === 400,
    'an empty file is refused rather than making a doc with nothing in it',
    `importing whitespace answered ${empty.status}`,
  )
  /*
   * A WRITE THAT LANDS IN THE WRONG WORKSPACE SUCCEEDS — no error, no failing
   * check, no log line — so this is the only place it can be caught. The
   * endpoint shipped without `WorkspaceMemberGuard` and was green in
   * twenty-nine unit cases while writing into somebody else's workspace.
   */
  const foreign = await api('/workspaces/00000000-0000-0000-0000-000000000000/docs/import', {
    method: 'POST',
    body: { fileName: 'x.md', markdown: '# x\n' },
  })
  chk(
    foreign.status === 403 || foreign.status === 404,
    'and a workspace you do not belong to refuses the write rather than accepting it quietly',
    `importing into a foreign workspace answered ${foreign.status} — a write in the wrong workspace succeeds silently`,
  )

  await ctx.close()
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${err?.message ?? err}`)
} finally {
  // This run's doc only — the e2e database is shared, so nothing is found by
  // counting and nothing is removed by pattern. Gone, or already gone (404), is
  // fine; any other answer, or none, is said above the totals.
  if (api && madeDocId) {
    try {
      const res = await api(`/docs/${madeDocId}`, { method: 'DELETE' })
      if (![200, 204, 404].includes(res.status)) console.log(`  cleanup left behind: DELETE /docs/${madeDocId} answered ${res.status}`)
    } catch (err) {
      console.log(`  cleanup left behind: DELETE /docs/${madeDocId} got no answer (${err?.message ?? err})`)
    }
  }
  await browser.close().catch(() => {})
  // `close`, not `stop`: the stack has no `stop`, and `stack.stop?.()` was an
  // optional call on nothing — it closed nothing, the server held two
  // keep-alive sockets open, and every run finished its checks and then sat
  // until `timeout` killed it at 900s (exit 124 under a "15 passed" line).
  stack.close()
}

const ran = passed + failed
console.log(`\n${passed} passed, ${failed} failed`)
if (ran !== EXPECTED_CHECKS) {
  console.log(
    `\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run did not run the suite, ` +
      'so "0 failed" describes the part it reached and nothing else.',
  )
}
process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
