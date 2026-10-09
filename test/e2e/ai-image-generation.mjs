/**
 * THE AI MAKES IMAGES, FROM A COMMENT, A MESSAGE AND THE ASK AI DOCK
 * (`ledger-rows/row-870`, and the "Images generated" tile of
 * `commit-log/log-39863ff-1`).
 *
 * ClickUp's AI makes images from a task's comment box or a Chat message field —
 * the AI button, a description, and the pictures, up to ten for one ask — and
 * from its Ask button, through Brain's Generate image (its help centre,
 * "Generate images with Brain AI", through search excerpts). There
 * was no image generation here at all: the only model client was Anthropic's,
 * which makes none, and the AI value page said "Rundesk AI does not generate
 * images" on the Images generated tile.
 *
 * Against the lane's media stub, which answers OpenAI's images API with PNGs
 * it draws from the prompt (`scripts/e2e-lanes/media-stub.mjs`): what the page
 * draws is what the service made, the chosen pictures land on the comment and
 * the message as files in the store, the run is written down where the AI
 * value page counts it, and the refusals are said.
 *
 *   node test/e2e/ai-image-generation.mjs --api 3029 --dist /tmp/claude-0/dist-9
 */
import path from 'node:path'
import { stat } from 'node:fs/promises'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'
import { mediaBase } from './lib/media.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 9

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}
const MEDIA = mediaBase(API_PORT, argOf('--media', undefined))

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`
const control = async (route, body) => {
  const res = await fetch(`${MEDIA}${route}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`the media stub answered ${res.status} to ${route}`)
  return res.json()
}

