/**
 * 0146 — THREE OF THE THIRTEEN FIELD TYPES FRAME `00:20`–`00:42` LISTS.
 *
 * The picker in the create modal is opened at `[00:18]` and scrolled twice. Its
 * `All` section holds THIRTY-TWO types, in this order: Dropdown, Text, Date,
 * Text area (Long Text), Number, Labels, Checkbox, Money, Website, Formula,
 * Custom Text, Summary, Progress Updates, Files, Relationship, People,
 * Progress (Auto), Email, Phone, Categorize, Custom Dropdown, Translation,
 * Sentiment, Tasks, Location, Progress (Manual), Rating, Voting, Signature,
 * Button, Action Items, T-shirt Size. Above it sits an **AI Fields** group of
 * three — Summary, Custom Text, Custom Dropdown — which is the picker's own
 * label for which types need a model.
 *
 * `[00:20]` "yahan pe option khud deta hai, main kuch bhi chahoon main create
 * kar sakti hoon" — she opens the list and says you can make any of these,
 * which under `[21:43]` is enlisting them.
 *
 * Rundesk held nineteen. This closes three, chosen because each one can be
 * REAL here:
 *
 *   · `formula` — arithmetic over the task's other numeric fields. Derived on
 *     read like `progress_auto`, never stored, and the write is refused. The
 *     compute needs no provider key, so it is built rather than shelled.
 *   · `tasks`   — a named reference to other tasks, validated against the
 *     workspace, rendered as titles.
 *   · `signature` — the drawn strokes, stored and drawn back.
 *
 * WHAT THIS SUITE IS REALLY FOR. A field type is four things that have to
 * agree: a stored value, a validation that refuses what the readers cannot
 * draw, an editor, and a reader. A type with three of the four is the mirror
 * defect — the database ends up standing as evidence for a feature that is not
 * there. So every check that says a value round-trips asks the SERVER what it
 * holds, and every refusal is matched against the endpoint's own message
 * rather than against a status alone.
 *
 *   node test/e2e/custom-field-types.mjs --api 3029 --dist /tmp/claude-0/dist-9
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
/* Teardown only — see the `finally` block. No check reads the database. */
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** Exact, never `<`: a branch that silently skipped is a shorter run. */
const EXPECTED_CHECKS = 32

