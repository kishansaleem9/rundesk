/**
 * A FOLDER IS CHANGED AND DELETED BY WHOEVER THE CONTAINER RULE ALLOWS, NOT BY
 * ANYBODY WHO CAN READ ITS SPACE.
 *
 * NOT A FRAME ROW: `found-28-sep/folders-changed-by-any-reader`, found by the
 * research for `role-editor-offers-unenforced-permissions` and measured on
 * lane 1 before the fix. Renaming, recolouring, making private and deleting a
 * folder asked only that the caller could read its space and held
 * `space.create`, which every member does: a member of a view-only space
 * renamed an admin's folder, made it private and deleted it (200 each), while
 * MOVING the same folder was refused by the container rule.
 *
 * ClickUp (help centre "Permissions FAQ", "Set permissions on individual
 * locations", search snippets): Edit changes a location and Full edit deletes
 * it; View changes nothing. RunDesk's container rule adds that a member changes
 * only what they made, unless they are an admin or manager — as it does for
 * spaces, projects and lists, and as moving a folder already asked.
 *
 *   node test/e2e/folder-change-rule.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 4

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
  try { json = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `fcr${stamp}`
const PASSWORD = 'FolderRule@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const API = `${stack.base}/api/v1`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what a refused change left behind is read back by SQL')
  A = apiAs((await signInApi(API, ADMIN.email, ADMIN.password)).accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const email = `${TAG}-member@rundesk.invalid`
  const signed = await signUpApi(API, { fullName: 'Folder member', email, password: PASSWORD, organizationName: `Folder ${stamp}`, organizationSlug: `folder-${stamp}` })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (added.status >= 300) throw new Error(`could not add the member: ${said(added)}`)
  const M = apiAs(signed.accessToken)

  const space = async (name, extra = {}) => {
    const r = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...extra } })
    if (r.status >= 300 || !r.data?.id) throw new Error(`could not make the ${name} space: ${said(r)}`)
    return r.data.id
  }
  const folderOf = async (who, spaceId, name) => {
    const r = await who(`/spaces/${spaceId}/folders`, { method: 'POST', body: { name: `${TAG} ${name}` } })
    if (r.status >= 300 || !r.data?.id) throw new Error(`could not make the folder ${name}: ${said(r)}`)
    return r.data.id
  }
  const row = async (id) => (await sql`select name, visibility, is_archived from folders where id = ${id}`)[0]
  const VIEW = await space('view-only', { defaultPermission: 'view' })
  const OPEN = await space('open')

  // What a member tries on a folder that is not theirs.
  const attempt = async (spaceId, name) => {
    const renamed = await folderOf(A, spaceId, `${name} renamed`)
    const hidden = await folderOf(A, spaceId, `${name} hidden`)
    const deleted = await folderOf(A, spaceId, `${name} deleted`)
    const r = await M(`/spaces/${spaceId}/folders/${renamed}`, { method: 'PATCH', body: { name: `${TAG} renamed by the member` } })
    const v = await M(`/spaces/${spaceId}/folders/${hidden}`, { method: 'PATCH', body: { visibility: 'private' } })
    const d = await M(`/spaces/${spaceId}/folders/${deleted}`, { method: 'DELETE' })
    const after = { renamed: await row(renamed), hidden: await row(hidden), deleted: await row(deleted) }
    return {
      r, v, d, after,
      untouched:
        after.renamed?.name === `${TAG} ${name} renamed` &&
        after.hidden?.visibility === 'public' &&
        after.deleted?.is_archived === false,
      shape: `rename ${said(r)}, private ${said(v)}, delete ${said(d)}; after: ${JSON.stringify(after)}`,
    }
  }

  console.log('\n▶ a member of a view-only space')
  const view = await attempt(VIEW, 'view')
  chk(
    view.r.status === 403 && view.v.status === 403 && view.d.status === 403 && view.untouched,
    'a member of a view-only space renames no folder, makes none private and deletes none (403 each), and each stays as it was',
    view.shape,
  )

  console.log('\n▶ a member of a space at Full edit, on the admin’s folders')
  const open = await attempt(OPEN, 'open')
  chk(
    open.r.status === 403 && open.v.status === 403 && open.d.status === 403 && open.untouched,
    'at Full edit a member still changes no folder an admin made — renaming, making private and deleting are refused, as moving it already was',
    open.shape,
  )

  console.log('\n▶ the member’s own folder, and the admin')
  const mine = await folderOf(M, OPEN, 'mine')
  const mr = await M(`/spaces/${OPEN}/folders/${mine}`, { method: 'PATCH', body: { name: `${TAG} mine, renamed` } })
  const md = await M(`/spaces/${OPEN}/folders/${mine}`, { method: 'DELETE' })
  const mineAfter = await row(mine)
  chk(
    mr.status < 300 && md.status < 300 && mineAfter?.name === `${TAG} mine, renamed` && mineAfter?.is_archived === true,
    'in a space at Full edit a member renames and deletes the folder they made',
    `rename ${said(mr)}, delete ${said(md)}; after ${JSON.stringify(mineAfter)}`,
  )

  const theirs = await folderOf(A, VIEW, 'admin’s own')
  const ar = await A(`/spaces/${VIEW}/folders/${theirs}`, { method: 'PATCH', body: { name: `${TAG} renamed by the admin`, visibility: 'private' } })
  const ad = await A(`/spaces/${VIEW}/folders/${theirs}`, { method: 'DELETE' })
  const theirsAfter = await row(theirs)
  chk(
    ar.status < 300 && ad.status < 300 && theirsAfter?.name === `${TAG} renamed by the admin` && theirsAfter?.is_archived === true,
    'an admin renames, makes private and deletes a folder in the view-only space, which binds members, not admins',
    `rename ${said(ar)}, delete ${said(ad)}; after ${JSON.stringify(theirsAfter)}`,
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