const stamp = Date.now()
const TAG = `aig${stamp}`
const PASSWORD = 'AiImages@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
// lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). Never throws: `{status, data, error}`.
const apiAs = apiAsAt(API)
let sql = null
let browser = null
let A = null
const workspacesMade = []

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the task is made by SQL and the runs are read by it')
  await control('/__control/images/reset', {})
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: `AI images ${TAG}` } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  const WS = made.data.id
  workspacesMade.push({ id: WS, as: A })
  // A guest of the workspace, whom the AI's routes refuse as they refuse every guest.
  const guestEmail = `${TAG}-guest@rundesk.invalid`
  const guest = await signUpApi(API, { fullName: `Guest ${TAG}`, email: guestEmail, password: PASSWORD, organizationName: `Guest ${stamp}`, organizationSlug: `aig-guest-${stamp}` })
  const G = apiAs(guest.accessToken)
  if (guest.workspaces?.[0]?.id) workspacesMade.push({ id: guest.workspaces[0].id, as: G })
  const joined = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email: guestEmail, role: 'guest' } })
  if (!joined.ok) throw new Error(`could not add the guest: ${said(joined)}`)

  const [space] = await sql`insert into spaces (workspace_id, name) values (${WS}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  const [task] = await sql`insert into tasks (list_id, title) values (${list.id}, ${`Illustrate me ${TAG}`}) returning id`
  const channel = await A(`/workspaces/${WS}/chat/channels`, { method: 'POST', body: { name: `${TAG}-pictures` } })
  if (!channel.ok || !channel.data?.id) throw new Error(`could not make the channel: ${said(channel)}`)

  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  // Downloads accepted: the dock's Download is a check of its own.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', acceptDownloads: true })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})

  /** The pictures drawn, each decoded by the page: its width, and whether it is chosen. */
  const drawnImages = (scope) =>
    scope.locator('[data-testid="image-generator-image"]').evaluateAll((els) =>
      els.map((el) => {
        const img = el.querySelector('img')
        return { loaded: !!img && img.complete && img.naturalWidth > 0, src: img?.getAttribute('src') ?? '', picked: el.getAttribute('data-picked') === 'true' }
      }),
    ).catch(() => [])
  const imageRuns = async () =>
    (await sql`select status, model from ai_usage where workspace_id = ${WS} and feature = 'image.generate' order by created_at`)
  /** The size of the PNG a data address holds. */
  const bytesOf = (src) => Buffer.from(src.slice(src.indexOf(',') + 1), 'base64').length
  /** The task's comment AI panel, opened from the composer's "+" menu, Brain — and set to make images. */
  const openCommentImages = async () => {
    await page.goto(`${B}/app/${WS}/${space.id}/${project.id}/${list.id}?task=${task.id}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('task-tab-comments').click({ timeout: 20_000 }).catch(() => {})
    await page.getByTestId('comment-plus').click({ timeout: 15_000 }).catch(() => {})
    await page.getByTestId('comment-plus-brain').click({ timeout: 8000 }).catch(() => {})
    const open = await waitUntil(() => page.getByTestId('comment-ai-panel').isVisible().catch(() => false), { timeoutMs: 10_000 })
    await page.getByTestId('comment-ai-mode').selectOption('image', { timeout: 5000 }).catch(() => {})
    return open
  }

  // ══ 1. FROM A COMMENT ══════════════════════════════════════════════════════
  console.log('\n▶ the comment box’s AI, asked for two pictures')
  const panelOpened = await openCommentImages()
  const commentPanel = page.getByTestId('comment-ai-panel')
  await commentPanel.getByTestId('image-generator-prompt').fill(`a lighthouse at dusk ${TAG}`, { timeout: 5000 }).catch(() => {})
  await commentPanel.getByTestId('image-generator-count').selectOption('2', { timeout: 5000 }).catch(() => {})
  await commentPanel.getByTestId('image-generator-run').click({ timeout: 5000 }).catch(() => {})
  const two = await waitUntil(async () => (await drawnImages(commentPanel)).filter((d) => d.loaded).length === 2, { timeoutMs: 20_000 })
  const drawn = await drawnImages(commentPanel)
  const asked = (await control('/__control/images/requests')).requests
  chk(
    panelOpened && two && drawn.every((d) => d.src.startsWith('data:image/png;base64,') && d.picked) && asked.length === 1 && asked[0].prompt === `a lighthouse at dusk ${TAG}` && asked[0].n === 2,
    'the comment box’s AI makes the pictures asked for — two, as the image service drew them for that description — each shown and chosen',
    `panel ${panelOpened ? 'open' : 'NOT open'}; drawn ${JSON.stringify(drawn.map((d) => ({ ...d, src: d.src.slice(0, 22) })))}; the service was asked ${JSON.stringify(asked.map((r) => [r.prompt, r.n]))}`,
  )

  // ══ 2. ONTO THE COMMENT ════════════════════════════════════════════════════
  console.log('\n▶ one of them added to the comment, and posted')
  await commentPanel.locator('[data-testid="image-generator-image"]').nth(1).click({ timeout: 5000 }).catch(() => {})
  await commentPanel.getByTestId('image-generator-add').click({ timeout: 5000 }).catch(() => {})
  await page.getByTestId('comment-input').fill(`Here is the picture ${TAG}`, { timeout: 5000 }).catch(() => {})
  await page.getByTestId('comment-post').click({ timeout: 5000 }).catch(() => {})
  // A comment's files are the task's attachments that name it.
  let commentFiles = []
  await waitUntil(async () => {
    commentFiles = await sql`
      select a.file_name, a.content_type, a.size_bytes from task_attachments a
      join task_comments c on c.id = a.comment_id
      where c.task_id = ${task.id} and c.body like ${`%${TAG}%`}`.catch(() => [])
    return commentFiles.length > 0
  }, { timeoutMs: 20_000 })
  const firstBytes = drawn[0]?.src ? bytesOf(drawn[0].src) : -1
  chk(
    commentFiles.length === 1 && commentFiles[0].content_type === 'image/png' && /^a-lighthouse-at-dusk-[a-z0-9-]*-1\.png$/.test(commentFiles[0].file_name) && Number(commentFiles[0].size_bytes) === firstBytes,
    'only the one left chosen is posted on the comment — the first picture, as a PNG of its very bytes, named after its description',
    `the comment holds ${JSON.stringify(commentFiles)}; the first picture is ${firstBytes} bytes`,
  )

  // ══ 3. FROM A MESSAGE ══════════════════════════════════════════════════════
  console.log('\n▶ the chat composer’s AI, asked for one picture')
  await page.goto(`${B}/app/${WS}/chat?channel=${channel.data.id}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('chat-ai-open').first().click({ timeout: 20_000 }).catch(() => {})
  const chatGen = page.getByTestId('chat-ai-image')
  await chatGen.getByTestId('image-generator-prompt').fill(`a red kite ${TAG}`, { timeout: 8000 }).catch(() => {})
  await chatGen.getByTestId('image-generator-run').click({ timeout: 5000 }).catch(() => {})
  const one = await waitUntil(async () => (await drawnImages(chatGen)).filter((d) => d.loaded).length === 1, { timeoutMs: 20_000 })
  const kite = (await drawnImages(chatGen))[0]?.src ?? ''
  await chatGen.getByTestId('image-generator-add').click({ timeout: 5000 }).catch(() => {})
  const attached = await waitUntil(async () => (await page.getByText(/a-red-kite-.*-1\.png/).count()) > 0, { timeoutMs: 15_000 })
  await page.getByPlaceholder(/^Message /).first().fill(`Kite ${TAG}`, { timeout: 5000 }).catch(() => {})
  await page.getByPlaceholder(/^Message /).first().press('Enter', { timeout: 5000 }).catch(() => {})
  let sent = []
  await waitUntil(async () => {
    sent = await sql`
      select a.file_name, a.content_type, a.size_bytes from chat_message_attachments a
      join chat_messages m on m.id = a.message_id
      where a.channel_id = ${channel.data.id} and m.body like ${`%${TAG}%`}`.catch(() => [])
    return sent.length > 0
  }, { timeoutMs: 15_000 })
  chk(
    one && attached && sent.length === 1 && sent[0].content_type === 'image/png' && /^a-red-kite-[a-z0-9-]*-1\.png$/.test(sent[0].file_name) && kite && Number(sent[0].size_bytes) === bytesOf(kite),
    'the chat composer’s AI makes a picture too: added, it is attached to the message, and sent with it',
    `drawn ${one}; attached ${attached}; the message holds ${JSON.stringify(sent)}${kite ? `; the picture is ${bytesOf(kite)} bytes` : ''}`,
  )

  // ══ 4. WRITTEN DOWN ════════════════════════════════════════════════════════
  console.log('\n▶ the runs, where the AI value page counts them')
  const runs = await imageRuns()
  const value = await A(`/ai/value?workspaceId=${WS}`)
  const imagesTile = (value.data?.byCategory ?? []).find((c) => c.category === 'images')
  chk(
    runs.length === 2 && runs.every((r) => r.status === 'succeeded' && r.model === 'gpt-image-1') && imagesTile?.supported === true && imagesTile?.runs >= 2,
    'each ask is one run of `image.generate`, and the AI value report counts it under Images generated, a tile it now fills',
    `runs ${JSON.stringify(runs)}; the Images tile ${JSON.stringify(imagesTile ?? null)}`,
  )

  // ══ 5. REFUSED ═════════════════════════════════════════════════════════════
  console.log('\n▶ what is refused, and what the service refusing is said as')
  const asGuest = await G('/ai/images', { method: 'POST', body: { workspaceId: WS, prompt: 'a cat' } })
  const tooMany = await A('/ai/images', { method: 'POST', body: { workspaceId: WS, prompt: 'a cat', count: 5 } })
  const blank = await A('/ai/images', { method: 'POST', body: { workspaceId: WS, prompt: '   ' } })
  const oddSize = await A('/ai/images', { method: 'POST', body: { workspaceId: WS, prompt: 'a cat', size: '64x64' } })
  chk(
    asGuest.status === 403 && tooMany.status === 400 && blank.status === 400 && oddSize.status === 400,
    'a guest is refused as on every AI route, and five pictures, a blank description and a size the service does not draw are refused 400',
    `guest ${said(asGuest)}; five ${said(tooMany)}; blank ${said(blank)}; 64x64 ${said(oddSize)}`,
  )
  await control('/__control/images/fail', { status: 429, count: 1 })
  const limited = await A('/ai/images', { method: 'POST', body: { workspaceId: WS, prompt: 'a cat' } })
  await control('/__control/images/fail', { status: 500, count: 1 })
  const broke = await A('/ai/images', { method: 'POST', body: { workspaceId: WS, prompt: 'a cat' } })
  const failedRuns = (await imageRuns()).filter((r) => r.status === 'failed').length
  chk(
    limited.status === 429 && /too many requests/i.test(limited.error?.message ?? '') && broke.status === 502 && /did not answer/i.test(broke.error?.message ?? '') && failedRuns === 2,
    'the service’s rate limit is said as too many requests (429), its failure as a service that did not answer (502), and each is written down as a failed run',
    `limited ${said(limited)}; failed ${said(broke)}; failed runs ${failedRuns}`,
  )

  // ══ 6. SAID ON THE PAGE ════════════════════════════════════════════════════
  console.log('\n▶ the composer, when the service fails')
  await control('/__control/images/fail', { status: 500, count: 1 })
  await openCommentImages()
  await page.getByTestId('comment-ai-panel').getByTestId('image-generator-prompt').fill('a storm', { timeout: 5000 }).catch(() => {})
  await page.getByTestId('comment-ai-panel').getByTestId('image-generator-run').click({ timeout: 5000 }).catch(() => {})
  const errorLine = page.getByTestId('image-generator-error').filter({ visible: true })
  const errorShown = await waitUntil(async () => (await errorLine.count()) === 1, { timeoutMs: 15_000 })
  const errorText = errorShown ? await errorLine.innerText().catch(() => '') : ''
  chk(
    errorShown && /did not answer/i.test(errorText) && (await page.locator('[data-testid="image-generator-image"]').count()) === 0,
    'and the composer says the service did not answer, in its words, and draws no picture',
    `said ${JSON.stringify(errorText)}`,
  )

  // ══ 7. FROM THE ASK AI DOCK, ON A TASK ═══════════════════════════════════
  // ClickUp's Ask button makes images too, through Brain's Generate image.
  console.log('\n▶ Brain² on the task: the dock’s Generate image, and Add to the task')
  await page.goto(`${B}/app/${WS}/${space.id}/${project.id}/${list.id}?task=${task.id}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('task-header-brain').click({ timeout: 20_000 }).catch(() => {})
  const dock = page.getByTestId('ai-dock')
  await waitUntil(() => dock.isVisible().catch(() => false), { timeoutMs: 15_000 })
  await dock.getByTestId('ai-image-toggle').click({ timeout: 8000 }).catch(() => {})
  const dockGen = dock.getByTestId('ai-image-panel')
  await dockGen.getByTestId('image-generator-prompt').fill(`a blue whale ${TAG}`, { timeout: 8000 }).catch(() => {})
  await dockGen.getByTestId('image-generator-run').click({ timeout: 5000 }).catch(() => {})
  const whaleDrawn = await waitUntil(async () => (await drawnImages(dockGen)).filter((d) => d.loaded).length === 1, { timeoutMs: 20_000 })
  const whale = (await drawnImages(dockGen))[0]?.src ?? ''
  const panelOn = await dockGen.getAttribute('data-scope-id', { timeout: 3000 }).catch(() => null)
  await dockGen.getByTestId('image-generator-add').click({ timeout: 5000 }).catch(() => {})
  let taskFiles = []
  await waitUntil(async () => {
    taskFiles = await sql`
      select file_name, content_type, size_bytes, comment_id from task_attachments
      where task_id = ${task.id} and file_name like ${'a-blue-whale-%'}`.catch(() => [])
    return taskFiles.length > 0
  }, { timeoutMs: 20_000 })
  chk(
    whaleDrawn && panelOn === task.id && taskFiles.length === 1 && taskFiles[0].comment_id === null && taskFiles[0].content_type === 'image/png' && !!whale && Number(taskFiles[0].size_bytes) === bytesOf(whale),
    'the Ask AI dock makes pictures too: opened by Brain² on a task, the one made is added to the task’s files, its very bytes',
    `drawn ${whaleDrawn}; the panel is on ${JSON.stringify(panelOn)}; the task holds ${JSON.stringify(taskFiles)}`,
  )

  // ══ 8. FROM THE DOCK, ON NO TASK ═════════════════════════════════════════
  console.log('\n▶ the dock from the top bar, on no task: Download')
  await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('ai-dock-toggle').click({ timeout: 20_000 }).catch(() => {})
  const freeDock = page.getByTestId('ai-dock')
  await waitUntil(() => freeDock.isVisible().catch(() => false), { timeoutMs: 15_000 })
  await freeDock.getByTestId('ai-image-toggle').click({ timeout: 8000 }).catch(() => {})
  const freeGen = freeDock.getByTestId('ai-image-panel')
  await freeGen.getByTestId('image-generator-prompt').fill(`a green kite ${TAG}`, { timeout: 8000 }).catch(() => {})
  await freeGen.getByTestId('image-generator-run').click({ timeout: 5000 }).catch(() => {})
  const kiteDrawn = await waitUntil(async () => (await drawnImages(freeGen)).filter((d) => d.loaded).length === 1, { timeoutMs: 20_000 })
  const kite2 = (await drawnImages(freeGen))[0]?.src ?? ''
  const saving = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null)
  await freeGen.getByTestId('image-generator-add').click({ timeout: 5000 }).catch(() => {})
  const saved = await saving
  const savedName = saved ? saved.suggestedFilename() : null
  const savedPath = saved ? await saved.path().catch(() => null) : null
  const savedBytes = savedPath ? (await stat(savedPath).catch(() => null))?.size ?? -1 : -1
  const [onTasks] = await sql`select count(*)::int as n from task_attachments where file_name like ${'a-green-kite-%'}`
  chk(
    kiteDrawn && /^a-green-kite-[a-z0-9-]*-1\.png$/.test(savedName ?? '') && !!kite2 && savedBytes === bytesOf(kite2) && onTasks.n === 0,
    'and opened on no task, its Download saves the picture made — a PNG named after its description, its very bytes — and puts it on no task',
    `drawn ${kiteDrawn}; saved ${JSON.stringify(savedName)} of ${savedBytes} bytes; on tasks ${onTasks.n}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  // The stub is the lane's, shared by every later run: a reset that did not answer is said, not swallowed.
  await control('/__control/images/reset', {}).then(
    () => {},
    (e) => console.log(`  cleanup: the media stub did not reset — ${e.message}`),
  )
  const leftBehind = []
  for (const { id, as } of workspacesMade) {
    const gone = await as(`/workspaces/${id}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) leftBehind.push(`DELETE workspace ${id} answered ${gone.status}`)
  }
  if (leftBehind.length) console.log(`  cleanup left behind: ${leftBehind.join('; ')}`)
  // Only now: the calls above go through this proxy, and a closed one refuses them.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
