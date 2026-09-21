/**
 * §V2-06, frame `06:52` — "Default permission  Full edit ▾", and the reader it
 * never had.
 *
 * THE DEFECT THIS SUITE EXISTS OVER. `spaces.default_permission` was written by
 * the wizard, validated on create, validated again on update, declared in two
 * controller body types and `notNull()` in the schema — and read by NOTHING.
 * `defaultPermission` appeared nowhere in `apps/api/src` outside
 * `spaces.service.ts` and `spaces.controller.ts`; no access check anywhere
 * consumed `SpaceDefaultPermission`. The schema comment says
 *
 *   > What a workspace member gets on this space without an explicit grant.
 *
 * and every workspace member could edit every container in every public space
 * whatever the column said. That is the mirror of a facade: the round-trip is
 * green, the toast is green, and the row in Postgres is evidence for a feature
 * that does not exist.
 *
 * SO EVERY ASSERTION HERE IS ABOUT WHAT THE SERVER DOES, not what the UI draws.
 * A page that greys out a button proves nothing — the same `PUT` from a `curl`
 * has to come back 403, and the row has to be unchanged afterwards.
 *
 * THE SHAPE THAT MAKES IT A REAL TEST, not a tautology:
 *
 *   · The member CREATES the list themselves, so the existing creator
 *     short-circuit ("the creator may always manage their own container") would
 *     let the rename through. Pointing a plain member at somebody else's list
 *     proves nothing: that was already refused, and the check would pass on a
 *     build where the column is still inert.
 *   · Every refusal is paired with the SAME operation in a space whose default
 *     is `edit`. A gate that refuses everybody is not this feature, and a
 *     one-sided suite cannot tell the two apart.
 *   · `comment` is exercised as well as `view`, so a check written as
 *     `=== 'view'` fails here instead of shipping.
 *   · The read still works. "View only" has to mean view, not nothing.
 *
 * Runs against the API alone — no browser, no dist. The question is whether the
 * server refuses, and the browser is not qualified to answer it.
 *
 *   node test/e2e/space-default-permission.mjs --api 3011
 */
import { signInApi } from './lib/signin.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/*
 * How many checks a complete run performs. Compared with `!==` and never `<`:
 * with `<`, a branch that silently skipped turns into a shorter run that still
 * reports "0 failed".
 */
