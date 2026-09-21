/**
 * §V2-S07 `| P | Sidebar Direct Messages — exists on the chat page, not the
 * workspace tree |` — the section frames `00:05` and `06:25` draw directly
 * under Channels.
 *
 * WHAT THE FRAMES SHOW, top to bottom in the tree pane: **Channels** over
 * `# General - Leo` · `# Welcome` · `+ Add Channel`, then **Direct Messages**
 * over `suleman` · `Hamda Tahir — You` · `+ New message`. Two headings, two
 * lists, two different creation gestures. `[06:21]`: *"yahan saari chats show
 * hoti hain — yeh group communication channels, DIRECT MESSAGES, aur SPACES."*
 * Named in the same sentence as its sibling.
 *
 * WHAT WAS ACTUALLY WRONG. The data was all there and the surface was not.
 * `chat_channels.is_dm` is a real column, `GET …/chat/channels` returns both
 * kinds behind it, and `workspace-chat-page.tsx` has split `publicChannels`
 * from `dmChannels` since it was written. The workspace tree rendered no chat
 * list at all until the Channels section was added — and that section
 * deliberately filters DMs OUT, because `+ Add Channel` takes a name and
 * `+ New message` takes a person, so one button cannot be both. Filtering them
 * out without giving them a home left them reachable only from the chat page,
 * which you had to already be on to see that you had any.
 *
 * THIS SUITE AND `sidebar-sections.mjs` ARE COMPLEMENTS, not duplicates. That
 * one asserts the Channels section draws EXACTLY the server's public-channel
 * count and that no DM appears among them, against a DM that really exists.
 * Adding this section makes that check sharper rather than obsolete: a DM must
 * still not be under Channels, and must now be somewhere. Both are asserted
 * here too, against the same real DM, so neither section can quietly swallow
 * the other's rows.
 *
 * ITS OWN FIXTURES: tagged public channels, and the DM this run starts through
 * the button under test. Counts are compared against the server's own answer
 * for this workspace rather than against a number this file chose.
 *
 *   node test/e2e/sidebar-dms.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a branch that skipped is a failure. */
const EXPECTED_CHECKS = 14

const REPO = path.resolve(import.meta.dirname, '../..')
const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'

const results = []
const ok = (m) => { results.push(1); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push(0); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg ?? good))

const chromium = await resolveChromium()
let stack = null
let B = (process.env.BASE ?? '').replace(/\/$/, '')
if (!B) {
  stack = await startLocalStack({
    dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')),
    apiPort: Number(argOf('--api', process.env.E2E_API_PORT ?? 3011)),
  })
  B = stack.base
}

const TAG = `e2e-dm-${Date.now()}`

let browser = null
let ctx = null
let sql = null
/*
 * Hoisted so the cleanup deletes EXACTLY the DM this run started. A DM carries
 * a generated `dm-xxxxxxxx-yyyyyyyy` name with no tag in it, so the only honest
 * filter is the id — "every DM made in the last hour" would reach into whatever
 * else is running against the shared database.
 */
let startedDmId = null

