/**
 * §V2-07 — Private view, Protect view, Pin view, Set as default, Copy link,
 * Sharing & Permissions.
 *
 * Frames `10:36` (board) and `11:14` (list) show the Customize panel:
 *
 *   Autosave for me · Pin view · Private view · Protect view ·
 *   Set as default view · Copy link to view · Favorite · Export view ·
 *   Sharing & Permissions
 *
 * `task_views` carried `name, type, config, position, isDefault` and nothing
 * else, and `ViewsService` had NO ownership check of any kind: any member of a
 * list could rename, re-default or DELETE any view on it, including the
 * default one the whole team worked in. So most of what follows is not
 * "does the new switch work" — it is "can somebody else still walk over your
 * view", which used to be yes.
 *
 *   node test/e2e/view-visibility.mjs --api 3011
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { apiAs as apiAsAt, madeAccount } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 23

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
  // The SENTENCE, then the reason. This printed `${bad ?? good}`, so a failing
  // check named only its reason and never itself — and for a check inside a
  // loop the reason is all a reader (or `check-break-reddened.mjs`) has to go
  // on. Seventy suites shared the line.
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` \u2014 ${bad}` : ''}`) }
}

// lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`).
// It throws when nothing answers, as the copy did, so a dead API stops the run
// rather than answering a status of 0 that a check could take for success.
const apiAs = apiAsAt(API, { noAnswer: 'throw' })

let cleanup = []

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  const stamp = Date.now()

  const spaces = (await A(`/spaces/workspace/${workspaceId}`)).data ?? []
  const spaceId = spaces[0]?.id
  if (!spaceId) throw new Error('no space')
  const list = (await A('/lists', { method: 'POST', body: { spaceId, name: `Views list ${stamp}` } })).data
  if (!list?.id) throw new Error('could not make a list')
  cleanup.push(() => A(`/lists/${list.id}`, { method: 'DELETE' }))

  const mkView = async (name, extra = {}) =>
    (await A(`/lists/${list.id}/views`, {
      method: 'POST', body: { name, type: 'list', config: {}, ...extra },
    })).data

  const shared = await mkView(`Shared ${stamp}`)
  const secret = await mkView(`Secret ${stamp}`, { visibility: 'private' })
  const guarded = await mkView(`Guarded ${stamp}`, { visibility: 'protected' })
  if (!shared?.id || !secret?.id || !guarded?.id) throw new Error('could not make the views')

  /*
   * AN UNKNOWN VISIBILITY IS REFUSED, AND BY THE SERVICE.
   *
   * `views.service.ts` checks `VISIBILITIES.includes(...)` and throws naming
   * the value it could not accept; migration 0134 also puts
   * `CHECK (visibility IN ('everyone','private','protected'))` on the column,
   * and `AllExceptionsFilter` maps that 23514 to a 400. So the status is the
   * database's either way and only the sentence is the service's — the same
   * shape as `list-name-taken`'s 409 and `ai-value`'s bounds.
   *
   * Nothing tested this at all: the service check, the constraint and the
   * message were three things nobody had ever asked a question of.
   */
  const bogus = await A(`/lists/${list.id}/views`, {
    method: 'POST', body: { name: `Bogus ${stamp}`, type: 'list', config: {}, visibility: 'everybody' },
  })
  chk(
    bogus.status >= 400 && bogus.status < 500,
    'a view cannot be created with a visibility that does not exist',
    `it answered ${bogus.status} — an unknown visibility was stored, and every reader of that ` +
      'column now has a fourth case it was never written for',
  )
  chk(
    /everybody/.test(JSON.stringify(bogus.error ?? '')),
    'and the refusal names the value it would not take',
    `it said ${JSON.stringify(bogus.error)} — a message that does not quote the value leaves ` +
      'somebody guessing which of the fields they sent was the wrong one',
  )

  console.log('\n▶ a private view belongs to the person who made it')
  chk(secret.visibility === 'private', 'a view can be created private',
    `visibility came back as ${JSON.stringify(secret.visibility)}`)
  const mine = (await A(`/lists/${list.id}/views`)).data ?? []
  chk(
    mine.some((v) => v.id === secret.id),
    'and its owner still sees it in the list',
    'the owner lost sight of their own private view',
  )

  // ── A second person, a plain member, not a manager. ───────────────────────
  const peer = { email: `viewpeer-${stamp}@rundesk.invalid`, password: 'Member@12345!' }
  // Registered, so the account is removed when the run ends (`lib/made.mjs`).
  madeAccount({ email: peer.email })
  const signup = await apiAs(null)('/auth/signup', {
    method: 'POST',
    body: {
      fullName: `View Peer ${stamp}`,
      email: peer.email,
      password: peer.password,
      organizationName: `ViewPeer ${stamp}`,
      organizationSlug: `viewpeer-${stamp}`,
    },
  })
  if (!signup.data?.accessToken) throw new Error(`signup failed: ${signup.status}`)
  const peerId = signup.data.user?.id
  const added = await A(`/workspaces/${workspaceId}/members`, {
    method: 'POST', body: { email: peer.email, role: 'member' },
  })
  chk(added.status < 400, 'a plain member can be put in the workspace',
    `addMember returned ${added.status} — nothing below this line means anything`)
  cleanup.push(() => A(`/workspaces/${workspaceId}/members/${peerId}`, { method: 'DELETE' }))
  const B = apiAs(signup.data.accessToken)

  const theirs = (await B(`/lists/${list.id}/views`)).data ?? []
  const theirNames = theirs.map((v) => v.name)
  chk(
    theirNames.includes(`Shared ${stamp}`),
    'the member sees the ordinary view',
    `the member saw ${JSON.stringify(theirNames)} — if this is empty the next check proves nothing`,
  )
  chk(
    !theirs.some((v) => v.id === secret.id),
    'and the private one is not in their list at all',
    'a private view was listed to somebody who does not own it',
  )
  const peek = await B(`/views/${secret.id}`)
  chk(
    peek.status === 404,
    'nor can they fetch it by id — 404, not 403',
    `asking for it by id returned ${peek.status}: "you may not see this" says it is there`,
  )
  const rename = await B(`/views/${secret.id}`, { method: 'PATCH', body: { name: 'hijacked' } })
  chk(rename.status === 404, 'and they cannot rename what they cannot see',
    `PATCH on somebody's private view returned ${rename.status}`)
  const wipe = await B(`/views/${secret.id}`, { method: 'DELETE' })
  chk(wipe.status === 404, 'or delete it',
    `DELETE on somebody's private view returned ${wipe.status}`)

  console.log('\n▶ a protected view is visible to all and editable by its owner')
  chk(
    theirs.some((v) => v.id === guarded.id),
    'the member sees the protected view',
    'a protected view was hidden — protect is not private',
  )
  const touchGuarded = await B(`/views/${guarded.id}`, { method: 'PATCH', body: { name: `Renamed ${stamp}` } })
  chk(
    touchGuarded.status === 403,
    'but cannot change it',
    `PATCH on a protected view returned ${touchGuarded.status} — this is the switch's whole purpose`,
  )
  const dropGuarded = await B(`/views/${guarded.id}`, { method: 'DELETE' })
  chk(dropGuarded.status === 403, 'and cannot delete it',
    `DELETE on a protected view returned ${dropGuarded.status}`)
  const ownerRename = await A(`/views/${guarded.id}`, { method: 'PATCH', body: { name: `Guarded ${stamp} v2` } })
  chk(ownerRename.status < 400, 'while its owner still can',
    `the owner got ${ownerRename.status} on their own protected view`)

  console.log('\n▶ pinning, defaulting, and the one combination that is refused')
  /*
   * Pin the LAST view made, not the first.
   *
   * The first version of this check pinned `shared`, which was created first
   * and therefore already sorted first — so it passed with the pin ordering
   * deleted from the query, and the break test caught it. A check that would
   * pass anyway is not a check. `guarded` is third of three, so it can only
   * reach the front by being pinned.
   */
  const beforePin = (await A(`/lists/${list.id}/views`)).data ?? []
  chk(
    beforePin[0]?.id !== guarded.id,
    'the last view made is not at the front to begin with',
    'the control failed: the view about to be pinned was already first, so pinning it would prove nothing',
  )
  await A(`/views/${guarded.id}`, { method: 'PATCH', body: { isPinned: true } })
  const ordered = (await A(`/lists/${list.id}/views`)).data ?? []
  chk(
    ordered[0]?.id === guarded.id,
    'and pinning it sorts it to the front of the strip',
    `the first view was ${JSON.stringify(ordered[0]?.name)}`,
  )
  await A(`/views/${shared.id}`, { method: 'PATCH', body: { isDefault: true } })
  const afterDefault = (await A(`/lists/${list.id}/views`)).data ?? []
  chk(
    afterDefault.filter((v) => v.isDefault).length === 1 &&
      afterDefault.find((v) => v.isDefault)?.id === shared.id,
    'and exactly one view is the default at a time',
    `defaults: ${JSON.stringify(afterDefault.filter((v) => v.isDefault).map((v) => v.name))}`,
  )
  const contradiction = await A(`/views/${shared.id}`, { method: 'PATCH', body: { visibility: 'private' } })
  chk(
    contradiction.status === 400,
    'a view cannot be both the list default and private',
    `making the default view private returned ${contradiction.status} — everyone would land on a view they cannot see`,
  )

  console.log('\n▶ Autosave for me is per person')
  await A(`/views/${shared.id}/autosave`, { method: 'PATCH', body: { autosave: true } })
  const forMe = ((await A(`/lists/${list.id}/views`)).data ?? []).find((v) => v.id === shared.id)
  const forThem = ((await B(`/lists/${list.id}/views`)).data ?? []).find((v) => v.id === shared.id)
  chk(forMe?.autosave === true, 'the person who turned it on has it on',
    `their own flag read back as ${JSON.stringify(forMe?.autosave)}`)
  chk(
    forThem?.autosave === false,
    'and the other person, on the same view, does not',
    `the flag leaked to another user: ${JSON.stringify(forThem?.autosave)} — its tooltip says each user turns it on independently`,
  )

  console.log('\n▶ Sharing & Permissions knows what a view is')
  const shares = await A(`/shares/view/${shared.id}`)
  chk(
    shares.status === 200 && Array.isArray(shares.data?.items),
    'a view can be opened in the share panel like anything else',
    `GET /shares/view/:id returned ${shares.status} ${JSON.stringify(shares.error)}`,
  )

  // ══ WHO MANAGES A WORKSPACE ═══════════════════════════════════════════
  // "protected: its creator and the workspace's managers". The role list
  // behind that read `owner`, `admin` and `manager` — two roles no workspace
  // member has — so a manager could change a protected view and a workspace
  // admin could not. Measured on lane 1: 403 for the admin, 200 for the
  // manager. Its own workspace, so three people join nothing shared.
  console.log('\n▶ a protected view answers to the people who manage the workspace — admins as well as managers')
  const roleWs = (await A('/workspaces', { method: 'POST', body: { name: `Views roles ${stamp}` } })).data?.id
  if (!roleWs) throw new Error('could not make the roles workspace')
  cleanup.push(() => A(`/workspaces/${roleWs}`, { method: 'DELETE' }))
  const person = async (label, role) => {
    const email = `views-${label}-${stamp}@rundesk.invalid`
    const token = (await signUpApi(API, { fullName: `Views ${label}`, email, password: 'Member@12345!', organizationName: `Views ${label} ${stamp}`, organizationSlug: `views-${label}-${stamp}` }))?.accessToken
    const added = await A(`/workspaces/${roleWs}/members`, { method: 'POST', body: { email, role } })
    if (!token || added.status >= 300) throw new Error(`could not add the ${label}: ${added.status}`)
    return apiAs(token)
  }
  const owner = await person('owner', 'member')
  const wsAdmin = await person('admin', 'workspace_admin')
  const wsManager = await person('manager', 'manager')
  const roleSpace = (await A('/spaces', { method: 'POST', body: { workspaceId: roleWs, name: `Views roles ${stamp}`, defaultPermission: 'edit' } })).data?.id
  const roleProject = (await A('/projects', { method: 'POST', body: { spaceId: roleSpace, name: 'Roles' } })).data?.id
  const roleList = (await A('/lists', { method: 'POST', body: { projectId: roleProject, name: 'Roles' } })).data?.id
  if (!roleList) throw new Error('could not make the roles list')
  const ownView = async (name, visibility) =>
    (await owner(`/lists/${roleList}/views`, { method: 'POST', body: { name, type: 'list', config: {}, visibility } })).data
  const guardedByMember = await ownView(`Guarded by a member ${stamp}`, 'protected')
  const privateOfMember = await ownView(`Private to a member ${stamp}`, 'private')
  if (!guardedByMember?.id || !privateOfMember?.id) throw new Error('the member could not make their views')
  const byAdmin = await wsAdmin(`/views/${guardedByMember.id}`, { method: 'PATCH', body: { name: `Renamed by the admin ${stamp}` } })
  const byManager = await wsManager(`/views/${guardedByMember.id}`, { method: 'PATCH', body: { name: `Renamed by the manager ${stamp}` } })
  const guardedNow = ((await owner(`/lists/${roleList}/views`)).data ?? []).find((v) => v.id === guardedByMember.id)
  chk(
    byAdmin.status === 200 && byManager.status === 200 && guardedNow?.name === `Renamed by the manager ${stamp}`,
    'a workspace admin may change a member’s protected view, as a manager may',
    `admin answered ${byAdmin.status}, manager ${byManager.status}; the view is now called ${JSON.stringify(guardedNow?.name)}`,
  )
  const adminPrivate = await wsAdmin(`/views/${privateOfMember.id}`, { method: 'PATCH', body: { name: 'taken' } })
  const managerPrivate = await wsManager(`/views/${privateOfMember.id}`, { method: 'PATCH', body: { name: 'taken' } })
  const privateNow = ((await owner(`/lists/${roleList}/views`)).data ?? []).find((v) => v.id === privateOfMember.id)
  chk(
    adminPrivate.status === 404 && managerPrivate.status === 404 && privateNow?.name === `Private to a member ${stamp}`,
    'while neither may touch a member’s private view — it is not theirs to find',
    `admin ${adminPrivate.status}, manager ${managerPrivate.status}; it is now called ${JSON.stringify(privateNow?.name)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  // Each is a DELETE: gone, or already gone (404), is fine; anything else is
  // left behind, and said above the totals by the call that did not do it.
  for (const fn of cleanup.reverse()) {
    const what = String(fn).replace(/^\(\) => /, '')
    try {
      const res = await fn()
      if (![200, 204, 404].includes(res.status)) console.log(`  cleanup left behind: ${what} answered ${res.status}`)
    } catch (err) {
      console.log(`  cleanup left behind: ${what} got no answer (${err?.message ?? err})`)
    }
  }
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
