/**
 * WHAT IS MADE ONCE IS MADE ONCE, HOWEVER MANY ASK FOR IT AT THE SAME TIME.
 *
 * NOT A FRAME ROW: two races found on lane 4, reproducing
 * `found-7-oct/first-use-rows-counted-as-left` with CI's fresh database made
 * by hand for `syncup-live`.
 *
 * `found-7-oct/two-first-listings-make-two-generals`. A new workspace's
 * channels listed twice at once each found no #general and each made one, six
 * times in six on lane 4. Here three new workspaces each have their channels
 * listed four times at once — one workspace listed three times once came
 * through with one — and each must have one #general (read by SQL).
 *
 * `found-7-oct/a-call-ended-twice-keeps-two-records`. An end that came while
 * the first end was still writing the call's record took the first for an end
 * that died, and wrote a second record. Where a model answers, its notes are
 * held back a second and a half (the model stub's `delayMs`), as a real
 * model's take seconds, and the call is ended again 300 ms after the first
 * end; where none does, the second end follows at once. The call must keep
 * one record, the one it points at, and the second end must be told the
 * record is coming, or given that one.
 *
 *   node test/e2e/made-once.mjs --api 3021
 */
import { signInApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt, must } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 3

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const MODEL = `http://127.0.0.1:${argOf('--model', process.env.E2E_MODEL_PORT ?? String(9200 + (API_PORT - 3020)))}`
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

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/*
 * The model's next answer, held back `ms` — true where a model answers and took
 * the staging, null where there is none to ask. Reset first: a staging left
 * armed by an earlier run would answer this one's first question.
 */
const holdNextAnswer = async (ms) => {
  // Nothing answering at the stub's address is a lane with no model: nothing to hold.
  const reset = await fetch(`${MODEL}/__control/reset`, { method: 'POST' }).catch(() => null)
  if (!reset?.ok) return null
  const staged = await fetch(`${MODEL}/__control/next`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ delayMs: ms, text: '## Summary\nThe release ships on Friday.' }),
  }).catch(() => null)
  return staged?.ok ? true : null
}

const stamp = Date.now()
const TAG = `mo${stamp}`
let sql = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what was made is read by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(auth.accessToken)
  const WS = must(await A('/workspaces', { method: 'POST', body: { name: TAG } }), 'make the workspace').id
  const generals = async (ws) => (await sql`select count(*)::int as n from chat_channels where workspace_id = ${ws} and name = 'general'`)[0].n

  console.log('\n▶ three new workspaces, each with its channels listed four times at once')
  const seen = []
  for (const n of [1, 2, 3]) {
    const ws = n === 1 ? WS : must(await A('/workspaces', { method: 'POST', body: { name: `${TAG} ${n}` } }), `make workspace ${n}`).id
    const before = await generals(ws)
    const listings = await Promise.all([1, 2, 3, 4].map(() => A(`/workspaces/${ws}/chat/channels`)))
    seen.push({ before, answered: listings.map((r) => r.status), after: await generals(ws) })
  }
  chk(
    seen.every((w) => w.before === 0 && w.answered.every((s) => s === 200) && w.after === 1),
    'a new workspace whose channels are listed four times at once has one #general, each of three (read by SQL)',
    `#general before and after, and the listings' answers: ${JSON.stringify(seen)}`,
  )

  console.log('\n▶ a recorded call, ended, and ended again while its record is written')
  const CHANNEL = must(await A(`/workspaces/${WS}/chat/channels`, { method: 'POST', body: { name: `${TAG}-call` } }), 'make the call’s channel').id
  const CALL = must(await A(`/workspaces/${WS}/calls`, { method: 'POST', body: { channelId: CHANNEL } }), 'start the call').id
  // A line said while recording, so the end asks the model for notes, where there is one.
  const recording = await A(`/workspaces/${WS}/calls/${CALL}/recording`, { method: 'POST', body: { recording: true } })
  const line = await A(`/workspaces/${WS}/calls/${CALL}/transcript`, { method: 'POST', body: { text: 'We agreed to ship the release on Friday.' } })
  const held = await holdNextAnswer(1500)
  const firstEnd = A(`/workspaces/${WS}/calls/${CALL}/end`, { method: 'POST', body: {} })
  await sleep(held ? 300 : 0)
  const second = await A(`/workspaces/${WS}/calls/${CALL}/end`, { method: 'POST', body: {} })
  const first = await firstEnd
  const records = (await sql`select id::text as id from meetings where workspace_id = ${WS} order by created_at`).map((r) => r.id)
  const [row] = await sql`select meeting_id::text as id from calls where id = ${CALL}`
  const context = `the model held its notes: ${held ?? 'there is no model'}; recording ${said(recording)}, the line ${said(line)}`
  chk(
    records.length === 1 && row?.id === records[0],
    'the call keeps one meeting record, the one it points at (read by SQL)',
    `${context}; records ${JSON.stringify(records)}; the call points at ${row?.id ?? null}`,
  )
  // Which end writes is whichever takes the call first: the first, where the
  // notes are held back; either, where the two leave together.
  const givenOrComing = (res) => res.data?.pending === true || res.data?.meetingId === row?.id
  chk(
    [first, second].every((r) => r.status >= 200 && r.status < 300)
      && ((first.data?.meetingId === row?.id && givenOrComing(second)) || (second.data?.meetingId === row?.id && givenOrComing(first))),
    'one end is given that record, and the other is told it is coming or given the same one',
    `${context}; the first end answered ${said(first)} ${JSON.stringify(first.data)}; the second ${said(second)} ${JSON.stringify(second.data)}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await sql?.end({ timeout: 5 }).catch(() => {})
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
