/**
 * §V2-10 — a task↔doc link is readable from BOTH ends.
 *
 * `[06:04]` "aap task ko kisi aur task ke saath LINK kar sakte ho — yeh
 * RELATIONSHIP se hoga; woh koi bhi document hai, kuch bhi", and `[06:15]`
 * "acha, is document ka yeh task hai" — she reads the relationship from the
 * DOCUMENT.
 *
 * Rundesk has stored `task_doc_links` since relationships shipped and read it in
 * exactly one direction: `where(taskDocLinks.taskId)`. A task knew its docs; a
 * doc knew nothing. You could link them from the task, open the doc, and see no
 * sign it had happened. Half a relationship is not a relationship.
 *
 * THE CHECK THAT IS NOT ABOUT THE FEATURE.
 *
 * Doc access is workspace membership, but a linked task can be PRIVATE. A doc
 * that lists its tasks is therefore a way to read titles you are not allowed to
 * see, unless the same visibility filter the task lists use is applied. So this
 * signs in a second, non-manager member and insists the private task is absent
 * for them while present for its owner — a check that passes trivially if you
 * forget to link anything, which is why it also asserts the PUBLIC one IS
 * visible to that same person.
 *
 *   node test/e2e/doc-task-links.mjs --api 3011
 */
import { signInApi } from './lib/signin.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 8

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
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

const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  const stamp = Date.now()

  const spaces = (await A(`/spaces/workspace/${workspaceId}`)).data ?? []
  let listId = null
  for (const s of spaces) {
    for (const p of (await A(`/projects/space/${s.id}`)).data ?? []) {
      const ls = (await A(`/lists/project/${p.id}`)).data ?? []
      if (ls[0]?.id) { listId = ls[0].id; break }
    }
    if (listId) break
  }
  if (!listId) throw new Error('no list to make tasks in')

  const doc = (await A(`/workspaces/${workspaceId}/docs`, {
    method: 'POST', body: { title: `Link doc ${stamp}` },
  })).data
  const other = (await A(`/workspaces/${workspaceId}/docs`, {
    method: 'POST', body: { title: `Unlinked doc ${stamp}` },
  })).data
  if (!doc?.id || !other?.id) throw new Error('could not make docs')

  const open = (await A('/tasks', { method: 'POST', body: { listId, title: `Public linked ${stamp}` } })).data
  const secret = (await A('/tasks', { method: 'POST', body: { listId, title: `Private linked ${stamp}` } })).data
  await A(`/tasks/${secret.id}`, { method: 'PATCH', body: { visibility: 'private' } })

  console.log('\n▶ §V2-10 — the doc end of the link')
  const linkA = await A(`/tasks/${open.id}/linked-docs`, { method: 'POST', body: { docId: doc.id } })
  const linkB = await A(`/tasks/${secret.id}/linked-docs`, { method: 'POST', body: { docId: doc.id } })
  chk(linkA.status < 400 && linkB.status < 400, 'a task can be linked to a doc',
    `linking returned ${linkA.status} / ${linkB.status}`)

  const fromTask = (await A(`/tasks/${open.id}/linked-docs`)).data ?? []
  chk(fromTask.some((d) => d.docId === doc.id), 'and the task shows the doc (this half already worked)',
    `the task lists ${JSON.stringify(fromTask.map((d) => d.title))}`)

  const fromDoc = (await A(`/docs/${doc.id}/tasks`)).data ?? []
  chk(
    fromDoc.some((r) => r.taskId === open.id),
    'and now the DOC shows the task',
    `GET /docs/:id/tasks returned ${JSON.stringify(fromDoc.map((r) => r.title))}`,
  )

  /*
   * The control. Without it, a build that answers "every task in the workspace"
   * passes the check above — the linked one would be in that list too.
   */
  const fromOther = (await A(`/docs/${other.id}/tasks`)).data ?? []
  chk(
    fromOther.length === 0,
    'a doc with no links shows none',
    `an unlinked doc listed ${fromOther.length} task(s): ${JSON.stringify(fromOther.map((r) => r.title))}`,
  )

  // ── Visibility ────────────────────────────────────────────────────────────
  console.log('\n▶ and it does not become a way to read private titles')
  const outsider = { email: `docpeer-${stamp}@rundesk.invalid`, password: 'Member@12345!' }
  const signup = await apiAs(null)('/auth/signup', {
    method: 'POST',
    body: {
      fullName: `Doc Peer ${stamp}`,
      email: outsider.email,
      password: outsider.password,
      organizationName: `DocPeer ${stamp}`,
      organizationSlug: `docpeer-${stamp}`,
    },
  })
  if (!signup.data?.accessToken) throw new Error(`signup failed: ${signup.status}`)
  const added = await A(`/workspaces/${workspaceId}/members`, {
    method: 'POST', body: { email: outsider.email, role: 'member' },
  })
  chk(added.status < 400, 'a plain member can be put in the workspace',
    `addMember returned ${added.status}`)

  const B = apiAs(signup.data.accessToken)
  const peerSees = (await B(`/docs/${doc.id}/tasks`)).data ?? []
  const titles = peerSees.map((r) => r.title)
  chk(
    titles.includes(`Public linked ${stamp}`),
    'a member sees the public task on the doc',
    `the member saw ${JSON.stringify(titles)} — if this is empty the next check proves nothing`,
  )
  chk(
    !titles.includes(`Private linked ${stamp}`),
    'and NOT the private one they were never allowed to read',
    `a private task leaked through the doc: ${JSON.stringify(titles)}`,
  )
  chk(
    (await B(`/docs/${doc.id}/tasks`)).status < 400,
    'while the doc itself stays readable to them',
    'a member could not read the linked tasks of a doc in their own workspace',
  )

  // Tidy up — this runs against a real workspace.
  await A(`/tasks/${open.id}`, { method: 'DELETE' }).catch(() => {})
  await A(`/tasks/${secret.id}`, { method: 'DELETE' }).catch(() => {})
  await A(`/workspaces/${workspaceId}/members/${signup.data.user?.id}`, { method: 'DELETE' }).catch(() => {})
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran < EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
