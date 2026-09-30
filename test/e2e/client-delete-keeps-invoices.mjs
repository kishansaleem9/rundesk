/**
 * A CLIENT WITH INVOICES IS NOT DELETED, AND ONE THAT IS NOT THERE IS NOT FOUND.
 *
 * NOT A FRAME ROW: `found-28-sep/client-delete-cascades-invoices`, found
 * implementing `client.manage`. `client_invoices.client_id` is ON DELETE
 * CASCADE, and so are the invoices' lines: deleting a client deleted its
 * billing records and returned their time to unbilled, for every manager (who
 * holds `client.manage` by default) with or without `workspace.billing`. And
 * `DELETE /clients/:id` answered `{ ok: true }` for an id that matched nothing.
 *
 *   node test/e2e/client-delete-keeps-invoices.mjs --api 3027 --dist /tmp/claude-0/dist-7
 */
import path from 'node:path'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 3

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

const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `cdk${stamp}`
const PASSWORD = 'ClientKeep@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const API = `${stack.base}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the invoice is made and read back by SQL')
  A = apiAs((await signInApi(API, ADMIN.email, ADMIN.password)).accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const email = `${TAG}-manager@rundesk.invalid`
  const signed = await signUpApi(API, { fullName: 'Client manager', email, password: PASSWORD, organizationName: `Client ${stamp}`, organizationSlug: `client-${stamp}` })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'manager' } })
  if (!added.ok) throw new Error(`could not add the manager: ${said(added)}`)
  const G = apiAs(signed.accessToken)
  const client = async (name) => {
    const r = await G(`/workspaces/${WS}/clients`, { method: 'POST', body: { name: `${TAG} ${name}` } })
    if (!r.ok || !r.data?.id) throw new Error(`could not make the client ${name}: ${said(r)}`)
    return r.data.id
  }
  const BILLED = await client('billed')
  const PLAIN = await client('plain')
  const [inv] = await sql`insert into client_invoices (workspace_id, client_id, number, total_cents) values (${WS}, ${BILLED}, ${`${TAG}-1`}, 12500) returning id`
  const clientThere = async (id) => (await sql`select 1 from clients where id = ${id}`).length === 1
  const invoiceThere = async () => (await sql`select 1 from client_invoices where id = ${inv.id}`).length === 1

  console.log('\n▶ a client with an invoice, deleted by a manager')
  const d = await G(`/workspaces/${WS}/clients/${BILLED}`, { method: 'DELETE' })
  chk(
    d.status === 409 && (await clientThere(BILLED)) && (await invoiceThere()),
    'a client with an invoice is not deleted (409), and neither is the invoice',
    `${said(d)}; the client ${(await clientThere(BILLED)) ? 'stays' : 'is gone'}, the invoice ${(await invoiceThere()) ? 'stays' : 'is gone'}`,
  )

  console.log('\n▶ a client with none, and one that is not there')
  const p = await G(`/workspaces/${WS}/clients/${PLAIN}`, { method: 'DELETE' })
  chk(
    p.ok && !(await clientThere(PLAIN)),
    'a client with no invoice is deleted as before',
    `${said(p)}; the client ${(await clientThere(PLAIN)) ? 'stays' : 'is gone'}`,
  )
  const missing = await G(`/workspaces/${WS}/clients/00000000-0000-4000-8000-000000000000`, { method: 'DELETE' })
  chk(
    missing.status === 404,
    'deleting a client that is not there says so (404), not ok',
    said(missing),
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  // Only now: the DELETE above goes through this proxy, and a closed one refuses it.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
