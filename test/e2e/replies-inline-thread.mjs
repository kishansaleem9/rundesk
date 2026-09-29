/**
 * §G12-2, frames 277 / 282 — read and answer a thread from the Replies list.
 *
 * > "ek person 90 chats mein hai, 90 groups mein hai … ab us ko har baar chat
 * >  open karne ki zaroorat nahi ke woh dekhe ke is mein reply aaya ya nahi."
 *
 * That is the entire point of the page, and a row that navigates away defeats
 * it: you end up in the channel, which is the thing you came here to avoid.
 *
 * So the check that matters is the last one — the reply reaches the thread
 * WITHOUT the page ever leaving /replies. Everything before it is arranging a
 * real reply notification to answer, which needs two people: a notification is
 * only sent to somebody who did not write the message.
 *
 *   node test/e2e/replies-inline-thread.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran": a selector matching nothing sweeps clean. */
const EXPECTED_CHECKS = 7

const chromium = await resolveChromium()
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const API = `http://127.0.0.1:${API_PORT}/api/v1`

const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}
const PEER = {
  email: process.env.E2E_PEER_EMAIL ?? 'org-admin@rundesk.internal',
  password: process.env.E2E_PEER_PASSWORD ?? 'OrgAdmin@123!',
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

const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}
const loginAs = (who) => signInApi(API, who.email, who.password)

const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())

try {
  const mine = await loginAs(ME)
  const theirs = await loginAs(PEER)
  const A = apiAs(mine.accessToken)
  const B = apiAs(theirs.accessToken)
  const myId = mine.user?.id ?? mine.id
  const theirId = theirs.user?.id ?? theirs.id

  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  const stamp = Date.now()

  /*
   * A channel with both of us in it. Created fresh: an existing one may not
   * contain the peer, and a thread nobody else is in produces no notification —
   * the suite would then look for a row that was never meant to exist.
   */
  const channel = await A(`/workspaces/${workspaceId}/chat/channels`, {
    method: 'POST',
    body: { name: `replies-check-${stamp}`, isPrivate: false },
  })
  const channelId = channel.data?.id
  if (!channelId) throw new Error(`could not make a channel: ${channel.status} ${JSON.stringify(channel.error)}`)
  // `userIds`, a list: sent as `userId` this answered 2xx with `added: 0` and
  // the peer was never in the channel.
  const joined = await A(`/chat/channels/${channelId}/members`, { method: 'POST', body: { userIds: [theirId] } })
  if (joined.status >= 300 || joined.data?.added !== 1) {
    throw new Error(`could not add the teammate to the channel: ${joined.status} ${JSON.stringify(joined.data ?? joined.error)}`)
  }

  // I say something; THEY reply to it. The reply is what notifies me.
  const parent = await A(`/chat/channels/${channelId}/messages`, {
    method: 'POST',
    body: { body: `Parent message ${stamp}` },
  })
  const parentId = parent.data?.id
  const theirReply = await B(`/chat/channels/${channelId}/messages`, {
    method: 'POST',
    body: { body: `Their reply ${stamp}`, parentMessageId: parentId },
  })
  chk(
    !!parentId && !!theirReply.data?.id,
    'a teammate replied in a thread',
    `parent ${parent.status}, reply ${theirReply.status}: ${JSON.stringify(theirReply.error)}`,
  )

  await new Promise((r) => setTimeout(r, 2500))
  const notifs = (await A('/notifications')).data ?? []
  const row = notifs.find(
    (n) => n.type === 'chat_reply' && n.target?.entityId === theirReply.data?.id,
  )
  chk(!!row, 'and it reached my Replies as a reply', `no chat_reply notification for ${theirReply.data?.id}`)

  /*
   * The thread resolves from the REPLY's id. This is the half that was broken:
   * the notification carries the reply, and asking the server for that id used
   * to return the reply as its own parent with nothing under it — a thread that
   * reads as empty, which is the opposite of why you opened it.
   */
  const thread = await A(`/chat/messages/${theirReply.data?.id}/thread`)
  chk(
    thread.data?.parent?.id === parentId,
    'and the thread it opens is rooted at the parent, not at the reply',
    `thread parent was ${thread.data?.parent?.id}, expected ${parentId}`,
  )

  // ── On the page ───────────────────────────────────────────────────────────
  console.log('\n▶ §G12-2 — answering without opening the channel')
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(`${stack.base}/app/${workspaceId}/replies`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)

  const opener = page.getByTestId(`reply-open-thread-${row?.id}`)
  chk(
    await opener.isVisible().catch(() => false),
    'the row offers to open the thread in place',
    'no way to open a thread from the Replies list',
  )
  await opener.click({ timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(3000)

  const parentBlock = (await page.getByTestId('reply-thread-parent').innerText().catch(() => '')).trim()
  chk(
    parentBlock.includes(`Parent message ${stamp}`),
    'and shows the message being replied to',
    `parent block read ${JSON.stringify(parentBlock.slice(0, 80))}`,
  )

  const answer = `Answered from Replies ${stamp}`
  const box = page.locator('[data-testid^="reply-thread-"] textarea, [data-testid^="reply-thread-"] input[type="text"]').first()
  await box.fill(answer)
  await box.press('Enter')
  await page.waitForTimeout(3500)

  /*
   * The whole claim, in one assertion: the answer is in the thread AND the page
   * never left /replies. Checking only the first would pass for a row that
   * navigated to the channel and posted there, which is the defect.
   */
  const after = await A(`/chat/messages/${parentId}/thread`)
  const landed = (after.data?.replies ?? []).some((r) => String(r.body).includes(answer))
  chk(landed, 'the reply reaches the thread', `thread holds ${(after.data?.replies ?? []).length} replies, none of them the answer`)
  chk(
    /\/replies/.test(page.url()),
    'and it never had to open the channel to get there',
    `the page navigated to ${page.url()}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  await browser.close().catch(() => {})
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
