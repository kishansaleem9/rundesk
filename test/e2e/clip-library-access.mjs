/**
 * WHO READS AND DELETES A CLIP OF THE WORKSPACE'S LIBRARY.
 *
 * NOT A FRAME ROW: `found-5-oct/guests-read-and-delete-every-clip`. The
 * library's routes asked membership and nothing else. Measured on a lane: a
 * guest was listed every clip of the workspace, each with a signed URL that
 * served its bytes, deleted the admin's clip (and its link with it), and found
 * every clip's name and storage key in search; with a key, they got its link,
 * a share of it and a task's copy of it; a member deleted another member's
 * clip. The clips page drew Delete on every card, a guest's included.
 *
 * ClickUp, from its help centre (read through search excerpts;
 * help.clickup.com is blocked here). "Clips feature availability and limits":
 * guests, like members, can record Clips, "use Clips Hub" and "view Clips
 * shared with them", and "Clips Hub only displays Clips, Voice Clips, and
 * SyncUps recorded by you". "Clips Hub": a clip's menu there offers Rename,
 * Download and Delete. So a guest's library and search are the clips they
 * recorded, as the hub is; a clip shared with them (Share › Member mails its
 * link) is watched through that link and is not added to their library. What
 * they may not read they may not link, share or copy onto a task either. A
 * clip is deleted by whoever recorded it or by somebody who manages the
 * workspace (`apps/api/src/modules/clips/clip-access.ts`).
 *
 * Whether a guest may make a public link at all, even of a clip they recorded,
 * is the owner's open decision (`found-30-sep/guests-may-ask-for-clip-links`);
 * a guest's own clip is linked here as it was.
 *
 * Against the lane's real API and store: every clip is uploaded the way the
 * app uploads one (presign, then a PUT), by the person who records it.
 *
 *   node test/e2e/clip-library-access.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'
import { waitUntil, readText } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 10

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}
/** The server's own sentence for a delete it refuses: who may. */
const REFUSAL = 'Only the person who recorded this clip, or a manager or admin of the workspace, can delete it'
/** And for a link, a share or a task's copy a guest may not have: which clips are theirs. */
const READ_REFUSAL = 'Guests can share or attach only the clips they recorded'

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const stamp = Date.now()
const TAG = `cla${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const API = `${stack.base}/api/v1`
/* NEVER THROWS — `{status, ok, data, error}`. Every call site reads `ok` or an exact status.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? res.data ?? null).slice(0, 140)}`
/** The bytes a URL serves, as text, and its status; status 0 when nothing answered. */
const fetchText = async (url) => {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return { status: 0, text: null }
  const res = await fetch(url).catch(() => null)
  if (!res) return { status: 0, text: null }
  return { status: res.status, text: res.ok ? await res.text() : null }
}

let WS = null
let A = null
let browser = null
/** Every clip this run stored, taken back one by one at the end: the store is not the workspace's table. */
const keys = []

