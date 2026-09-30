#!/usr/bin/env node
/**
 * A self-test for `test/e2e/lib/wait.mjs`, whose `waitUntil` 151 suites call
 * 1,072 times (`found-30-sep/a-hung-page-outlasts-every-wait`).
 *
 * It awaited its predicate before it looked at the deadline. A predicate that
 * never settled — a Playwright call to a page whose renderer had stopped
 * answering — held the wait for ever, and `task-attachments`' baseline went
 * silent for fourteen minutes under a 20 s wait, until the break runner's 900 s
 * kill reported one unexplained failed check.
 *
 * The module's contract, stated out loud:
 *
 *   1. a predicate that never settles is a no: the wait returns false, at its
 *      deadline plus the last look's grace, not never;
 *   2. a predicate that turns true is a yes, and one that is never true is a no
 *      no sooner than the deadline;
 *   3. a throw is a reason to look again (a navigation mid-poll), not an end;
 *   4. `waitForCount` inherits all of it;
 *   5. `textOf` reads a page that never answers as empty, and in bounded time.
 *
 * Every case that could hang runs under its own watchdog, so a mutant that
 * waits for ever FAILS a named case rather than stalling the file — a stalled
 * file names nothing, and a mutation that names nothing proves nothing.
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { proveMutationsBite } from './lib/mutate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SUBJECT = process.env.WAIT_LIB ?? '../test/e2e/lib/wait.mjs'
const { waitUntil, waitForCount, textOf } = await import(SUBJECT)

let failed = 0
let ran = 0
const is = (ok, what, detail = '') => {
  ran += 1
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`)
  if (!ok && detail) console.log(`        ${detail}`)
}
const WATCHDOG = Symbol('watchdog')
/** `promise`'s value, or WATCHDOG if it has not settled within `ms`. */
const within = (promise, ms) => {
  let t
  return Promise.race([promise, new Promise((r) => { t = setTimeout(r, ms, WATCHDOG) })]).finally(() => clearTimeout(t))
}
const never = () => new Promise(() => {})
const timed = async (fn) => {
  const t0 = Date.now()
  const value = await fn()
  return { value, ms: Date.now() - t0 }
}

console.log('\n1. a predicate that never settles is a no, at the deadline')
{
  const { value, ms } = await timed(() => within(waitUntil(never, { timeoutMs: 300, stepMs: 20, lastLookGraceMs: 200 }), 6000))
  is(value === false, 'waitUntil on a predicate that never settles returns false', value === WATCHDOG ? 'it was still waiting after 6 s' : `it returned ${String(value)}`)
  is(value !== WATCHDOG && ms < 1500, 'and within its timeout plus the last look\'s grace (300 ms + 200 ms)', `it took ${ms} ms`)
}
{
  // Answers for a while, then stops answering: the hang comes mid-wait.
  let n = 0
  const pred = () => (++n < 3 ? false : never())
  const { value } = await timed(() => within(waitUntil(pred, { timeoutMs: 400, stepMs: 20, lastLookGraceMs: 200 }), 6000))
  is(value === false, 'a predicate that stops answering part-way is a no too', value === WATCHDOG ? 'it was still waiting after 6 s' : `it returned ${String(value)}`)
}

console.log('\n2. yes when it turns true; no, and no sooner than the deadline, when it never does')
{
  let n = 0
  const { value } = await timed(() => within(waitUntil(async () => ++n >= 4, { timeoutMs: 3000, stepMs: 10 }), 6000))
  is(value === true, 'a predicate true on its fourth look is a yes', `it returned ${String(value)}`)
  is(n === 4, 'and the wait stops looking once it is true', `it looked ${n} times`)
}
{
  const { value, ms } = await timed(() => within(waitUntil(async () => false, { timeoutMs: 300, stepMs: 10 }), 6000))
  is(value === false, 'a predicate never true is a no', value === WATCHDOG ? 'it was still waiting after 6 s' : `it returned ${String(value)}`)
  is(ms >= 290, 'and not before the deadline', `it gave up after ${ms} ms of 300`)
}
{
  // A look that answers after the deadline but within the grace still counts.
  const { value } = await timed(() => within(waitUntil(() => new Promise((r) => setTimeout(r, 400, true)), { timeoutMs: 100, stepMs: 10, lastLookGraceMs: 1000 }), 6000))
  is(value === true, 'a look begun before the deadline that answers yes within the grace is a yes', `it returned ${String(value)}`)
}