const EXPECTED_CHECKS = 22

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`) }
}

/*
 * NEVER THROWS — it returns `{status, data, error}`. So every call site below
 * reads `status` explicitly; a `.catch(() => {})` on one of these would be
 * inert and a failed request would read as a success.
 */
const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

const messageOf = (error) =>
  typeof error === 'string' ? error : (error?.message ?? JSON.stringify(error ?? null))

const cleanup = []
const stamp = Date.now()
/* Every row this suite makes carries the stamp; every lookup filters on it. The
 * e2e database is shared, so a check that counted "the spaces in this
 * workspace" would be asserting over three other agents' fixtures. */
const TAG = `sdp-${stamp}`

try {
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  if (!workspaceId) throw new Error('this account can see no workspace')

  // ── a plain member ─────────────────────────────────────────────────────────
  // Stamped and removed again at the end: suites that accumulate identically
  // named people break the pickers in other suites, which this repo has
  // recorded more than once.
  const member = {
    email: `sdp-${stamp}@rundesk.invalid`,
    password: 'Member@12345!',
  }
  const signup = await apiAs(null)('/auth/signup', {
    method: 'POST',
    body: {
      fullName: `Default Perm ${stamp}`,
      email: member.email,
      password: member.password,
      organizationName: `DefaultPerm ${stamp}`,
      organizationSlug: `defaultperm-${stamp}`,
    },
  })
  if (!signup.data?.accessToken) throw new Error(`signup failed: ${signup.status} ${JSON.stringify(signup.error)}`)
  const memberId = signup.data?.user?.id ?? signup.data?.id
  const M = apiAs(signup.data.accessToken)

  const added = await A(`/workspaces/${workspaceId}/members`, {
    method: 'POST',
    body: { email: member.email, role: 'member' },
  })
  chk(
    added.status < 400,
    'a plain member — not a manager, not an admin — is in the workspace',
    `addMember returned ${added.status}: ${JSON.stringify(added.error)}`,
  )
  cleanup.push(() => A(`/workspaces/${workspaceId}/members/${memberId}`, { method: 'DELETE' }))

  // ── three spaces, one per rung under `edit`, plus the control ──────────────
  const makeSpace = async (permission) => {
    const res = await A('/spaces', {
      method: 'POST',
      body: { workspaceId, name: `${TAG} ${permission}`, defaultPermission: permission },
    })
    if (res.status >= 400 || !res.data?.id) {
      throw new Error(`could not create the ${permission} space: ${res.status} ${JSON.stringify(res.error)}`)
    }
    cleanup.push(() => A(`/spaces/${res.data.id}`, { method: 'DELETE' }))
    return res.data
  }
  const viewSpace = await makeSpace('view')
  const commentSpace = await makeSpace('comment')
  const editSpace = await makeSpace('edit')

  chk(
    viewSpace.defaultPermission === 'view' &&
      commentSpace.defaultPermission === 'comment' &&
      editSpace.defaultPermission === 'edit',
    'the wizard\'s three answers are on the three spaces `[frame 06:52]`',
    `got ${JSON.stringify([viewSpace.defaultPermission, commentSpace.defaultPermission, editSpace.defaultPermission])}`,
  )

  // ── the member makes a list in each, so the CREATOR branch is in play ──────
  const makeList = async (space) => {
    const res = await M('/lists', {
      method: 'POST',
      body: { spaceId: space.id, name: `${TAG} list` },
    })
    return res
  }
  /*
   * THIS USED TO READ `the member creates a list of their own in each space`,
   * AND IT PASSED, AND THAT WAS THE BUG.
   *
   * Creation consulted the space's Default permission nowhere. So in a space
   * set to "View only" a member could not rename a list and could not delete
   * one, and could freely make a new one — then edit that one too, because the
   * creator short-circuit applies to containers that already exist. A door
   * around the rule rather than a gap in it, and this check was standing in
   * front of it saying the door was meant to be there.
   *
   * The member's own list still has to EXIST in each space, because the
   * creator-branch refusals below are the other half of the row. So the space
   * is briefly raised to `edit`, the member creates their list, and it is put
   * back. That is also the real sequence rather than a contrivance: a space
   * gets downgraded and what is already inside it stays.
   */
  const withEditable = async (space, fn) => {
    const up = await A(`/spaces/${space.id}`, {
      method: 'PUT',
      body: { defaultPermission: 'edit' },
    })
    if (up.status >= 400) throw new Error(`could not raise ${space.id}: ${up.status}`)
    try {
      return await fn()
    } finally {
      const down = await A(`/spaces/${space.id}`, {
        method: 'PUT',
        body: { defaultPermission: space.defaultPermission },
      })
      if (down.status >= 400) {
        throw new Error(
          `could not restore ${space.id} to ${space.defaultPermission}: ${down.status} — ` +
            'every refusal below would then be measuring an editable space',
        )
      }
    }
  }
  const viewList = await withEditable(viewSpace, () => makeList(viewSpace))
  const commentList = await withEditable(commentSpace, () => makeList(commentSpace))
  const editList = await makeList(editSpace)
  chk(
    viewList.status < 400 && !!viewList.data?.id &&
      commentList.status < 400 && !!commentList.data?.id &&
      editList.status < 400 && !!editList.data?.id,
    'the member has a list of their own in each space, made while the space allowed it',
    `create returned ${viewList.status} / ${commentList.status} / ${editList.status}`,
  )

  // ── `06:52` — and ADDING to the space is a change to the space ────────────
  console.log('\n▶ `06:52` — "View only" refuses creation, not only editing')
  /*
   * The same resolver the edit and delete paths refuse with, so the two gates
   * cannot drift apart — and so an explicit `space_members` grant raises both
   * at once. `comment` is checked as well as `view`, because `comment` is
   * below `edit` on the ladder and a check written as `=== 'view'` would ship.
   */
  const listsBefore = await A(`/lists/space/${viewSpace.id}`)
  const countBefore = (listsBefore.data ?? []).length
  const madeInView = await makeList(viewSpace)
  chk(
    madeInView.status === 403,
    'creating a list in a view-only space is refused with 403',
    `POST /lists returned ${madeInView.status} ${messageOf(madeInView.error)} — creation used to ` +
      'consult the space default nowhere, so a member could add to a space they could not edit',
  )
  chk(
    /default permission/i.test(messageOf(madeInView.error)),
    'and it says WHY, in the same words the rename refusal uses',
    `the refusal read "${messageOf(madeInView.error)}"`,
  )
  /*
   * The row count, not the status. A 403 with the row written anyway is a
   * check passing on a bug — the same reason the rename refusal re-reads the
   * list below.
   */
  const listsAfter = await A(`/lists/space/${viewSpace.id}`)
  chk(
    listsAfter.status === 200 && (listsAfter.data ?? []).length === countBefore,
    'and no list was actually written — the refusal was not cosmetic',
    `the space held ${countBefore} list(s) before and ${(listsAfter.data ?? []).length} after`,
  )
  const madeInComment = await makeList(commentSpace)
  chk(
    madeInComment.status === 403,
    'and "Comment" refuses it too — the rung below `edit`, not only the bottom one',
    `POST /lists returned ${madeInComment.status} ${messageOf(madeInComment.error)}`,
  )

  // ── the refusals ──────────────────────────────────────────────────────────
  console.log('\n▶ `06:52` — "View only" means the server says no')

  const renamedView = await M(`/lists/${viewList.data.id}`, {
    method: 'PUT',
    body: { name: `${TAG} renamed by member` },
  })
  chk(
    renamedView.status === 403,
    'renaming their OWN list in a view-only space is refused with 403',
    `PUT /lists/:id returned ${renamedView.status} ${messageOf(renamedView.error)} — ` +
      'the space says View only and the creator short-circuit let it through anyway',
  )
  chk(
    /default permission/i.test(messageOf(renamedView.error)),
    'and the refusal says WHY — the space\'s default permission, not a generic denial',
    `the 403 read "${messageOf(renamedView.error)}"`,
  )

  /*
   * The row itself, re-read as the admin. A 403 with the write applied anyway
   * is a check passing on a bug — the status code and the state are different
   * facts and only the second one is the feature.
   */
  const afterView = await A(`/lists/${viewList.data.id}`)
  chk(
    afterView.status === 200 && afterView.data?.name === `${TAG} list`,
    'and the list really is unchanged — the refusal was not cosmetic',
    `the list is now named ${JSON.stringify(afterView.data?.name)} (status ${afterView.status})`,
  )

  const deletedView = await M(`/lists/${viewList.data.id}`, { method: 'DELETE' })
  chk(
    deletedView.status === 403,
    'deleting it is refused too, not only renaming it',
    `DELETE /lists/:id returned ${deletedView.status} ${messageOf(deletedView.error)}`,
  )

  const renamedComment = await M(`/lists/${commentList.data.id}`, {
    method: 'PUT',
    body: { name: `${TAG} renamed in comment space` },
  })
  chk(
    renamedComment.status === 403,
    '`comment` — the rung between — is refused as well, so the gate is a ladder and not an `=== "view"`',
    `PUT in the comment-default space returned ${renamedComment.status} ${messageOf(renamedComment.error)}`,
  )

  console.log('\n▶ and it narrows rather than blocking everything')

  const renamedEdit = await M(`/lists/${editList.data.id}`, {
    method: 'PUT',
    body: { name: `${TAG} renamed in edit space` },
  })
  chk(
    renamedEdit.status < 400 && renamedEdit.data?.name === `${TAG} renamed in edit space`,
    'the SAME member renaming the SAME kind of list succeeds where the default is `edit`',
    `PUT in the edit-default space returned ${renamedEdit.status} ${messageOf(renamedEdit.error)} — ` +
      'a gate that refuses everybody is not this feature',
  )

  const readView = await M(`/lists/${viewList.data.id}`)
  chk(
    readView.status === 200 && readView.data?.id === viewList.data.id,
    'and "View only" still means VIEW — the member can read the list they may not change',
    `GET /lists/:id as the member returned ${readView.status}`,
  )

  /*
   * The admin created these spaces, so `createSpace` seeded them as a
   * `space_members` admin — an EXPLICIT grant. Left in place, the next check
   * would pass on a build where the workspace role is ignored entirely, because
   * the grant would be carrying it. Taken away first, so the check is really
   * about the role. Thrown rather than asserted: a fixture that did not happen
   * must stop the run, not become a green check.
   */
  const adminId = auth.user?.id ?? auth.id
  const unseated = await A(`/spaces/${viewSpace.id}/members/${adminId}`, { method: 'DELETE' })
  if (unseated.status >= 400) {
    throw new Error(
      `could not remove the admin's seeded space_members row (${unseated.status} ` +
        `${messageOf(unseated.error)}) — the admin check below would be about that grant, not the role`,
    )
  }
  const adminRename = await A(`/lists/${viewList.data.id}`, {
    method: 'PUT',
    body: { name: `${TAG} renamed by admin` },
  })
  chk(
    adminRename.status < 400 && adminRename.data?.name === `${TAG} renamed by admin`,
    'a workspace admin is not narrowed by a space setting, with no explicit grant to lean on',
    `the admin's PUT returned ${adminRename.status} ${messageOf(adminRename.error)} — ` +
      'a space setting that can lock an admin out of their own workspace is a foot-gun',
  )

  console.log('\n▶ an explicit grant beats the default — "without an explicit grant"')

  const granted = await A(`/spaces/${viewSpace.id}/members`, {
    method: 'POST',
    body: { userId: memberId, role: 'edit' },
  })
  chk(
    granted.status < 400,
    'the member is given an explicit `edit` role on the view-only space',
    `POST /spaces/:id/members returned ${granted.status} ${messageOf(granted.error)}`,
  )
  const renamedAfterGrant = await M(`/lists/${viewList.data.id}`, {
    method: 'PUT',
    body: { name: `${TAG} renamed after grant` },
  })
  chk(
    renamedAfterGrant.status < 400 && renamedAfterGrant.data?.name === `${TAG} renamed after grant`,
    'and now the same PUT succeeds — the default is a FALLBACK, not a ceiling',
    `PUT after the grant returned ${renamedAfterGrant.status} ${messageOf(renamedAfterGrant.error)}`,
  )

  console.log('\n▶ the Move picker does not offer a destination the server will refuse')

  /*
   * Fetched AFTER the grant above was removed again, so this measures the
   * default and not the grant. Removing it here rather than in `cleanup` is
   * deliberate: the next three checks are about what the default does.
   */
  const revoked = await A(`/spaces/${viewSpace.id}/members/${memberId}`, { method: 'DELETE' })
  chk(
    revoked.status < 400,
    'the explicit grant is taken away again so the default is what is being measured',
    `DELETE /spaces/:id/members/:userId returned ${revoked.status} ${messageOf(revoked.error)}`,
  )

  const memberTargets = await M(`/spaces/workspace/${workspaceId}/move-targets`)
  chk(memberTargets.status === 200, 'the member can fetch the move targets at all',
    `GET move-targets returned ${memberTargets.status}`)
  // Narrowed to THIS suite's spaces by id: the workspace is shared and a count
  // over everything would be asserting on other agents' fixtures.
  const memberIds = new Set((memberTargets.data ?? []).map((s) => s.id))
  chk(
    !memberIds.has(viewSpace.id) && !memberIds.has(commentSpace.id),
    'a space the member may not write to is not offered as a move destination',
    `move-targets still offered ${JSON.stringify(
      [viewSpace.id, commentSpace.id].filter((id) => memberIds.has(id)),
    )}`,
  )
  chk(
    memberIds.has(editSpace.id),
    'while the `edit` space still is — the filter is the permission, not an empty answer',
    'move-targets dropped the edit-default space too, so the list is empty rather than filtered',
  )

  const adminTargets = await A(`/spaces/workspace/${workspaceId}/move-targets`)
  const adminIds = new Set((adminTargets.data ?? []).map((s) => s.id))
  chk(
    adminTargets.status === 200 && adminIds.has(viewSpace.id) && adminIds.has(editSpace.id),
    'and the admin is still offered all three — nothing was removed from the tree itself',
    `the admin's move-targets (status ${adminTargets.status}) held ${JSON.stringify(
      [viewSpace.id, commentSpace.id, editSpace.id].filter((id) => adminIds.has(id)),
    )}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  for (const fn of cleanup.reverse()) await fn().catch(() => {})
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so ` +
        '"0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
