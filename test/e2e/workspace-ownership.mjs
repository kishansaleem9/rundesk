/**
 * A WORKSPACE HAS AN OWNER, WHO HANDS IT OVER OR DELETES IT, AND EVERYBODY ELSE
 * LEAVES IT — Settings › General and Profile › Workspaces as ClickUp has them.
 *
 * NOT A FRAME ROW: the QA sheet of 2 November (Hamda) and her recording of
 * ClickUp's settings beside Rundesk's. WS-002 the name's rules, WS-004 one
 * workspace's task not reached from another, WS-005 to WS-008 the name and the
 * avatar where they can be found, WS-010 several invitations at once, WS-015 a
 * member leaves, WS-016 the owner cannot until they transfer, WS-017 transfer,
 * WS-018 delete, WS-019 its guard. `found-02-nov/workspace-has-no-owner` and
 * the rows beside it in `docs/open-work.md`.
 *
 *   node test/e2e/workspace-ownership.mjs --api 3027 --dist /tmp/claude-0/dist-7
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 13

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? res.message ?? null)}`

const stamp = Date.now()
const TAG = `wso${stamp}`
const PASSWORD = 'OwnerTransfers@12345!'
/* A one-pixel PNG: the avatar's upload, through the page's own file input. */
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARgwMDAwMAA8IAWYAAAAASUVORK5CYII=', 'base64')
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`. */
const apiAs = apiAsAt(API)
let browser = null
let sql = null
const archiveAtEnd = []

try {
  sql = await openDb()
  const person = async (key) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const s = await signUpApi(API, { fullName: `Owner ${key}`, email, password: PASSWORD, organizationName: `WSO ${key} ${stamp}`, organizationSlug: `wso-${key}-${stamp}` })
    return { email, id: s.user?.id, api: apiAs(s.accessToken), home: s.workspaces?.[0]?.id ?? null }
  }
  const owner = await person('owner')
  const admin = await person('admin')
  const member = await person('member')
  const guest = await person('guest')
  const outsider = await person('outsider')
  const O = owner.api
  const NAME = `${TAG} Ops`
  const made = await O('/workspaces', { method: 'POST', body: { name: NAME } })
  if (!made.ok || !made.data?.id) throw new Error(`the owner could not make a workspace: ${said(made)}`)
  const WS = made.data.id
  archiveAtEnd.push(WS)
  const made2 = await O('/workspaces', { method: 'POST', body: { name: `${TAG} Two` } })
  if (!made2.ok || !made2.data?.id) throw new Error(`the owner could not make the second workspace: ${said(made2)}`)
  const WS2 = made2.data.id
  const NAME2 = made2.data.name
  archiveAtEnd.push(WS2)
  for (const [who, role, ws] of [[admin, 'workspace_admin', WS], [member, 'member', WS], [guest, 'guest', WS], [member, 'member', WS2]]) {
    const added = await O(`/workspaces/${ws}/members`, { method: 'POST', body: { email: who.email, role } })
    if (!added.ok) throw new Error(`could not add ${who.email} as ${role}: ${said(added)}`)
  }

  browser = await (await resolveChromium()).launch(launchOptions())
  const signIn = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', PASSWORD)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    return page
  }
  const membership = async (ws, who) => (await sql`select role from workspace_members where workspace_id = ${ws} and user_id = ${who.id}`)[0]?.role ?? null
  // Off another workspace's page: the address is /app/<a uuid other than gone>.
  const movedOff = (page, gone) => {
    const m = /\/app\/([0-9a-f-]{36})(?:[/?#]|$)/.exec(page.url())
    return !!m && m[1] !== gone
  }

  // ══ 1. WHOEVER MAKES IT OWNS IT ══════════════════════════════════════════
  console.log('\n▶ the owner, as the row, the workspace and the list say it')
  const [{ owner_id: recorded }] = await sql`select owner_id from workspaces where id = ${WS}`
  const asOwner = await O(`/workspaces/${WS}`)
  const asAdmin = await admin.api(`/workspaces/${WS}`)
  const listedRow = ((await O('/workspaces')).data ?? []).find((r) => r.workspace?.id === WS)
  chk(
    recorded === owner.id && asOwner.data?.isOwner === true && asOwner.data?.actsAsOwner === true &&
      asAdmin.data?.isOwner === false && asAdmin.data?.actsAsOwner === false && listedRow?.isOwner === true && listedRow?.memberCount === 4,
    'whoever makes a workspace owns it: its row names them, it reads as theirs to them and not to its admin, and their list says so, with its four people',
    `owner_id ${recorded === owner.id ? 'theirs' : recorded}; to the owner ${asOwner.data?.isOwner}/${asOwner.data?.actsAsOwner}; to the admin ${asAdmin.data?.isOwner}/${asAdmin.data?.actsAsOwner}; listed ${JSON.stringify({ isOwner: listedRow?.isOwner, memberCount: listedRow?.memberCount })}`,
  )

  // ══ 2. THE NAME'S RULES, AS THE API KEEPS THEM (WS-002) ══════════════════
  console.log('\n▶ names: blank, too long, emoji, a rename with spaces around it')
  const blank = await O('/workspaces', { method: 'POST', body: { name: '   ​ ' } })
  const tooLong = await O('/workspaces', { method: 'POST', body: { name: 'x'.repeat(61) } })
  const emoji = await O('/workspaces', { method: 'POST', body: { name: '🚀'.repeat(60) } })
  if (emoji.data?.id) archiveAtEnd.push(emoji.data.id)
  const emojiStored = emoji.data?.id ? (await sql`select name from workspaces where id = ${emoji.data.id}`)[0]?.name : null
  const renameBlank = await O(`/workspaces/${WS}`, { method: 'PATCH', body: { name: '   ' } })
  const renameLong = await O(`/workspaces/${WS}`, { method: 'PATCH', body: { name: 'y'.repeat(100) } })
  const afterRefusals = (await sql`select name from workspaces where id = ${WS}`)[0]?.name
  const renamed = await O(`/workspaces/${WS}`, { method: 'PATCH', body: { name: `  ${NAME} \n  2 🚀  ` } })
  const renamedStored = (await sql`select name from workspaces where id = ${WS}`)[0]?.name
  const back = await O(`/workspaces/${WS}`, { method: 'PATCH', body: { name: NAME } })
  chk(
    blank.status === 400 && tooLong.status === 400 && emoji.ok && emojiStored === '🚀'.repeat(60) &&
      renameBlank.status === 400 && renameLong.status === 400 && afterRefusals === NAME && renamed.ok && renamedStored === `${NAME} 2 🚀` && back.ok,
    'a workspace is refused a blank name and one past 60 characters, made with 60 emoji, and a rename keeps its rule — trimmed, its inner whitespace folded, the old name kept when refused',
    `blank ${said(blank)}; 61 ${said(tooLong)}; 60 emoji ${said(emoji)} stored ${JSON.stringify(emojiStored)}; rename blank ${renameBlank.status}, long ${renameLong.status}, name after ${JSON.stringify(afterRefusals)}; renamed ${renamed.status} to ${JSON.stringify(renamedStored)}`,
  )

  // ══ 3. THE NAME IN THE FORM (WS-002, WS-005) ═════════════════════════════
  console.log('\n▶ Settings › General: the name, first, saying what is wrong before it is sent')
  const op = await signIn(owner)
  await op.goto(`${B}/app/${WS}/settings`, { waitUntil: 'domcontentloaded' })
  const nameBox = op.locator('#name')
  const generalFirst = await waitUntil(() => nameBox.isVisible().catch(() => false), { timeoutMs: 20_000 })
  const hint = op.getByTestId('settings-name-hint').filter({ visible: true })
  const nameSave = op.getByTestId('settings-name-save')
  await nameBox.fill('   ').catch(() => {})
  const blankSays = await hint.innerText().catch(() => '')
  const blankOff = await nameSave.isDisabled().catch(() => false)
  await nameBox.fill('z'.repeat(61)).catch(() => {})
  const longSays = await hint.innerText().catch(() => '')
  const longOff = await nameSave.isDisabled().catch(() => false)
  await nameBox.fill(`  ${TAG} Ops 🚀 `).catch(() => {})
  const goodSays = await hint.innerText().catch(() => '')
  await nameSave.click({ timeout: 5000 }).catch(() => {})
  const savedName = await waitUntil(async () => (await sql`select name from workspaces where id = ${WS}`)[0]?.name === `${TAG} Ops 🚀`, { timeoutMs: 10_000 })
  // Its avatar, beside it: the General card holds both, above the plan and the billing.
  const avatarInGeneral = await op.getByTestId('settings-general').getByTestId('settings-avatar').count()
  await O(`/workspaces/${WS}`, { method: 'PATCH', body: { name: NAME } })
  chk(
    generalFirst && avatarInGeneral === 1 && /blank|only spaces/i.test(blankSays) && blankOff && /at most 60/i.test(longSays) && longOff && /of 60 characters/i.test(goodSays) && savedName,
    'Settings › General opens on the workspace’s avatar and name, says a blank name and one past 60 characters are wrong with Save off, counts a good one, and saves it trimmed',
    `name box ${generalFirst}; avatar in General ${avatarInGeneral}; blank says ${JSON.stringify(blankSays)} (save off ${blankOff}); long says ${JSON.stringify(longSays)} (off ${longOff}); good says ${JSON.stringify(goodSays)}; saved ${savedName}`,
  )

  // ══ 4. NOBODY REMOVES OR DEMOTES THE OWNER ═══════════════════════════════
  console.log('\n▶ the owner’s place, from an admin')
  const removeOwner = await admin.api(`/workspaces/${WS}/members/${owner.id}`, { method: 'DELETE' })
  const demoteOwner = await admin.api(`/workspaces/${WS}/members/${owner.id}`, { method: 'PATCH', body: { role: 'member' } })
  const ownerRole = await membership(WS, owner)
  chk(
    removeOwner.status === 400 && demoteOwner.status === 400 && ownerRole === 'workspace_admin',
    'an admin can neither remove the owner nor make them anything but an admin',
    `remove ${said(removeOwner)}; demote ${said(demoteOwner)}; the owner is ${ownerRole}`,
  )

  // ══ 5. THE OWNER CANNOT LEAVE (WS-016) ═══════════════════════════════════
  console.log('\n▶ leaving: the owner, and somebody who is not in it')
  const ownerLeaves = await O(`/workspaces/${WS}/leave`, { method: 'POST' })
  const outsiderLeaves = await outsider.api(`/workspaces/${WS}/leave`, { method: 'POST' })
  const ownerStays = await membership(WS, owner)
  chk(
    ownerLeaves.status === 409 && /transfer/i.test(ownerLeaves.error?.message ?? '') && ownerStays === 'workspace_admin' && outsiderLeaves.status === 404,
    'the owner is refused leaving with the reason — transfer its ownership first — and stays; somebody not in it finds nothing to leave',
    `owner ${said(ownerLeaves)}, still ${ownerStays}; outsider ${said(outsiderLeaves)}`,
  )

  // ══ 6. TRANSFER IS THE OWNER'S, TO A MEMBER, WITH THE NAME (WS-017) ══════
  console.log('\n▶ transfer, refused')
  const byAdmin = await admin.api(`/workspaces/${WS}/transfer-ownership`, { method: 'POST', body: { userId: admin.id, confirmName: NAME } })
  const toGuest = await O(`/workspaces/${WS}/transfer-ownership`, { method: 'POST', body: { userId: guest.id, confirmName: NAME } })
  const wrongName = await O(`/workspaces/${WS}/transfer-ownership`, { method: 'POST', body: { userId: admin.id, confirmName: NAME.toLowerCase() } })
  const toStranger = await O(`/workspaces/${WS}/transfer-ownership`, { method: 'POST', body: { userId: outsider.id, confirmName: NAME } })
  const [{ owner_id: stillOwner }] = await sql`select owner_id from workspaces where id = ${WS}`
  chk(
    byAdmin.status === 403 && toGuest.status === 400 && wrongName.status === 400 && toStranger.status === 400 && stillOwner === owner.id,
    'transferring is refused to an admin who does not own it, to a guest, to somebody not in it, and with the name typed wrong — and the owner stays the owner',
    `admin ${said(byAdmin)}; guest ${said(toGuest)}; wrong name ${said(wrongName)}; stranger ${said(toStranger)}; owner ${stillOwner === owner.id ? 'unchanged' : stillOwner}`,
  )

  // ══ 7. TRANSFER IN THE DANGER ZONE ═══════════════════════════════════════
  console.log('\n▶ the owner transfers it to the admin from Settings › General')
  await op.goto(`${B}/app/${WS}/settings`, { waitUntil: 'domcontentloaded' })
  await op.getByTestId('settings-transfer-ownership').click({ timeout: 20_000 }).catch(() => {})
  const transferGo = op.getByTestId('transfer-owner-confirm')
  const transferOpen = await waitUntil(() => transferGo.isVisible().catch(() => false), { timeoutMs: 10_000 })
  const offAtFirst = transferOpen ? await transferGo.isDisabled().catch(() => false) : false
  // Who is offered, by id: the guest must not be among them.
  const offeredIds = await op.getByTestId('transfer-owner-pick').locator('option').evaluateAll((os) => os.map((o) => o.value)).catch(() => [])
  await op.getByTestId('transfer-owner-pick').selectOption(admin.id, { timeout: 5000 }).catch(() => {})
  const offPickedOnly = transferOpen ? await transferGo.isDisabled().catch(() => false) : false
  await op.getByTestId('transfer-owner-name').fill(NAME, { timeout: 5000 }).catch(() => {})
  const onBoth = transferOpen ? await transferGo.isEnabled().catch(() => false) : false
  await transferGo.click({ timeout: 5000 }).catch(() => {})
  const transferred = await waitUntil(async () => (await sql`select owner_id from workspaces where id = ${WS}`)[0]?.owner_id === admin.id, { timeoutMs: 15_000 })
  const newOwnerRole = await membership(WS, admin)
  const oldOwnerRole = await membership(WS, owner)
  const [{ n: transferRecorded }] = await sql`select count(*)::int as n from audit_logs where action = 'workspace.ownership_transferred' and resource_id = ${WS}`
  const guestOffered = offeredIds.includes(guest.id)
  chk(
    transferOpen && offAtFirst && offPickedOnly && onBoth && !guestOffered && transferred && newOwnerRole === 'workspace_admin' && oldOwnerRole === 'workspace_admin' && transferRecorded === 1,
    'Transfer ownership offers the members who may own it, stays off until one is picked and the name typed exactly, and hands it over: the admin owns it, the previous owner stays an admin, and it is recorded',
    `dialog ${transferOpen}; off at first ${offAtFirst}, picked only ${offPickedOnly}, on with both ${onBoth}; a guest offered ${guestOffered}; owner now ${transferred ? 'the admin' : 'unchanged'}; roles new ${newOwnerRole}, old ${oldOwnerRole}; recorded ${transferRecorded}`,
  )

  // ══ 8. THE PREVIOUS OWNER LEAVES, FROM PROFILE › WORKSPACES (WS-015) ═════
  console.log('\n▶ Profile › Workspaces: Leave, as the owner of one and no longer the owner of another')
  await op.goto(`${B}/app/profile?tab=workspaces`, { waitUntil: 'domcontentloaded' })
  const row = op.getByTestId(`profile-workspace-${WS}`)
  await waitUntil(() => row.isVisible().catch(() => false), { timeoutMs: 20_000 })
  const badgeGone = (await op.getByTestId(`profile-workspace-owner-${WS}`).count()) === 0
  const stillOwnsTwo = (await op.getByTestId(`profile-workspace-owner-${WS2}`).count()) === 1
  // Their own: Leave says to transfer it first, and nothing leaves.
  await op.getByTestId(`profile-workspace-leave-${WS2}`).click({ timeout: 5000 }).catch(() => {})
  const toldToTransfer = await waitUntil(() => op.getByTestId('leave-workspace-owner').isVisible().catch(() => false), { timeoutMs: 8000 })
  await op.keyboard.press('Escape').catch(() => {})
  const stillInTwo = await membership(WS2, owner)
  // No longer theirs: Leave asks, and leaves.
  await op.getByTestId(`profile-workspace-leave-${WS}`).click({ timeout: 5000 }).catch(() => {})
  await op.getByTestId('leave-workspace-confirm').click({ timeout: 8000 }).catch(() => {})
  const left = await waitUntil(async () => (await membership(WS, owner)) === null, { timeoutMs: 15_000 })
  const movedAfterLeaving = await waitUntil(() => movedOff(op, WS), { timeoutMs: 15_000 })
  const [{ n: leaveRecorded }] = await sql`select count(*)::int as n from audit_logs where action = 'member.left' and workspace_id = ${WS} and actor_id = ${owner.id}`
  chk(
    badgeGone && stillOwnsTwo && toldToTransfer && stillInTwo === 'workspace_admin' && left && movedAfterLeaving && leaveRecorded === 1,
    'Profile › Workspaces marks only what is still theirs as Owner; Leave on it says to transfer it first and leaves nothing; Leave on the other leaves it, recorded, and goes to another workspace',
    `badge gone ${badgeGone}; still owns the second ${stillOwnsTwo}; told to transfer ${toldToTransfer}, still in it ${stillInTwo}; left ${left}; now at ${op.url()}; recorded ${leaveRecorded}`,
  )

  // ══ 9. DELETE, ITS GUARD, AND WHERE IT LEAVES YOU (WS-018, WS-019) ═══════
  console.log('\n▶ the new owner deletes it from Settings › General; a member may not')
  const memberDeletes = await member.api(`/workspaces/${WS}`, { method: 'DELETE' })
  const ap = await signIn(admin)
  await ap.goto(`${B}/app/${WS}/settings`, { waitUntil: 'domcontentloaded' })
  await ap.getByTestId('settings-delete-workspace').click({ timeout: 20_000 }).catch(() => {})
  const deleteGo = ap.getByTestId('delete-workspace-confirm')
  const deleteOpen = await waitUntil(() => deleteGo.isVisible().catch(() => false), { timeoutMs: 10_000 })
  const offEmpty = deleteOpen ? await deleteGo.isDisabled().catch(() => false) : false
  await ap.getByTestId('delete-workspace-name').fill(NAME.slice(0, -1), { timeout: 5000 }).catch(() => {})
  const offPartial = deleteOpen ? await deleteGo.isDisabled().catch(() => false) : false
  await ap.getByTestId('delete-workspace-name').fill(`${NAME} `, { timeout: 5000 }).catch(() => {})
  const offSpaced = deleteOpen ? await deleteGo.isDisabled().catch(() => false) : false
  await ap.getByTestId('delete-workspace-name').fill(NAME, { timeout: 5000 }).catch(() => {})
  const onExact = deleteOpen ? await deleteGo.isEnabled().catch(() => false) : false
  await deleteGo.click({ timeout: 5000 }).catch(() => {})
  const archived = await waitUntil(async () => (await sql`select is_archived from workspaces where id = ${WS}`)[0]?.is_archived === true, { timeoutMs: 15_000 })
  const movedAfterDeleting = await waitUntil(() => movedOff(ap, WS), { timeoutMs: 15_000 })
  chk(
    memberDeletes.status === 403 && deleteOpen && offEmpty && offPartial && offSpaced && onExact && archived && movedAfterDeleting,
    'Delete workspace is its owner’s: a member is refused, and the dialog’s button stays off until the name is typed exactly, then deletes it and goes to another workspace',
    `member ${said(memberDeletes)}; dialog ${deleteOpen}; off empty ${offEmpty}, partial ${offPartial}, spaced ${offSpaced}; on exact ${onExact}; archived ${archived}; now at ${ap.url()}`,
  )

  // ══ 10. ITS MEMBERS LOSE IT AT ONCE; ITS OWNER CAN BRING IT BACK ═════════
  console.log('\n▶ after deleting: a member, the owner’s Archived list, a restore')
  const guestReads = await guest.api(`/workspaces/${WS}`)
  const guestSpaces = await guest.api(`/spaces/workspace/${WS}`)
  const guestLists = ((await guest.api('/workspaces')).data ?? []).some((r) => r.workspace?.id === WS)
  const archivedRow = ((await admin.api('/workspaces/archived')).data ?? []).find((r) => r.workspace?.id === WS)
  const restored = await admin.api(`/workspaces/${WS}/restore`, { method: 'POST' })
  const guestBack = await guest.api(`/workspaces/${WS}`)
  chk(
    guestReads.status === 404 && guestSpaces.status === 404 && !guestLists && archivedRow?.mayDeleteForGood === true && restored.ok && guestBack.ok,
    'a deleted workspace is gone for its members at once — not opened, not listed, its spaces not read — and its owner finds it under Archived, may delete it for good there, and can restore it',
    `guest reads ${guestReads.status}, its spaces ${guestSpaces.status}, listed ${guestLists}; archived row ${JSON.stringify(archivedRow ? { mayDeleteForGood: archivedRow.mayDeleteForGood } : null)}; restore ${said(restored)}; guest after ${guestBack.status}`,
  )

  // ══ 11. SEVERAL INVITATIONS AT ONCE (WS-010) ═════════════════════════════
  console.log('\n▶ People: three addresses, a word, a domain with no dot and somebody already in it, pasted at once')
  const invA = `${TAG}-a@rundesk.invalid`
  const invB = `${TAG}-b@rundesk.invalid`
  const noDot = `${TAG}-c@nodot`
  await op.goto(`${B}/app/${WS2}/settings?tab=members`, { waitUntil: 'domcontentloaded' })
  const box = op.getByTestId('settings-invite-emails')
  await waitUntil(() => box.isVisible().catch(() => false), { timeoutMs: 20_000 })
  await box.fill(`${invA}, not-an-email ${invB}\n${noDot}; ${member.email}`).catch(() => {})
  await op.getByRole('button', { name: /^Invite$/ }).click({ timeout: 5000 }).catch(() => {})
  const problems = op.getByTestId('settings-invite-problem').filter({ visible: true })
  await waitUntil(async () => (await problems.count()) === 3, { timeoutMs: 15_000 })
  const flagged = await problems.allInnerTexts().catch(() => [])
  const [{ n: invited }] = await sql`select count(*)::int as n from invitations where lower(email) in (${invA}, ${invB}) and workspace_memberships::text like ${'%' + WS2 + '%'}`
  const [{ n: junk }] = await sql`select count(*)::int as n from invitations where email in ('not-an-email', ${noDot.toLowerCase()})`
  const leftInBox = await box.inputValue().catch(() => '')
  // And the API itself, whatever sends to it: a word is no address, and nobody is invited where they are.
  const apiWord = await O('/invitations', { method: 'POST', body: { email: 'not-an-email', workspaceId: WS2, role: 'member' } })
  const apiMember = await O('/invitations', { method: 'POST', body: { email: member.email.toUpperCase(), workspaceId: WS2, role: 'member' } })
  chk(
    apiWord.status === 400 && apiMember.status === 409 && invited === 2 && junk === 0 && flagged.length === 3 &&
      flagged.some((f) => f.includes('not-an-email')) && flagged.some((f) => f.includes(noDot)) && flagged.some((f) => f.includes(member.email) && /already a member/i.test(f)) &&
      !leftInBox.includes(invA) && leftInBox.includes('not-an-email'),
    'pasted at once, separated by commas, spaces and lines, the two good addresses are invited, and a word, an address with no dot and somebody already in it are each flagged on their own and left in the box — and the API refuses the word and the member itself',
    `the API: a word ${said(apiWord)}, a member ${said(apiMember)}; invited ${invited}; junk rows ${junk}; flagged ${JSON.stringify(flagged)}; left in the box ${JSON.stringify(leftInBox)}`,
  )

  // ══ 12. THE AVATAR: A COLOUR, A PICTURE, A WRONG FILE, REMOVED (WS-006–008) ═
  console.log('\n▶ the avatar: a colour, a picture, a text file, then no picture')
  await op.goto(`${B}/app/${WS2}/settings`, { waitUntil: 'domcontentloaded' })
  const avatar = op.getByTestId('settings-avatar')
  await waitUntil(() => avatar.isVisible().catch(() => false), { timeoutMs: 20_000 })
  // The upload is offered where it is seen, beside the avatar, under the words it always had.
  const uploadShown = await op.getByTestId('settings-logo').getByRole('button', { name: /Upload logo/ }).isVisible().catch(() => false)
  await avatar.click().catch(() => {})
  await op.getByTestId('settings-avatar-color-059669').click({ timeout: 5000 }).catch(() => {})
  const coloured = await waitUntil(async () => (await sql`select primary_color from workspaces where id = ${WS2}`)[0]?.primary_color === '#059669', { timeoutMs: 10_000 })
  await op.keyboard.press('Escape').catch(() => {})
  await op.setInputFiles('[data-testid="settings-logo-file"]', [{ name: 'logo.png', mimeType: 'image/png', buffer: TINY_PNG }], { timeout: 5000 }).catch(() => {})
  const pictured = await waitUntil(async () => /workspace-logos\//.test((await sql`select logo_url from workspaces where id = ${WS2}`)[0]?.logo_url ?? ''), { timeoutMs: 15_000 })
  const shownPicture = await waitUntil(async () => (await avatar.locator('img').count()) === 1, { timeoutMs: 8000 })
  const logoBefore = (await sql`select logo_url from workspaces where id = ${WS2}`)[0]?.logo_url
  await op.setInputFiles('[data-testid="settings-logo-file"]', [{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture') }], { timeout: 5000 }).catch(() => {})
  const wrongSays = await waitUntil(() => op.getByTestId('settings-logo-error').isVisible().catch(() => false), { timeoutMs: 8000 })
  const logoKept = (await sql`select logo_url from workspaces where id = ${WS2}`)[0]?.logo_url === logoBefore
  await op.getByTestId('settings-avatar-remove').click({ timeout: 5000 }).catch(() => {})
  const unpictured = await waitUntil(async () => (await sql`select logo_url from workspaces where id = ${WS2}`)[0]?.logo_url === null, { timeoutMs: 10_000 })
  const initialShown = await waitUntil(async () => (await avatar.locator('img').count()) === 0 && (await avatar.filter({ visible: true }).innerText().catch(() => '')).trim() === NAME2.charAt(0).toUpperCase(), { timeoutMs: 8000 })
  const initialColour = await avatar.locator('div').first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => '')
  chk(
    uploadShown && coloured && pictured && shownPicture && wrongSays && logoKept && unpictured && initialShown && initialColour === 'rgb(5, 150, 105)',
    'beside the avatar, Upload logo: it takes a colour and a picture as they are chosen, refuses a text file and keeps the picture it had, and once the picture is removed shows the initial on the chosen colour',
    `upload shown ${uploadShown}; colour ${coloured}; picture stored ${pictured}, shown ${shownPicture}; a text file said ${wrongSays}, picture kept ${logoKept}; removed ${unpictured}; initial ${initialShown} on ${JSON.stringify(initialColour)}`,
  )

  // ══ 13. ONE WORKSPACE'S TASK, FROM ANOTHER (WS-004) ══════════════════════
  console.log('\n▶ a task in the second workspace, searched for from the first and opened from it; and by somebody in neither')
  const space = (await O('/spaces', { method: 'POST', body: { workspaceId: WS2, name: `${TAG} space` } })).data?.id
  const project = (await O('/projects', { method: 'POST', body: { spaceId: space, name: `${TAG} project` } })).data?.id
  const list = (await O('/lists', { method: 'POST', body: { projectId: project, name: `${TAG} list` } })).data?.id
  const TITLE = `${TAG} isolated task`
  const task = await O('/tasks', { method: 'POST', body: { listId: list, title: TITLE } })
  if (!task.ok || !task.data?.id) throw new Error(`could not make the task: ${said(task)}`)
  const T = task.data.id
  const HOME = owner.home
  // A search hit names its task as `task-<id>` (`search.service.ts`).
  const isT = (h) => h?.id === `task-${T}`
  const fromHome = await O(`/search/${HOME}?q=${encodeURIComponent(TITLE)}`)
  const fromItsOwn = await O(`/search/${WS2}?q=${encodeURIComponent(TITLE)}`)
  const URL_OF_T = `${B}/app/${WS2}/${space}/${project}/${list}?task=${T}`
  await op.goto(`${B}/app/${HOME}`, { waitUntil: 'domcontentloaded' })
  await op.goto(URL_OF_T, { waitUntil: 'domcontentloaded' })
  const sheet = op.getByTestId('task-sheet').filter({ visible: true }).first()
  const opened = await waitUntil(async () => (await sheet.innerText().catch(() => '')).includes(TITLE), { timeoutMs: 20_000 })
  const switcherSays = await op.getByTestId('workspace-switcher').filter({ visible: true }).innerText().catch(() => '')
  const stayedInItsOwn = op.url().includes(`/app/${WS2}/`)
  const xp = await signIn(outsider)
  const outsiderReads = await outsider.api(`/tasks/${T}`)
  await xp.goto(URL_OF_T, { waitUntil: 'domcontentloaded' })
  await xp.waitForTimeout(4000)
  const outsiderSees = (await xp.locator('body').innerText().catch(() => '')).includes(TITLE)
  chk(
    Array.isArray(fromHome.data) && !fromHome.data.some(isT) && (fromItsOwn.data ?? []).some(isT) &&
      opened && stayedInItsOwn && switcherSays.includes(NAME2) && [403, 404].includes(outsiderReads.status) && !outsiderSees,
    'a workspace’s task is not found by searching another, its address opens it in its own workspace — the switcher saying which — and somebody in neither is refused it and shown nothing of it',
    `search elsewhere ${fromHome.status} hits ${JSON.stringify((fromHome.data ?? []).map((h) => isT(h) ? 'IT' : h.entityType))}, in its own ${(fromItsOwn.data ?? []).some(isT)}; opened ${opened} at ${op.url()}; switcher ${JSON.stringify(switcherSays.slice(0, 60))}; outsider ${outsiderReads.status}, sees it ${outsiderSees}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  // The made-sweep removes what this run made; archiving keeps a lane's lists short until it does.
  if (sql) {
    for (const id of archiveAtEnd) await sql`update workspaces set is_archived = true where id = ${id}`.catch(() => {})
  }
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