try {
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const password = 'Recorder@12345!'
    const signed = await signUpApi(API, {
      fullName: `Recorder ${who}`, email, password,
      organizationName: `Recorder ${who} ${stamp}`, organizationSlug: `recorder-${who}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add the ${who}: ${said(added)}`)
    return { id: signed.user?.id, email, password, as: apiAs(signed.accessToken) }
  }
  const guest = await person('guest', 'guest')
  const memberA = await person('membera', 'member')
  const memberB = await person('memberb', 'member')
  const manager = await person('manager', 'manager')

  /**
   * A clip recorded by `as`, uploaded as the app uploads one; its key. Its title names it on the page.
   *
   * `fromBefore`: stored as every clip recorded before a clip carried its
   * recorder's id was stored — the presigned PUT without its
   * `x-amz-meta-recordedbyid`, so the store keeps the recorder's address alone.
   * The lane's store does not verify a signature (`scripts/e2e-lanes/s3-stub.mjs`),
   * so it stores what the older presign stored.
   */
  const record = async (as, word, { fromBefore = false } = {}) => {
    const title = `${TAG}-${word}`
    const presign = await as(`/workspaces/${WS}/clips/presign`, {
      method: 'POST', body: { fileName: `${title}.webm`, contentType: 'video/webm', title },
    })
    if (!presign.ok || !presign.data?.uploadUrl) throw new Error(`the ${word} clip could not be presigned: ${said(presign)}`)
    const uploadUrl = new URL(presign.data.uploadUrl)
    if (fromBefore) {
      if (!uploadUrl.searchParams.has('x-amz-meta-recordedbyid')) {
        throw new Error(`the ${word} clip's upload names no recorder id to leave out: the presign changed, and this suite with it`)
      }
      uploadUrl.searchParams.delete('x-amz-meta-recordedbyid')
    }
    const put = await fetch(uploadUrl, { method: 'PUT', body: Buffer.from(`${title} bytes`), headers: { 'content-type': 'video/webm' } })
      .then((r) => r.status, () => 0)
    if (put !== 200) throw new Error(`the ${word} clip was not stored: ${put} — a lane needs its store for this suite`)
    keys.push(presign.data.storageKey)
    return { key: presign.data.storageKey, title }
  }
  const ADMINS = await record(A, 'adminsclip')
  const A_ONE = await record(memberA.as, 'membera-one')
  const A_TWO = await record(memberA.as, 'membera-two')
  const B_ONE = await record(memberB.as, 'memberb-one')
  const B_TWO = await record(memberB.as, 'memberb-two')
  // A guest records clips too (ClickUp: guests "can record Clips").
  const G_ONE = await record(guest.as, 'guestsown')
  const G_TWO = await record(guest.as, 'guestsother')
  // The manager's own: the delete dialog is opened on it after a refusal (check 8).
  const M_OWN = await record(manager.as, 'managersown')

  const listed = async (as) => {
    const res = await as(`/workspaces/${WS}/clips`)
    return { res, clips: Array.isArray(res.data) ? res.data : [] }
  }
  const adminLists = async (key) => (await listed(A)).clips.some((c) => c.storageKey === key)

  // ══ 1. THE LIBRARY ═══════════════════════════════════════════════════════
  console.log('\n▶ the library, as the guest and as a member read it')
  const g = await listed(guest.as)
  const gKeys = g.clips.map((c) => c.storageKey).sort()
  const gOwn = g.clips.find((c) => c.storageKey === G_ONE.key)
  const gServed = await fetchText(gOwn?.url)
  const m = await listed(memberB.as)
  const mKeys = new Set(m.clips.map((c) => c.storageKey))
  chk(
    g.res.status === 200 && JSON.stringify(gKeys) === JSON.stringify([G_ONE.key, G_TWO.key].sort()) &&
      gServed.status === 200 && gServed.text === `${G_ONE.title} bytes` &&
      m.res.status === 200 && [ADMINS, A_ONE, B_ONE, G_ONE].every((c) => mKeys.has(c.key)),
    'a guest’s library is the clips they recorded and nobody else’s, each signed for them — a member’s lists every clip',
    `the guest was listed ${g.res.status} ${JSON.stringify(g.clips.map((c) => c.title))}, their own clip's URL answered ${gServed.status}; ` +
      `the member was listed ${m.res.status} ${m.clips.length} clip(s), the admin's ${mKeys.has(ADMINS.key) ? 'among them' : 'NOT among them'}`,
  )

  // ══ 2. SEARCH ════════════════════════════════════════════════════════════
  console.log('\n▶ search, for the admin’s clip and for the guest’s own')
  const clipHits = async (as, word) => {
    const res = await as(`/search/${WS}?q=${encodeURIComponent(`${TAG}-${word}`)}&types=file`)
    const hits = Array.isArray(res.data) ? res.data : (res.data?.hits ?? res.data?.results ?? [])
    return { status: res.status, ids: hits.map((h) => h.id) }
  }
  const gFindsAdmins = await clipHits(guest.as, 'adminsclip')
  const gFindsOwn = await clipHits(guest.as, 'guestsown')
  const mFindsAdmins = await clipHits(memberB.as, 'adminsclip')
  chk(
    gFindsAdmins.status === 200 && !gFindsAdmins.ids.includes(`file-${ADMINS.key}`) &&
      gFindsOwn.status === 200 && gFindsOwn.ids.includes(`file-${G_ONE.key}`) &&
      mFindsAdmins.status === 200 && mFindsAdmins.ids.includes(`file-${ADMINS.key}`),
    'search finds a guest the clips they recorded and nobody else’s — a member finds the admin’s',
    `the guest, for the admin's clip: ${gFindsAdmins.status} ${JSON.stringify(gFindsAdmins.ids)}; for their own: ${gFindsOwn.status} ${JSON.stringify(gFindsOwn.ids)}; ` +
      `the member, for the admin's: ${mFindsAdmins.status} ${JSON.stringify(mFindsAdmins.ids)}`,
  )

  // ══ 3. A GUEST DELETES ═══════════════════════════════════════════════════
  console.log('\n▶ the guest deletes the admin’s clip, and their own')
  const gDelAdmins = await guest.as(`/workspaces/${WS}/clips`, { method: 'DELETE', body: { storageKey: ADMINS.key } })
  const adminsKept = await adminLists(ADMINS.key)
  const gDelOwn = await guest.as(`/workspaces/${WS}/clips`, { method: 'DELETE', body: { storageKey: G_TWO.key } })
  const ownGone = !(await adminLists(G_TWO.key))
  chk(
    gDelAdmins.status === 403 && gDelAdmins.error?.message === REFUSAL && adminsKept && gDelOwn.ok && ownGone,
    'a guest may not delete somebody else’s clip — refused, saying who may, and it stays; they delete their own',
    `the admin's clip: ${said(gDelAdmins)}, ${adminsKept ? 'still listed' : 'GONE'}; their own: ${said(gDelOwn)}, ${ownGone ? 'gone' : 'still listed'}`,
  )

  // ══ 4. MEMBERS AND A MANAGER DELETE ══════════════════════════════════════
  console.log('\n▶ members delete another member’s clip, the admin’s and their own; a manager a member’s')
  const bDelA = await memberB.as(`/workspaces/${WS}/clips`, { method: 'DELETE', body: { storageKey: A_ONE.key } })
  const aDelAdmins = await memberA.as(`/workspaces/${WS}/clips`, { method: 'DELETE', body: { storageKey: ADMINS.key } })
  const [aOneKept, adminsStill] = [await adminLists(A_ONE.key), await adminLists(ADMINS.key)]
  const aDelOwn = await memberA.as(`/workspaces/${WS}/clips`, { method: 'DELETE', body: { storageKey: A_TWO.key } })
  const mgrDel = await manager.as(`/workspaces/${WS}/clips`, { method: 'DELETE', body: { storageKey: B_ONE.key } })
  const [aTwoGone, bOneGone] = [!(await adminLists(A_TWO.key)), !(await adminLists(B_ONE.key))]
  chk(
    bDelA.status === 403 && bDelA.error?.message === REFUSAL && aDelAdmins.status === 403 && aDelAdmins.error?.message === REFUSAL &&
      aOneKept && adminsStill && aDelOwn.ok && aTwoGone && mgrDel.ok && bOneGone,
    'a member may not delete another member’s clip or the admin’s — refused, saying who may; they delete their own, and a manager deletes anybody’s',
    `another member's: ${said(bDelA)}, ${aOneKept ? 'kept' : 'GONE'}; the admin's: ${said(aDelAdmins)}, ${adminsStill ? 'kept' : 'GONE'}; ` +
      `their own: ${said(aDelOwn)}, ${aTwoGone ? 'gone' : 'kept'}; the manager's of a member's: ${said(mgrDel)}, ${bOneGone ? 'gone' : 'kept'}`,
  )

  // ══ THE PAGE ═════════════════════════════════════════════════════════════
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const signedIn = async (who) => {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
    await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', who.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    return page
  }
  /** The clips page as `page`'s reader sees it, once the cards are drawn: the titles drawn, and which offer Delete. */
  const library = async (page, expectTitle) => {
    await page.goto(`${stack.base}/app/${WS}/clips`, { waitUntil: 'domcontentloaded' })
    const cards = page.getByTestId('clip-card')
    await waitUntil(() => cards.filter({ hasText: expectTitle }).first().isVisible().catch(() => false), { timeoutMs: 20_000 })
    const drawn = {}
    for (const card of await cards.all()) {
      const text = await readText(card.filter({ visible: true }), { timeoutMs: 2_000 })
      if (!text) continue
      const title = [ADMINS, A_ONE, A_TWO, B_ONE, B_TWO, G_ONE, G_TWO, M_OWN].find((c) => text.includes(c.title))?.title ?? text.slice(0, 40)
      drawn[title] = (await card.getByTestId('clip-card-delete').filter({ visible: true }).count()) > 0
    }
    return drawn
  }

  // ══ 5. THE PAGE, A MEMBER ════════════════════════════════════════════════
  console.log('\n▶ the clips page, as the member who recorded a clip')
  const memberPage = await signedIn(memberA)
  const asMember = await library(memberPage, A_ONE.title)
  chk(
    asMember[A_ONE.title] === true && asMember[ADMINS.title] === false && asMember[B_TWO.title] === false && asMember[G_ONE.title] === false,
    'the clips page offers Delete on the reader’s own clip and on nobody else’s',
    `drawn, with whether each offers Delete: ${JSON.stringify(asMember)}`,
  )

  // ══ 6. THE PAGE, THE GUEST ═══════════════════════════════════════════════
  console.log('\n▶ the clips page, as the guest')
  const guestPage = await signedIn(guest)
  const asGuest = await library(guestPage, G_ONE.title)
  chk(
    JSON.stringify(asGuest) === JSON.stringify({ [G_ONE.title]: true }),
    'the guest’s clips page draws their own clip, with its Delete, and nobody else’s',
    `drawn, with whether each offers Delete: ${JSON.stringify(asGuest)}`,
  )

  // ══ 7. A DELETE THE SERVER REFUSES ═══════════════════════════════════════
  /*
   * A page opened while its reader could delete a clip still offers Delete
   * after their role changes. The manager opens the delete of a member's
   * clip, is made a member, and confirms: the server refuses, and the dialog
   * has to say so in the server's words — it said nothing.
   */
  console.log('\n▶ a delete the server refuses, on a page opened before the reader’s role changed')
  const managerPage = await signedIn(manager)
  const asManager = await library(managerPage, B_TWO.title)
  const bTwoCard = managerPage.getByTestId('clip-card').filter({ hasText: B_TWO.title }).first()
  if (asManager[B_TWO.title]) await bTwoCard.getByTestId('clip-card-delete').click({ timeout: 10_000 }).catch(() => {})
  const confirm = managerPage.getByRole('button', { name: /^Delete clip$/ })
  const opened = await waitUntil(() => confirm.isVisible().catch(() => false), { timeoutMs: 10_000 })
  const demoted = await A(`/workspaces/${WS}/members/${manager.id}`, { method: 'PATCH', body: { role: 'member' } })
  if (opened && demoted.ok) await confirm.click({ timeout: 10_000 }).catch(() => {})
  let refusal = ''
  await waitUntil(async () => {
    refusal = (await readText(managerPage.getByTestId('clip-delete-error').filter({ visible: true }), { timeoutMs: 500 })).trim()
    return refusal.length > 0
  }, { timeoutMs: 15_000 })
  const bTwoKept = await adminLists(B_TWO.key)
  chk(
    asManager[B_TWO.title] === true && opened && demoted.ok && refusal === REFUSAL && bTwoKept,
    'a delete the server refuses is said in the dialog, in the server’s words, and the clip stays',
    `the manager was offered Delete: ${asManager[B_TWO.title] ?? 'no card'}; the dialog opened: ${opened}; made a member: ${said(demoted)}; ` +
      `the dialog said ${JSON.stringify(refusal)}; the clip is ${bTwoKept ? 'still listed' : 'GONE'}`,
  )

  // ══ 8. THE NEXT DELETE, AFTER A REFUSAL ══════════════════════════════════
  /*
   * One dialog serves every card. The refusal drawn in it belongs to the
   * delete that was refused: cancelled, and opened on another clip — one the
   * reader recorded, theirs to delete — it opens without it, or it would say
   * "Only the person who recorded this clip…" over the reader's own clip.
   */
  console.log('\n▶ the delete dialog, opened on the reader’s own clip after a refusal')
  // The dialog's own buttons: with it closed, every card's trash button is named "Delete clip" too.
  const deleteDialog = managerPage.getByRole('dialog')
  const cancelled = refusal === REFUSAL &&
    await deleteDialog.getByRole('button', { name: /^Cancel$/ }).click({ timeout: 10_000 }).then(() => true, () => false)
  const closed = cancelled && await waitUntil(async () => (await deleteDialog.count()) === 0, { timeoutMs: 10_000 })
  const mOwnDelete = managerPage.getByTestId('clip-card').filter({ hasText: M_OWN.title }).first().getByTestId('clip-card-delete')
  const reopened = closed && await mOwnDelete.click({ timeout: 10_000 }).then(
    () => waitUntil(() => deleteDialog.getByRole('button', { name: /^Delete clip$/ }).isVisible().catch(() => false), { timeoutMs: 10_000 }),
    () => false,
  )
  const naming = reopened ? await readText(deleteDialog.filter({ visible: true }), { timeoutMs: 5_000 }) : ''
  const carried = reopened ? await deleteDialog.getByTestId('clip-delete-error').filter({ visible: true }).count() : -1
  chk(
    reopened && naming.includes(M_OWN.title) && carried === 0,
    'the delete dialog opens on the next clip without the last one’s refusal',
    `after the refusal ${JSON.stringify(refusal)}: cancelled ${cancelled}, closed ${closed}; opened on the reader's own clip: ${reopened}, ` +
      `naming it: ${naming.includes(M_OWN.title)}; refusals drawn in it: ${carried}`,
  )

  // ══ 9. A GUEST'S LINK, SHARE AND TASK COPY ═══════════════════════════════
  /*
   * A link plays the clip to whoever holds it, a share mails that link, and a
   * task's copy is signed for whoever reads the task: each hands the clip out,
   * so each asks the read rule. A guest holding the admin's key was given all
   * three, and the task's copy served the admin's bytes.
   */
  console.log('\n▶ the guest asks for the admin’s clip’s link, a share of it and a task’s copy of it, and for their own')
  const madeIn = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (!res.ok || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const SPACE = await madeIn('/spaces', { workspaceId: WS, name: `${TAG} space` }, 'a space')
  const PROJECT = await madeIn('/projects', { spaceId: SPACE, name: `${TAG} project` }, 'a project')
  const LIST = await madeIn('/lists', { projectId: PROJECT, name: `${TAG} list` }, 'a list')
  const TASK = await madeIn('/tasks', { listId: LIST, title: `${TAG} shared with the guest to edit` }, 'a task')
  const sharedTask = await A(`/shares/task/${TASK}`, { method: 'POST', body: { email: guest.email, level: 'edit' } })
  if (!sharedTask.ok) throw new Error(`could not share the task with the guest to edit: ${said(sharedTask)}`)
  const gLinkAdmins = await guest.as(`/workspaces/${WS}/clips/link`, { method: 'POST', body: { storageKey: ADMINS.key } })
  const gShareAdmins = await guest.as(`/workspaces/${WS}/clips/share`, { method: 'POST', body: { storageKey: ADMINS.key, mode: 'public' } })
  const gAttachAdmins = await guest.as(`/tasks/${TASK}/attachments/from-clip`, { method: 'POST', body: { storageKey: ADMINS.key } })
  const gLinkOwn = await guest.as(`/workspaces/${WS}/clips/link`, { method: 'POST', body: { storageKey: G_ONE.key } })
  const gAttachOwn = await guest.as(`/tasks/${TASK}/attachments/from-clip`, { method: 'POST', body: { storageKey: G_ONE.key } })
  const onTask = await A(`/tasks/${TASK}/attachments`)
  const onTaskNames = Array.isArray(onTask.data) ? onTask.data.map((f) => f.fileName) : null
  const refusedRead = (res) => res.status === 403 && res.error?.message === READ_REFUSAL && !res.data?.token
  chk(
    refusedRead(gLinkAdmins) && refusedRead(gShareAdmins) && refusedRead(gAttachAdmins) &&
      gLinkOwn.ok && typeof gLinkOwn.data?.token === 'string' && gAttachOwn.ok &&
      JSON.stringify(onTaskNames) === JSON.stringify([G_ONE.title]),
    'a guest may not link, share or copy onto a task somebody else’s clip — refused, saying which clips are theirs, and nothing is made; their own they link and attach',
    `the admin's clip: link ${said(gLinkAdmins)}, share ${said(gShareAdmins)}, task copy ${said(gAttachAdmins)}; ` +
      `their own: link ${said(gLinkOwn)}, task copy ${said(gAttachOwn)}; the task holds ${JSON.stringify(onTaskNames)}`,
  )

  // ══ 10. CLIPS STORED BEFORE A CLIP CARRIED ITS RECORDER'S ID ═════════════
  /*
   * Every clip stored before this rule names its recorder by address alone;
   * the id came with the rule. Such a clip is its recorder's by the address
   * their account holds — in the library, search, a link and a delete alike
   * (`clips/clip-reader.ts`) — and nobody else's.
   */
  console.log('\n▶ clips stored before a clip carried its recorder’s id: the library, search, a link and deletes')
  const A_OLD = await record(memberA.as, 'membera-old', { fromBefore: true })
  const G_OLD = await record(guest.as, 'guests-old', { fromBefore: true })
  const aOld = (await listed(memberA.as)).clips.find((c) => c.storageKey === A_OLD.key)
  const storedAs = aOld?.url
    ? await fetch(aOld.url).then((r) => ({ by: r.headers.get('x-amz-meta-recordedby'), byId: r.headers.get('x-amz-meta-recordedbyid') }), () => null)
    : null
  const bSeesAOld = (await listed(memberB.as)).clips.find((c) => c.storageKey === A_OLD.key)
  const gLists = (await listed(guest.as)).clips
  const gOld = gLists.find((c) => c.storageKey === G_OLD.key)
  const gSeesAOld = gLists.some((c) => c.storageKey === A_OLD.key)
  const gFindsOld = await clipHits(guest.as, 'guests-old')
  const gLinkOld = await guest.as(`/workspaces/${WS}/clips/link`, { method: 'POST', body: { storageKey: G_OLD.key } })
  const bDelAOld = await memberB.as(`/workspaces/${WS}/clips`, { method: 'DELETE', body: { storageKey: A_OLD.key } })
  const aOldKept = await adminLists(A_OLD.key)
  const aDelAOld = await memberA.as(`/workspaces/${WS}/clips`, { method: 'DELETE', body: { storageKey: A_OLD.key } })
  const gDelGOld = await guest.as(`/workspaces/${WS}/clips`, { method: 'DELETE', body: { storageKey: G_OLD.key } })
  const [aOldGone, gOldGone] = [!(await adminLists(A_OLD.key)), !(await adminLists(G_OLD.key))]
  chk(
    storedAs?.by === memberA.email && storedAs?.byId === null &&
      aOld?.mayDelete === true && bSeesAOld?.mayDelete === false && gOld?.mayDelete === true && !gSeesAOld &&
      gFindsOld.ids.includes(`file-${G_OLD.key}`) && gLinkOld.ok &&
      bDelAOld.status === 403 && bDelAOld.error?.message === REFUSAL && aOldKept &&
      aDelAOld.ok && aOldGone && gDelGOld.ok && gOldGone,
    'a clip stored before clips carried their recorder’s id is its recorder’s by their address — listed with Delete, found, linked and deleted by them — and nobody else’s',
    `stored as ${JSON.stringify(storedAs)}; member A's: listed to them ${aOld ? `with Delete ${aOld.mayDelete}` : 'NOT'}, ` +
      `to member B ${bSeesAOld ? `with Delete ${bSeesAOld.mayDelete}` : 'NOT'}, to the guest ${gSeesAOld ? 'TOO' : 'not'}; ` +
      `member B's delete ${said(bDelAOld)}, ${aOldKept ? 'kept' : 'GONE'}; member A's ${said(aDelAOld)}, ${aOldGone ? 'gone' : 'kept'}; ` +
      `the guest's: listed ${gOld ? `with Delete ${gOld.mayDelete}` : 'NOT'}, found ${gFindsOld.ids.includes(`file-${G_OLD.key}`)}, ` +
      `link ${said(gLinkOld)}, delete ${said(gDelGOld)}, ${gOldGone ? 'gone' : 'kept'}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (WS && A) {
    // The clips are the store's, not a table's: each goes by its own DELETE. Gone, or already gone (404), is fine.
    for (const storageKey of keys) {
      const gone = await A(`/workspaces/${WS}/clips`, { method: 'DELETE', body: { storageKey } })
      if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: clip ${storageKey} answered ${gone.status || 'nothing'}`)
    }
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  // Only now: the DELETEs above go through this proxy, and a closed one refuses them.
  stack.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
