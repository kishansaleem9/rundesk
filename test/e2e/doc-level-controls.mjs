/**
 * THE DOC PAGE OFFERS WHAT THE READER'S LEVEL ALLOWS: A READ-ONLY EDITOR BELOW
 * EDIT, ARCHIVE AND DELETE AT EDIT, AND A REFUSED SAVE SAID.
 *
 * NOT FRAME ROWS: `found-28-sep/doc-editor-open-to-readers` and
 * `found-28-sep/docs-offer-no-archive-or-delete`, found closing
 * `doc-archive-and-delete-at-two-levels`. The docs panel knew nothing of the
 * caller's level: the editor took typing from a View or Comment share, and the
 * save's refusal (403) was dropped, so the words looked saved until a reload.
 * And the panel listed Archived docs with nothing anywhere that archived or
 * deleted one, though both routes answer at Edit.
 *
 * ClickUp (help centre, from search snippets): with View or Comment access a
 * Doc is read, not changed; "Anyone, including guests, with Edit permissions
 * can archive and unarchive Docs", from the Doc's own menu among other places;
 * and Edit deletes a Doc. The page reads the doc's capabilities — the checks
 * its routes ask — and offers accordingly.
 *
 *   node test/e2e/doc-level-controls.mjs --api 3027 --dist /tmp/claude-0/dist-7
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 7

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' } }
  const text = await res.text().catch(() => '')
  let json = null
  try { json = JSON.parse(text) } catch { /* no body */ }
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `dlc${stamp}`
const PASSWORD = 'DocLevels@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — docs and shares are planted and read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const person = async (who) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, {
      fullName: `Doc ${who}`, email, password: PASSWORD,
      organizationName: `Doc ${who} ${stamp}`, organizationSlug: `doc-${who}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
    if (added.status >= 300) throw new Error(`could not add the ${who}: ${said(added)}`)
    return { id: signed.user?.id, email }
  }
  const viewer = await person('viewer')
  const commenter = await person('commenter')
  const editor = await person('editor')
  if (!viewer.id || !commenter.id || !editor.id || !adminId) throw new Error('a sign-up answered with no user id')

  // A private space, so each member reaches the docs by their share alone.
  const PRIVATE = (await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} private`, visibility: 'private' } })).data?.id
  if (!PRIVATE) throw new Error('could not make the private space')
  const BODY = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `${TAG} the words as written` }] }] }
  const doc = async (title) =>
    (await sql`insert into docs (workspace_id, space_id, title, content, created_by_id) values (${WS}, ${PRIVATE}, ${title}, ${sql.json(BODY)}, ${adminId}) returning id`)[0].id
  const share = (docId, userId, level) =>
    sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values (${WS}, 'doc', ${docId}, ${userId}, ${level})`
  const SHARED = await doc(`${TAG} shared three ways`)
  await share(SHARED, viewer.id, 'view')
  await share(SHARED, commenter.id, 'comment')
  await share(SHARED, editor.id, 'edit')
  const DOOMED = await doc(`${TAG} to be deleted`)
  await share(DOOMED, editor.id, 'edit')
  const LOWERED = await doc(`${TAG} lowered while open`)
  await share(LOWERED, editor.id, 'edit')
  const row = async (id) => (await sql`select is_archived, archived_by_id, content::text as content from docs where id = ${id}`)[0]

  browser = await (await resolveChromium()).launch(launchOptions())
  const openDoc = async (who, docId) => {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', PASSWORD)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    await page.goto(`${B}/app/${WS}/docs?doc=${docId}`, { waitUntil: 'domcontentloaded' })
    // The doc is open once its words are drawn in the editor.
    await waitUntil(() => page.locator('.ProseMirror').getByText(`${TAG} the words as written`).first().isVisible().catch(() => false), { timeoutMs: 20_000 })
    return page
  }
  /**
   * What the page offers this reader, read once the doc's capabilities have
   * answered (the page asks for them the moment the doc opens).
   */
  const offers = async (page, docId) => {
    await waitUntil(async () => page.url().includes(docId), { timeoutMs: 5000 })
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    const editable = await page.locator('.ProseMirror').first().getAttribute('contenteditable').catch(() => null)
    return {
      editable,
      readOnly: await page.getByTestId('doc-read-only').count(),
      save: await page.getByRole('button', { name: /^Save$/ }).count(),
      bold: await page.getByRole('button', { name: /^B$/ }).count(),
      menu: await page.getByTestId('doc-more-menu').count(),
    }
  }
  /** Type at the end of the doc's words, and read back what the editor then holds. */
  const typeInto = async (page, words) => {
    await page.locator('.ProseMirror').first().click({ timeout: 5000 }).catch(() => {})
    await page.keyboard.press('End').catch(() => {})
    await page.keyboard.type(words, { delay: 5 }).catch(() => {})
    return (await page.locator('.ProseMirror').first().innerText().catch(() => '')).includes(words)
  }
  const menuItems = async (page) => {
    await page.getByTestId('doc-more-menu').click({ timeout: 5000 }).catch(() => {})
    await waitUntil(async () => (await page.getByRole('menu').count()) > 0, { timeoutMs: 5000 })
    const items = (await page.getByRole('menuitem').allInnerTexts().catch(() => [])).map((s) => s.trim())
    await page.keyboard.press('Escape').catch(() => {})
    await waitUntil(async () => (await page.getByRole('menu').count()) === 0, { timeoutMs: 5000 })
    return items
  }

  // ══ 1–2. VIEW AND COMMENT READ; THEY DO NOT TYPE ═════════════════════════
  for (const [who, label] of [[viewer, 'View'], [commenter, 'Comment']]) {
    console.log(`\n▶ a member with a ${label} share opens the doc and types`)
    const page = await openDoc(who, SHARED)
    const seen = await offers(page, SHARED)
    const took = await typeInto(page, ' typed by a reader')
    chk(
      seen.editable === 'false' && seen.readOnly === 1 && seen.save === 0 && seen.bold === 0 && seen.menu === 0 && !took,
      `a member with a ${label} share is shown the doc read only — the editor takes no typing, and no Save, formatting, Archive or Delete is offered`,
      `offered ${JSON.stringify(seen)}; the typing ${took ? 'went into the editor' : 'went nowhere'}`,
    )
    await page.context().close().catch(() => {})
  }

  // ══ 3. EDIT TYPES, AND IS OFFERED ARCHIVE AND DELETE ═════════════════════
  console.log('\n▶ a member with an Edit share opens the doc')
  const ep = await openDoc(editor, SHARED)
  const editorSees = await offers(ep, SHARED)
  const editorTyped = await typeInto(ep, ' typed by the editor')
  const editorMenu = await menuItems(ep)
  chk(
    editorSees.editable === 'true' && editorSees.readOnly === 0 && editorSees.save === 1 && editorTyped
      && editorMenu.includes('Archive') && editorMenu.includes('Delete') && !editorMenu.includes('Unarchive'),
    'a member with an Edit share types into the doc with Save offered, and its menu offers Archive and Delete',
    `offered ${JSON.stringify(editorSees)}; typing took ${editorTyped}; the menu ${JSON.stringify(editorMenu)}`,
  )

  // ══ 4. ARCHIVE, THEN UNARCHIVE, FROM THE MENU ════════════════════════════
  console.log('\n▶ the editor archives the doc from its menu, and unarchives it')
  await ep.getByTestId('doc-more-menu').click({ timeout: 5000 }).catch(() => {})
  await ep.getByRole('menuitem', { name: /^Archive$/ }).click({ timeout: 5000 }).catch(() => {})
  const archived = await waitUntil(async () => (await row(SHARED))?.is_archived === true, { timeoutMs: 10_000 })
  const archivedRow = await row(SHARED)
  const afterArchive = await waitUntil(async () => (await menuItems(ep)).includes('Unarchive'), { timeoutMs: 10_000 })
  await ep.getByTestId('doc-more-menu').click({ timeout: 5000 }).catch(() => {})
  await ep.getByRole('menuitem', { name: /^Unarchive$/ }).click({ timeout: 5000 }).catch(() => {})
  const unarchived = await waitUntil(async () => (await row(SHARED))?.is_archived === false, { timeoutMs: 10_000 })
  chk(
    archived && archivedRow?.archived_by_id === editor.id && afterArchive && unarchived,
    'Archive from the doc’s menu archives it as the editor’s doing, the menu then offers Unarchive, and Unarchive brings it back',
    `archived ${archived} (by ${archivedRow?.archived_by_id === editor.id ? 'the editor' : JSON.stringify(archivedRow?.archived_by_id)}); Unarchive offered ${afterArchive}; unarchived ${unarchived}`,
  )
  await ep.context().close().catch(() => {})

  // ══ 5. DELETE FROM THE MENU ══════════════════════════════════════════════
  console.log('\n▶ the editor deletes a doc from its menu')
  const dp = await openDoc(editor, DOOMED)
  await offers(dp, DOOMED)
  await dp.getByTestId('doc-more-menu').click({ timeout: 5000 }).catch(() => {})
  await dp.getByRole('menuitem', { name: /^Delete$/ }).click({ timeout: 5000 }).catch(() => {})
  // A delete is asked to be confirmed where the page asks; the confirmation, when there is one, is accepted.
  await dp.getByRole('button', { name: /^(Delete|Move to Trash)$/ }).last().click({ timeout: 3000 }).catch(() => {})
  const gone = await waitUntil(async () => (await row(DOOMED))?.is_archived === true, { timeoutMs: 10_000 })
  const trash = await apiAs((await signInApi(API, editor.email, PASSWORD)).accessToken)(`/workspaces/${WS}/trash?types=doc`)
  const inTrash = (trash.data?.items ?? []).some((i) => i.id === DOOMED && i.deletedBy?.id === editor.id)
  chk(
    gone && inTrash,
    'Delete from the doc’s menu sends it to the Trash, the editor’s own, as deleted by them',
    `deleted ${gone}; in their Trash ${inTrash} (${said(trash)})`,
  )
  await dp.context().close().catch(() => {})

  // ══ 6. A SAVE REFUSED IS SAID ════════════════════════════════════════════
  console.log('\n▶ the editor’s share is lowered to View while the doc is open, and they save')
  const lp = await openDoc(editor, LOWERED)
  await offers(lp, LOWERED)
  const lowerTyped = await typeInto(lp, ' written after the share was lowered')
  await sql`update object_shares set level = 'view' where object_type = 'doc' and object_id = ${LOWERED} and user_id = ${editor.id}`
  const answers = []
  lp.on('response', (r) => { if (r.request().method() === 'PATCH' && r.url().includes(`/docs/${LOWERED}`)) answers.push(r.status()) })
  await lp.getByRole('button', { name: /^Save$/ }).click({ timeout: 5000 }).catch(() => {})
  await waitUntil(async () => answers.length > 0, { timeoutMs: 10_000 })
  const told = await waitUntil(() => lp.getByText(/does not allow changing it/).first().isVisible().catch(() => false), { timeoutMs: 8000 })
  const kept = (await row(LOWERED))?.content ?? ''
  chk(
    lowerTyped && answers.includes(403) && told && !kept.includes('written after the share was lowered'),
    'a save refused (403) says so — “Your access to this doc does not allow changing it” — rather than leaving the words looking saved',
    `typed ${lowerTyped}; the save answered ${JSON.stringify(answers)}; the refusal shown ${told}; saved anyway ${kept.includes('written after the share was lowered')}`,
  )
  await lp.context().close().catch(() => {})

  // ══ 7. THE API AGREES WITH THE PAGE ══════════════════════════════════════
  console.log('\n▶ what each share may do, asked of the API')
  const caps = {}
  for (const [who, key] of [[viewer, 'view'], [commenter, 'comment'], [editor, 'edit']]) {
    const token = (await signInApi(API, who.email, PASSWORD)).accessToken
    caps[key] = (await apiAs(token)(`/docs/${SHARED}/capabilities`)).data ?? null
  }
  chk(
    caps.view?.edit === false && caps.view?.delete === false && caps.comment?.edit === false && caps.comment?.delete === false
      && caps.edit?.edit === true && caps.edit?.delete === true,
    'the doc’s capabilities, which the page reads, give View and Comment neither editing nor deleting, and Edit both',
    `capabilities ${JSON.stringify(caps)}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  stack.close()
  if (WS && A) await A(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