const REPO = path.resolve(import.meta.dirname, '../..')
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3029))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`) }
}

/* This client NEVER THROWS — it resolves `{status, data, error}`. A `.catch()`
 * on it is inert and a failed call would read as a success, so every call below
 * is judged on `status` and, where the refusal is the point, on the message. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}
/** The envelope carries `{message}` on a refusal; this is the text of it. */
const said = (r) => String(r?.error?.message ?? r?.error ?? '')

/**
 * Every type the column holds, written out here rather than imported.
 *
 * An independent statement of the spec: importing the enum would make the
 * picker check compare the picker against itself.
 */
const ALL_TYPES = [
  'text', 'number', 'dropdown', 'date', 'checkbox', 'url', 'email', 'phone',
  'money', 'rating', 'progress_auto', 'long_text', 'labels', 'people',
  'location', 'tshirt_size', 'progress_manual', 'files', 'voting',
  'formula', 'tasks', 'signature',
]

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())

const TAG = `e2e-cft-${Date.now()}`
/** Set once the workspace exists, so `finally` only deletes what this run made. */
let ownWorkspaceId = null
let A = null

try {
  const auth = await signInApi(API, ME.email, ME.password)
  A = apiAs(auth.accessToken)

  // ── Its own workspace, deleted in `finally` ───────────────────────────────
  const ws = await A('/workspaces', { method: 'POST', body: { name: `Field types ${TAG}` } })
  if (ws.status >= 400 || !ws.data?.id) throw new Error(`could not make a workspace: ${ws.status} ${said(ws)}`)
  ownWorkspaceId = ws.data.id
  const W = ownWorkspaceId

  const space = (await A('/spaces', { method: 'POST', body: { workspaceId: W, name: `Space ${TAG}` } })).data
  const project = (await A('/projects', { method: 'POST', body: { spaceId: space?.id, name: `Project ${TAG}` } })).data
  const list = (await A('/lists', { method: 'POST', body: { projectId: project?.id, name: `List ${TAG}` } })).data
  if (!list?.id) throw new Error('could not build the fixture list')
  const subject = (await A('/tasks', { method: 'POST', body: { listId: list.id, title: `Subject ${TAG}` } })).data
  const other = (await A('/tasks', { method: 'POST', body: { listId: list.id, title: `Other ${TAG}` } })).data
  if (!subject?.id || !other?.id) throw new Error('could not build the fixture tasks')

  const define = (body) =>
    A(`/workspaces/${W}/projects/${project.id}/custom-fields`, { method: 'POST', body })
  const setOn = (taskId, fieldId, value) =>
    A(`/workspaces/${W}/tasks/${taskId}/custom-fields/${fieldId}`, { method: 'PUT', body: { value } })
  /** What the SERVER says this task's fields are worth, by field name. */
  const serverValues = async (taskId) => {
    const r = await A(`/workspaces/${W}/tasks/${taskId}/custom-fields`)
    if (r.status !== 200) throw new Error(`reading the task's fields answered ${r.status}`)
    return Object.fromEntries((r.data ?? []).map((row) => [row.definition.name, row.value]))
  }

  const budget = await define({ name: 'Budget', type: 'money' })
  const spent = await define({ name: 'Spent', type: 'number' })
  const note = await define({ name: 'Note', type: 'text' })
  if (budget.status >= 400 || spent.status >= 400 || note.status >= 400) {
    throw new Error('could not define the numeric fields a formula reads')
  }

  // =========================================================================
  console.log('\n▶ FORMULA — refused before it is stored, because a bad one draws blank forever')

  const noExpression = await define({ name: `F none ${TAG}`, type: 'formula' })
  chk(
    noExpression.status === 400 && /needs an expression/i.test(said(noExpression)),
    'a formula with no expression is refused, and says so',
    `it answered ${noExpression.status} "${said(noExpression)}" — a formula with nothing to ` +
      'evaluate is a field that renders a dash on every task and never says why',
  )

  const unknownRef = await define({
    name: `F typo ${TAG}`, type: 'formula', config: { expression: '{Budgte} - {Spent}' },
  })
  chk(
    unknownRef.status === 400 && said(unknownRef).includes('Budgte'),
    'a reference to a field that does not exist is refused, naming the one it could not find',
    `it answered ${unknownRef.status} "${said(unknownRef)}"; a typo that saves is indistinguishable ` +
      'from an empty field afterwards',
  )

  const notNumeric = await define({
    name: `F text ${TAG}`, type: 'formula', config: { expression: '{Note} + 1' },
  })
  chk(
    notNumeric.status === 400 && said(notNumeric).includes('Note') && said(notNumeric).includes('text'),
    'and a reference to a text field is refused, naming the field AND its type',
    `it answered ${notNumeric.status} "${said(notNumeric)}"`,
  )

  const badSyntax = await define({
    name: `F syntax ${TAG}`, type: 'formula', config: { expression: '{Budget} +' },
  })
  chk(
    badSyntax.status === 400,
    'an expression that does not parse is refused at create time, not at read time',
    `it answered ${badSyntax.status} "${said(badSyntax)}"`,
  )

  console.log('\n▶ FORMULA — and the one that is well formed is really computed')

  const remaining = await define({
    name: 'Remaining', type: 'formula', config: { expression: '({Budget} - {Spent}) * 2' },
  })
  chk(
    remaining.status === 201 && remaining.data?.config?.expression === '({Budget} - {Spent}) * 2',
    'a well-formed formula is created and the expression is stored verbatim',
    `it answered ${remaining.status} and stored ${JSON.stringify(remaining.data?.config)}`,
  )
  const remainingId = remaining.data?.id

  const setBudget = await setOn(subject.id, budget.data.id, 500)
  const setSpent = await setOn(subject.id, spent.data.id, 125)
  chk(
    setBudget.status === 200 && setSpent.status === 200,
    'its two inputs take values',
    `budget answered ${setBudget.status} and spent answered ${setSpent.status}`,
  )

  const computed = await serverValues(subject.id)
  chk(
    computed.Remaining === 750,
    'the server computes it from the other fields — (500 - 125) * 2 is 750, with precedence honoured',
    `the server says Remaining is ${JSON.stringify(computed.Remaining)}; ` +
      '625 would mean the parentheses were ignored, null would mean nothing was evaluated',
  )

  /* The whole point of deriving: nothing wrote the formula, and it moved. */
  const moved = await setOn(subject.id, spent.data.id, 300)
  const after = await serverValues(subject.id)
  chk(
    moved.status === 200 && after.Remaining === 400,
    'changing an input moves it with no write to the formula at all',
    `after setting Spent to 300 the server says Remaining is ${JSON.stringify(after.Remaining)} — ` +
      'a number that does not follow its inputs is a stored value pretending to be derived',
  )

  /* `other` has no values at all, so the same definition must say nothing. */
  const onEmpty = await serverValues(other.id)
  chk(
    onEmpty.Remaining === null,
    'on a task whose inputs are unfilled it is null, never 0',
    `the server says ${JSON.stringify(onEmpty.Remaining)} for a task with no Budget and no Spent — ` +
      '0 there is the confident zero, in a box with a number in it',
  )

  const writeFormula = await setOn(subject.id, remainingId, 42)
  chk(
    writeFormula.status === 400 && /cannot be set directly/i.test(said(writeFormula)),
    'writing to it is refused, so no row can ever contradict the computation',
    `it answered ${writeFormula.status} "${said(writeFormula)}"; accepting and ignoring the write ` +
      'would be worse than accepting it, because the caller would believe it',
  )

  const rename = await A(`/workspaces/${W}/custom-fields/${budget.data.id}`, {
    method: 'PATCH', body: { name: `Budget USD ${TAG}` },
  })
  chk(
    rename.status === 400 && said(rename).includes('Remaining'),
    'renaming a field a formula reads is refused, naming the formula that reads it',
    `it answered ${rename.status} "${said(rename)}" — a rename that goes through leaves the ` +
      'formula silently drawing a dash where a number was',
  )
  /*
   * Put the fixture back if the refusal did not hold. Without this a patch
   * that removes the guard reddens this check AND every later one that reads
   * `Remaining`, because a rename that goes through is exactly what orphans
   * the formula — and a patch whose damage spreads cannot be attributed.
   */
  if (rename.status !== 400) {
    await A(`/workspaces/${W}/custom-fields/${budget.data.id}`, {
      method: 'PATCH', body: { name: 'Budget' },
    })
  }

  // =========================================================================
  console.log('\n▶ TASKS — a reference that cannot point at something unreachable')

  const blockers = await define({ name: 'Blockers', type: 'tasks' })
  if (blockers.status !== 201) throw new Error(`could not define a tasks field: ${blockers.status}`)

  const foreign = await setOn(subject.id, blockers.data.id, ['00000000-0000-0000-0000-000000000000'])
  chk(
    foreign.status === 400 && /not in this workspace/i.test(said(foreign)),
    'a task id from outside this workspace is refused',
    `it answered ${foreign.status} "${said(foreign)}"; an id the reader cannot open renders as a ` +
      'row that goes nowhere',
  )

  const itself = await setOn(subject.id, blockers.data.id, [subject.id])
  chk(
    itself.status === 400 && /itself/i.test(said(itself)),
    'and so is a task pointing at itself',
    `it answered ${itself.status} "${said(itself)}"`,
  )

  const twice = await setOn(subject.id, blockers.data.id, [other.id, other.id])
  chk(
    twice.status === 400 && /twice/i.test(said(twice)),
    'and the same task given twice, which would draw the same row twice',
    `it answered ${twice.status} "${said(twice)}"`,
  )

  const related = await setOn(subject.id, blockers.data.id, [other.id])
  const heldTasks = (await serverValues(subject.id)).Blockers
  chk(
    related.status === 200 && Array.isArray(heldTasks) && heldTasks.length === 1 && heldTasks[0] === other.id,
    'a real task in this workspace round-trips as exactly that id',
    `the server holds ${JSON.stringify(heldTasks)} after writing [${other.id}]`,
  )

  // =========================================================================
  console.log('\n▶ SIGNATURE — the strokes, and nothing a stroke cannot say')

  const sign = await define({ name: 'Sign here', type: 'signature' })
  if (sign.status !== 201) throw new Error(`could not define a signature field: ${sign.status}`)

  const onePoint = await setOn(subject.id, sign.data.id, '10,10')
  chk(
    onePoint.status === 400 && /two points/i.test(said(onePoint)),
    'a stroke of one point is refused — it would store as valid and draw as nothing',
    `it answered ${onePoint.status} "${said(onePoint)}"`,
  )

  const offGrid = await setOn(subject.id, sign.data.id, '10,10 5000,20')
  chk(
    offGrid.status === 400 && said(offGrid).includes('5000,20'),
    'and a point outside the box it is drawn in is refused, naming the point',
    `it answered ${offGrid.status} "${said(offGrid)}"`,
  )

  const STROKES = '100,100 200,180 300,120;400,150 500,150'
  const signed = await setOn(subject.id, sign.data.id, STROKES)
  const heldSignature = (await serverValues(subject.id))['Sign here']
  chk(
    signed.status === 200 && heldSignature === STROKES,
    'and a real pair of strokes round-trips character for character',
    `the server holds ${JSON.stringify(heldSignature)}`,
  )

  // =========================================================================
  console.log('\n▶ THE PICKER — frame `00:20`, and the duplicated-list defect it invites')

  const ctx = await browser.newContext({
    viewport: { width: 1500, height: 1000 },
    /* `apps/web` is a PWA. Nothing here stubs a GET, but a service worker
     * serving a previous build would measure the wrong bundle. */
    serviceWorkers: 'block',
  })
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  const settleCookies = async () => {
    const accept = page.locator('button:has-text("Accept")').first()
    if (await accept.isVisible().catch(() => false)) await accept.click().catch(() => {})
  }
  await settleCookies()

  await page.goto(`${stack.base}/app/${W}`, { waitUntil: 'domcontentloaded' })
  await settleCookies()
  await page.getByTestId('quick-create-open').click({ timeout: 25_000 })
  await page.getByTestId('create-tab-task').click({ timeout: 20_000 })
  await page.getByTestId('quick-create-space').selectOption({ label: `Space ${TAG}` })
  await page.getByTestId('quick-create-project').selectOption({ label: `Project ${TAG}` })
  if (!(await waitUntil(
    () => page.getByTestId('quick-create-new-field').isVisible().catch(() => false),
    { timeoutMs: 20_000 },
  ))) {
    throw new Error('the create modal never offered to make a field')
  }
  await page.getByTestId('quick-create-new-field').click()

  const offered = await page.getByTestId('quick-create-new-field-type')
    .locator('option').evaluateAll((nodes) => nodes.map((n) => n.value))
  chk(
    offered.length === ALL_TYPES.length && ALL_TYPES.every((type) => offered.includes(type)),
    `the modal's picker offers all ${ALL_TYPES.length} types`,
    `it offers ${offered.length}: [${offered.join(', ')}] — missing ` +
      `[${ALL_TYPES.filter((type) => !offered.includes(type)).join(', ')}]. A picker that ` +
      'lags the column is this audit\'s duplicated list',
  )

  await page.getByTestId('quick-create-new-field-type-search').fill('formula')
  chk(
    (await page.getByTestId('quick-create-new-field-type').inputValue()) === 'formula',
    'and the search box reaches the new types in one gesture',
    `searching "formula" left the picker on ` +
      `"${await page.getByTestId('quick-create-new-field-type').inputValue()}"`,
  )

  /*
   * The type is chosen again explicitly, from the FULL list, so the next two
   * checks stand on their own. Leaning on the search having selected it would
   * make one patch — a search that stops matching — redden three checks, and a
   * patch whose damage spreads cannot be attributed to the check it broke.
   */
  await page.getByTestId('quick-create-new-field-type-search').fill('')
  await page.getByTestId('quick-create-new-field-type').selectOption('formula')

  const expressionBox = page.getByTestId('quick-create-new-field-expression')
  chk(
    await waitUntil(() => expressionBox.isVisible().catch(() => false), { timeoutMs: 10_000 }),
    'choosing Formula asks for the expression, rather than letting the save 400',
    'no expression input appeared — a picker entry whose only answer is a refusal is a dead control',
  )
  await page.getByTestId('quick-create-new-field-type-search').fill('')
  await page.getByTestId('quick-create-new-field-type').selectOption('text')
  chk(
    await waitUntil(
      async () => !(await expressionBox.isVisible().catch(() => false)),
      { timeoutMs: 10_000 },
    ),
    'and it goes away again for a type that has no expression',
    'the expression box stayed up over a text field, where it configures nothing',
  )

  // =========================================================================
  console.log('\n▶ THE TASK SHEET — a reader for each of the three')

  await page.goto(
    `${stack.base}/app/${W}/${space.id}/${project.id}/${list.id}?task=${subject.id}`,
    { waitUntil: 'domcontentloaded' },
  )
  await settleCookies()
  if (!(await waitUntil(
    () => page.getByTestId('task-tab-fields').isVisible().catch(() => false),
    { timeoutMs: 25_000 },
  ))) {
    throw new Error('the task sheet never mounted')
  }
  await page.getByTestId('task-tab-fields').click()
  if (!(await waitUntil(
    async () => (await page.getByTestId('custom-field-row').count()) > 0,
    { timeoutMs: 20_000 },
  ))) {
    throw new Error('the fields panel never listed anything')
  }

  const formulaRow = page.getByTestId('custom-field-row').filter({ hasText: 'Remaining' })
  chk(
    (await formulaRow.getByTestId('custom-field-formula-value').textContent().catch(() => '')) === '400'
      && (await formulaRow.getByTestId('custom-field-formula-expression').textContent().catch(() => ''))
        === '({Budget} - {Spent}) * 2',
    'the formula row draws the number AND the expression it came from',
    'value=' + JSON.stringify(await formulaRow.getByTestId('custom-field-formula-value').textContent().catch(() => null))
      + ' expression=' + JSON.stringify(await formulaRow.getByTestId('custom-field-formula-expression').textContent().catch(() => null))
      + ' — a derived number with no visible derivation is one nobody can check',
  )
  chk(
    (await formulaRow.locator('input, textarea, select').count()) === 0,
    'and offers no editor, because the API refuses the write',
    `it renders ${await formulaRow.locator('input, textarea, select').count()} editable controls ` +
      'over a value the server will not accept',
  )

  const tasksRow = page.getByTestId('custom-field-row').filter({ hasText: 'Blockers' })
  chk(
    (await tasksRow.getByTestId(`cf-task-${other.id}`).textContent().catch(() => '') || '')
      .includes(`Other ${TAG}`),
    'the tasks row draws the related task by TITLE, not by id',
    `it drew ${JSON.stringify(await tasksRow.getByTestId(`cf-task-${other.id}`).textContent().catch(() => null))} ` +
      '— a uuid in a cell is a reference nobody can follow',
  )

  /*
   * THE SIGNATURE BLOCK RUNS BEFORE THE ONE MUTATION ABOVE IT, and the order is
   * load-bearing rather than tidy. Removing the related task empties the row
   * above the pad, the panel refetches, and everything below it moves up by
   * one row — between reading the pad's box and drawing in it, which put the
   * pointer outside the pad and lost the stroke. It showed up under a break
   * patch that added a field, never on the unpatched tree, which is exactly the
   * shape of a check that fails for a reason that is not the code.
   */
  const signatureRow = page.getByTestId('custom-field-row').filter({ hasText: 'Sign here' })
  chk(
    Number(await signatureRow.getByTestId('cf-signature-pad').getAttribute('data-strokes')) === 2,
    'the signature row draws the two strokes the server holds',
    'the pad reports ' +
      `${await signatureRow.getByTestId('cf-signature-pad').getAttribute('data-strokes')} strokes ` +
      'for a value with two in it — a value that stores and does not draw is the mirror defect',
  )

  /* Draw a third stroke with the mouse, and ask the SERVER what it got. */
  await signatureRow.getByTestId('cf-signature-pad').scrollIntoViewIfNeeded()
  const pad = await signatureRow.getByTestId('cf-signature-pad').boundingBox()
  if (!pad) throw new Error('the signature pad has no box to draw in')
  await page.mouse.move(pad.x + 10, pad.y + pad.height - 10)
  await page.mouse.down()
  await page.mouse.move(pad.x + pad.width / 2, pad.y + pad.height - 20, { steps: 6 })
  await page.mouse.move(pad.x + pad.width - 10, pad.y + pad.height - 6, { steps: 6 })
  await page.mouse.up()
  chk(
    await waitUntil(async () => {
      const held = (await serverValues(subject.id))['Sign here']
      return typeof held === 'string' && held.startsWith(`${STROKES};`) && held.split(';').length === 3
    }, { timeoutMs: 20_000 }),
    'and drawing on it appends a stroke the server then holds',
    `after drawing, the server holds ${JSON.stringify((await serverValues(subject.id))['Sign here'])}`,
  )

  await signatureRow.getByTestId('cf-signature-clear').click()
  chk(
    await waitUntil(async () => (await serverValues(subject.id))['Sign here'] === null,
      { timeoutMs: 20_000 }),
    'and Clear really clears it on the server, not only on screen',
    `the server still holds ${JSON.stringify((await serverValues(subject.id))['Sign here'])}`,
  )

  /* Last, because it is the mutation that moves everything below it. */
  await tasksRow.getByTestId(`cf-task-remove-${other.id}`).click()
  chk(
    await waitUntil(async () => {
      const held = (await serverValues(subject.id)).Blockers
      return Array.isArray(held) && held.length === 0
    }, { timeoutMs: 20_000 }),
    'and removing a related task writes through — the server holds no ids afterwards',
    `the server still holds ${JSON.stringify((await serverValues(subject.id)).Blockers)}`,
  )

  // =========================================================================
  console.log('\n▶ THE GRID — the read-only cell, which is where ids used to leak')

  const reRelate = await setOn(subject.id, blockers.data.id, [other.id])
  if (reRelate.status !== 200) throw new Error(`could not re-relate for the grid: ${reRelate.status}`)
  await page.goto(
    `${stack.base}/app/${W}/${space.id}/${project.id}/${list.id}`,
    { waitUntil: 'domcontentloaded' },
  )
  await settleCookies()
  await page.getByTestId('work-view-tab-type-table').click({ timeout: 25_000 })
  /* The subject's own row, by id: `.first()` would be whichever task the grid
   * happened to sort to the top, and the other one has no blockers at all. */
  const blockerCell = page.getByTestId(`custom-cell-readonly-${subject.id}-${blockers.data.id}`)
  const blockerOpener = page.getByTestId(`custom-cell-open-${subject.id}-${blockers.data.id}`)
  chk(
    await waitUntil(
      async () => (await blockerCell.count()) === 1 && (await blockerOpener.count()) === 0,
      { timeoutMs: 20_000 },
    ),
    'a tasks column draws a read-only cell and nothing that opens an editor',
    `read-only cells: ${await blockerCell.count()}, cells that open an editor: ` +
      `${await blockerOpener.count()} — a text box over a list of ids can only ever produce a ` +
      '400, which is the dead control',
  )
  /* `waitUntil` answers whether it converged, not with what it saw, so the
   * text is read again afterwards — reading it only inside the predicate would
   * be asserting on a value this check never holds. */
  await waitUntil(
    async () => {
      const text = (await blockerCell.textContent().catch(() => '')) ?? ''
      return text !== '' && text !== '—'
    },
    { timeoutMs: 20_000 },
  )
  const cellText = (await blockerCell.textContent().catch(() => '')) ?? ''
  chk(
    cellText !== '' && cellText !== '—' && !cellText.includes(other.id) && cellText.includes('1'),
    'and it says how many, never the ids',
    `the cell reads ${JSON.stringify(cellText)}; a column of uuids looks like data and is not`,
  )
  const moneyOpener = page.getByTestId(`custom-cell-open-${subject.id}-${budget.data.id}`)
  chk(
    (await moneyOpener.count()) === 1,
    'while the money column in the same row is still editable in place, so this narrowed the ' +
      'grid rather than disabling it',
    `the money cell offers ${await moneyOpener.count()} editors — 0 would mean every custom ` +
      'column had just been made read-only, which is not the fix',
  )
} catch (err) {
  failed += 1
  const frame = String(err?.stack ?? '').split('\n').find((l) => l.includes('custom-field-types.mjs'))
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err?.message ?? err, frame ? `\n  at ${frame.trim()}` : '')
} finally {
  await browser.close().catch(() => {})
  /*
   * OWN THE FIXTURE ALL THE WAY OUT. The e2e database is shared between lanes
   * and runs, so this workspace — and the space, project, list, tasks and
   * definitions cascading from it — has to go.
   *
   * `DELETE /workspaces/:id` IS AN ARCHIVE, and this block said "nothing this
   * run made outlives it" until a count of `workspaces` said otherwise: seven
   * of them, from seven runs, sitting archived in two lanes. The route's own
   * summary says so — "Archive (soft-delete) a workspace" — and the comment
   * here had been written from what the verb looked like. So both happen: the
   * archive, because that is the path the product offers and it should work,
   * and then a real delete when there is a database handle to do it with.
   *
   * The handle is optional on purpose. Cleanup is not a check, and a suite
   * that refuses to run without `DATABASE_URL` over its teardown would be
   * failing for a reason that is not the code.
   */
  if (ownWorkspaceId && A) {
    const archived = await A(`/workspaces/${ownWorkspaceId}`, { method: 'DELETE' })
    if (archived.status >= 400) {
      console.log(`  (could not archive workspace ${ownWorkspaceId}: ${archived.status})`)
    }
    const sql = await openDb().catch(() => null)
    if (sql) {
      try {
        await sql`delete from workspaces where id = ${ownWorkspaceId}`
      } catch (err) {
        console.log(`  (could not delete workspace ${ownWorkspaceId}: ${err?.message ?? err})`)
      } finally {
        await sql.end({ timeout: 5 }).catch(() => {})
      }
    } else {
      console.log(`  (no DATABASE_URL — workspace ${ownWorkspaceId} is archived, not deleted)`)
    }
  }
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