{
  // The default grace outlasts the longest wait a predicate in the tree makes
  // inside itself (8 s, and two 5 s back to back), so no answering look is cut.
  const { LAST_LOOK_GRACE_MS } = await import(SUBJECT)
  is(LAST_LOOK_GRACE_MS >= 10_000, 'the default grace outlasts the longest wait inside a predicate (10 s)', `it is ${LAST_LOOK_GRACE_MS} ms`)
}

console.log('\n3. a throw is a reason to look again')
{
  let n = 0
  const pred = async () => {
    n += 1
    if (n < 3) throw new Error('Execution context was destroyed')
    return true
  }
  const { value } = await timed(() => within(waitUntil(pred, { timeoutMs: 2000, stepMs: 10 }), 6000))
  is(value === true, 'two throws then true is a yes', `it returned ${String(value)}`)
}

console.log('\n4. waitForCount inherits it')
{
  const hung = { count: never }
  const { value } = await timed(() => within(waitForCount(hung, 3, { timeoutMs: 300, lastLookGraceMs: 200 }), 6000))
  is(value === false, 'a locator whose count never answers is a no', value === WATCHDOG ? 'it was still waiting after 6 s' : `it returned ${String(value)}`)
  const ready = { count: async () => 3 }
  is((await within(waitForCount(ready, 3, { timeoutMs: 300 }), 6000)) === true, 'and one that counts three is a yes')
}

console.log('\n5. textOf reads a page that never answers as empty, in bounded time')
{
  const hung = { evaluate: never }
  const { value, ms } = await timed(() => within(textOf(hung, { timeoutMs: 100 }), 8000))
  is(value === '', 'textOf on a page whose evaluate never settles returns ""', value === WATCHDOG ? 'it was still reading after 8 s' : `it returned ${JSON.stringify(value)}`)
  is(value !== WATCHDOG && ms < 4000, 'and gives up within its eight looks', `it took ${ms} ms`)
  const page = { evaluate: async () => 'Hello' }
  is((await within(textOf(page), 6000)) === 'Hello', 'and reads a page that answers')
}

let short = false
if (process.argv.includes('--mutate')) {
  failed += proveMutationsBite({
    subject: join(HERE, '../test/e2e/lib/wait.mjs'),
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'WAIT_LIB',
    label: 'the wait helpers',
    alive: (mutant) => {
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(mutant)})`], {
        encoding: 'utf8',
        timeout: 30_000,
      })
      return { ok: r.status === 0, why: (r.stderr ?? '').trim() }
    },
    mutations: [
      ['the predicate is awaited alone again, with no race against the time left',
        'const answer = await settledWithin(Promise.resolve().then(predicate), Math.max(left, lastLookGraceMs))',
        'const answer = await Promise.resolve().then(predicate)'],
      ['a look still pending at the deadline counts as yes',
        'if (answer !== PENDING && answer) return true',
        'if (answer) return true'],
      ['the deadline is never looked at',
        'if (Date.now() > deadline) return false\n    await new Promise((resolve) => setTimeout(resolve, stepMs))',
        'await new Promise((resolve) => setTimeout(resolve, stepMs))'],
      ['the last look gets no grace',
        'Math.max(left, lastLookGraceMs)',
        'Math.max(left, 0)'],
      ['a throw ends the wait as a no',
        '      // A navigation mid-poll invalidates the execution context; that is a\n      // reason to look again, not to fail.\n    }\n    if (Date.now() > deadline)',
        '      return false\n    }\n    if (Date.now() > deadline)'],
      ['the default grace is cut to 2 s, below the waits predicates make inside themselves',
        'export const LAST_LOOK_GRACE_MS = 15_000',
        'export const LAST_LOOK_GRACE_MS = 2000'],
      ['textOf waits on the page for ever again',
        "const text = await settledWithin(page.evaluate(() => document.body?.innerText ?? ''), timeoutMs)",
        "const text = await page.evaluate(() => document.body?.innerText ?? '')"],
    ],
  })
}

const MIN_ASSERTIONS = 15
if (ran < MIN_ASSERTIONS) {
  console.error(`\n[wait-helper] only ${ran} assertion(s) ran, below the floor of ${MIN_ASSERTIONS}.`)
  short = true
}
console.log(`\n${failed === 0 ? `[wait-helper] all ${ran} assertions hold` : `[wait-helper] ${failed} of ${ran} FAILED`}`)
process.exitCode = failed === 0 && !short ? 0 : 1
// A mutant's hung predicate leaves a timer-less pending promise; nothing keeps
// the loop alive, but a watchdog lost to a bug would. End explicitly.
setTimeout(() => process.exit(process.exitCode), 50).unref()