try {
  const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
  const api = apiClient(`${B}/api/v1`, auth.accessToken)
  const ME = auth.user?.id ?? auth.id

  const wsRes = await api('/workspaces')
  // The fixture's apiClient NEVER THROWS — it answers {status, data, error} —
  // so every call here is read off `status` rather than wrapped in a catch.
  if (wsRes.status >= 300) throw new Error(`GET /workspaces answered ${wsRes.status}`)
  const WS = ((wsRes.data ?? [])[0]?.workspace ?? (wsRes.data ?? [])[0])?.id
  if (!WS) throw new Error('this account can see no workspace')

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the started DM is deleted by id afterwards')

  const membersRes = await api(`/workspaces/${WS}/members`)
  if (membersRes.status >= 300) throw new Error(`GET members answered ${membersRes.status}`)
  const members = Array.isArray(membersRes.data) ? membersRes.data : []
  const peer = members.find((m) => m.userId && m.userId !== ME)
  if (!peer) {
    /*
     * REFUSE TO RUN rather than skip. Every check below is about a DM with
     * somebody, and a workspace of one person makes all of them pass while
     * proving nothing — the vacuous-pass shape this audit keeps finding.
     */
    throw new Error('this workspace has nobody else in it, so a DM cannot exist — every check here would pass vacuously')
  }

  /*
   * A SECOND DM, SEEDED, AND THE REASON IS A BREAK PATCH THAT DID NOT REDDEN.
   *
   * `sidebar-dms-7-count-is-a-constant` replaces the section's `data-count`
   * with the literal `1` — a count that can only ever say one thing, which is
   * the facade in miniature. It came back 14 passed, 0 failed, because this
   * run had exactly ONE direct message and a constant 1 is indistinguishable
   * from a correct 1.
   *
   * The guard below already refused a workspace with NO DM, on the grounds
   * that every check would pass vacuously. One is the same problem one step
   * along: it is the only count a hardcoded number is likely to be, so it is
   * the one count that cannot prove a count is computed. Two can.
   *
   * Seeded through `POST …/chat/dms`, which is idempotent — `ensureDmChannel`
   * returns the existing conversation rather than making a second one — so
   * this cannot inflate the number on a re-run.
   */
  /*
   * THE SECOND PEER IS MADE, not looked for. The seed ships two users, so a
   * workspace has two members and there is nobody to have a second
   * conversation with — which is why the count could only ever be 1 and why
   * the patch went unnoticed. `POST /auth/register` makes a user (with a
   * personal workspace of their own, which nothing here touches) and
   * `POST /workspaces/:id/members` puts them in this one; neither leaves
   * anything behind that another suite reads, because the email carries this
   * run's tag.
   */
  let secondPeer = members.find((m) => m.userId && m.userId !== ME && m.userId !== peer.userId)
  if (!secondPeer) {
    const email = `dm-peer-${TAG}@rundesk.internal`
    const made = await api('/auth/register', {
      method: 'POST',
      body: { email, password: 'Peer@12345!', name: `DM peer ${TAG}` },
    })
    if (made.status >= 300) {
      throw new Error(`could not register a second peer: ${made.status} ${JSON.stringify(made.error)}`)
    }
    const added = await api(`/workspaces/${WS}/members`, { method: 'POST', body: { email } })
    if (added.status >= 300) {
      throw new Error(`could not add the second peer to the workspace: ${added.status} ${JSON.stringify(added.error)}`)
    }
    const again = await api(`/workspaces/${WS}/members`)
    secondPeer = (again.data ?? []).find((m) => m.email === email)
    if (!secondPeer?.userId) throw new Error('the second peer was added and did not come back in the member list')
  }
  const seeded = await api(`/workspaces/${WS}/chat/dms`, {
    method: 'POST',
    body: { peerUserId: secondPeer.userId },
  })
  if (seeded.status >= 300) {
    throw new Error(`could not seed a second DM: ${seeded.status} ${JSON.stringify(seeded.error)}`)
  }

  // A couple of tagged PUBLIC channels, so "the DM section holds no channels"
  // is asserted against channels that really exist.
  const myChannels = []
  for (let i = 0; i < 2; i++) {
    const res = await api(`/workspaces/${WS}/chat/channels`, { method: 'POST', body: { name: `chan-${TAG}-${i}` } })
    if (res.status >= 300 || !res.data) throw new Error(`could not make a channel: ${res.status}`)
    myChannels.push(res.data)
  }

  browser = await chromium.launch(launchOptions())
  ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } })
  const page = await ctx.newPage()

  /*
   * Every DM the browser asks for, with its body. "+ New message" creating a
   * conversation and "+ New message" rearranging a list it already had are the
   * same picture from outside, and only the request tells them apart.
   */
  const dmPosts = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/chat\/dms$/.test(new URL(r.url()).pathname)) {
      dmPosts.push(r.postData() ?? '')
    }
  })

  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })

  // ==========================================================================
  console.log('\n▶ §V2-S07 — "+ New message", the gesture Channels cannot make')

  const section = page.getByTestId('sidebar-direct-messages')
  chk(
    await waitUntil(() => section.isVisible().catch(() => false), { timeoutMs: 25_000 }),
    'the workspace tree has a Direct Messages section',
    'no Direct Messages section in the tree — DMs were reachable only from the chat page, and ' +
      'the Channels section filters them out on purpose',
  )

  /*
   * POSITION, not just presence. Both frames stack Direct Messages BELOW
   * Channels, and `[06:21]` says them in that order. A section that exists
   * somewhere in the column is not the section the frame draws.
   */
  const [chanBox, dmBox] = await Promise.all([
    page.getByTestId('sidebar-channels').boundingBox().catch(() => null),
    section.boundingBox().catch(() => null),
  ])
  chk(
    !!chanBox && !!dmBox && dmBox.y > chanBox.y,
    'and it sits below Channels, as both frames stack them',
    `y: channels=${chanBox?.y} directMessages=${dmBox?.y}`,
  )

  const newMessage = page.getByTestId('sidebar-new-message')
  chk(
    await newMessage.isVisible().catch(() => false),
    'with a "+ New message" row of its own',
    'no "+ New message" — the section lists conversations and offers no way to start one, which ' +
      'is the dead half of a feature',
  )

  await newMessage.click({ timeout: 20_000 })
  await page.getByTestId('sidebar-new-message-search').waitFor({ timeout: 20_000 })
  /*
   * "+ New message" TAKES A PERSON. This is the whole reason DMs are a second
   * section rather than rows under Channels: `+ Add Channel` opens a name box,
   * and a name box cannot start a conversation with anybody.
   */
  const peerButton = page.getByTestId(`sidebar-new-message-user-${peer.userId}`)
  chk(
    await waitUntil(() => peerButton.isVisible().catch(() => false), { timeoutMs: 20_000 }),
    'and it offers the workspace roster, not a name box',
    'the picker never listed a colleague this workspace really has',
  )

  await peerButton.click()
  chk(
    await waitUntil(() => dmPosts.some((b) => b.includes(peer.userId)), { timeoutMs: 15_000 }),
    'choosing somebody really starts the conversation — their id left the browser in a POST',
    `no DM POST carried "${peer.userId}". Bodies seen: ${JSON.stringify(dmPosts)} (none = the ` +
      'button opened a conversation the browser already had, or nothing at all)',
  )
  chk(
    await waitUntil(() => /[?&]channel=/.test(page.url()), { timeoutMs: 15_000 }),
    'and it opens that conversation by its id',
    `the address stayed at ${page.url()} — the row navigates somewhere generic`,
  )

  // ==========================================================================
  console.log('\n▶ §V2-S07 — the two sections divide the same list, with nothing lost')

  await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  const listed = await api(`/workspaces/${WS}/chat/channels`)
  if (listed.status >= 300) throw new Error(`GET chat/channels answered ${listed.status}`)
  const all = listed.data ?? []
  const publicIds = all.filter((c) => !c.isDm).map((c) => c.id)
  const dmIds = all.filter((c) => c.isDm).map((c) => c.id)
  startedDmId = all.find((c) => c.isDm && c.dmPeerId === peer.userId)?.id ?? null

  /*
   * TWO, NOT ONE. See the seeding note above: a count check against a single
   * DM cannot tell a computed count from a hardcoded `1`, and a break patch
   * proved exactly that by staying green. The second peer is registered and
   * added if the workspace has nobody spare, so this threshold is always
   * reachable; if it is ever not, refusing is right — the alternative is a
   * green run that proves less than it claims.
   */
  chk(
    dmIds.length >= 2,
    `the server now reports ${dmIds.length} direct message(s) for this account`,
    `the server reports ${dmIds.length} DM(s); at least two are needed, because a count check ` +
      'against one cannot tell a computed count from a hardcoded 1 — which is what ' +
      '`sidebar-dms-7-count-is-a-constant` demonstrated by staying green',
  )

  const dmRows = page.locator('[data-testid^="sidebar-dm-"]')
  chk(
    await waitUntil(async () => (await dmRows.count()) === dmIds.length, { timeoutMs: 25_000 }),
    `the section draws exactly the ${dmIds.length} direct message(s) the server returns`,
    `the tree drew ${await dmRows.count()} rows for ${dmIds.length} DMs — a section that renders ` +
      'everything it is handed passes a lower bound while quietly including the channels',
  )
  chk(
    Number(await section.getAttribute('data-count')) === dmIds.length,
    "and the section's own count agrees with what it drew",
    `data-count said ${await section.getAttribute('data-count')} for ${dmIds.length} DMs`,
  )

  /*
   * NEITHER SECTION SWALLOWS THE OTHER. `sidebar-sections.mjs` already asserts
   * no DM appears under Channels; the mirror of that check has to live here
   * too, or the day somebody folds the two lists together exactly one suite
   * goes red and the other reports the arrangement as correct.
   */
  const channelsUnderDm = (await Promise.all(
    publicIds.map((id) => page.getByTestId(`sidebar-dm-${id}`).count()),
  )).every((n) => n === 0)
  chk(
    publicIds.length > 0 && channelsUnderDm,
    `and none of the ${publicIds.length} public channels, which have their own section`,
    publicIds.length === 0
      ? 'no public channel exists to prove the exclusion with — this check would pass vacuously'
      : 'a public channel was drawn in the Direct Messages section',
  )
  const dmsUnderChannels = (await Promise.all(
    dmIds.map((id) => page.getByTestId(`sidebar-channel-${id}`).count()),
  )).every((n) => n === 0)
  chk(
    dmsUnderChannels,
    'and the Channels section still holds none of the direct messages',
    'a direct message appeared under Channels — the sections are one list with two headings',
  )

  // ==========================================================================
  console.log('\n▶ §V2-S07 — a row is a person, and it opens their conversation')

  chk(
    !!startedDmId,
    'the DM this run started is in the list the server returns',
    `no DM with peer ${peer.userId} came back — ${JSON.stringify(all.filter((c) => c.isDm).map((c) => c.dmPeerId))}`,
  )

  const expectedName = peer.displayName || peer.email || ''
  const rowText = await page
    .getByTestId(`sidebar-dm-${startedDmId}`)
    .textContent()
    .catch(() => '')
  chk(
    !!expectedName && (rowText ?? '').includes(expectedName),
    'and its row is labelled with the other person, not with the channel row',
    `the row read "${rowText}" where "${expectedName}" was expected — a DM named \`dm-1a2b3c4d-…\` ` +
      'is the generated channel name leaking through, which is what happens when `dmLabel` is ignored',
  )

  await page.getByTestId(`sidebar-dm-${startedDmId}`).click({ timeout: 20_000 })
  chk(
    await waitUntil(() => page.url().includes(`channel=${startedDmId}`), { timeoutMs: 15_000 }),
    'clicking it opens that conversation, by its id',
    `clicking the row left the address at ${page.url()}`,
  )
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  /*
   * Only this run's rows. The channels carry the tag; the DM does not, so it
   * goes by the id this run recorded. Its members and messages cascade with it.
   */
  if (sql) {
    if (startedDmId) await sql`delete from chat_channels where id = ${startedDmId}`.catch(() => {})
    await sql`delete from chat_channels where name like ${'%' + TAG + '%'}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  await ctx?.close().catch(() => {})
  await browser?.close().catch(() => {})
}

const failed = () => results.filter((x) => !x).length
if (results.length !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${results.length} checks, expected ${EXPECTED_CHECKS}`)
  results.push(0)
}
console.log(`\n${results.length - failed()} passed, ${failed()} failed`)
await stack?.close?.()
process.exit(failed() ? 1 : 0)
