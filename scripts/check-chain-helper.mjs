#!/usr/bin/env node
/**
 * A self-test for `test/e2e/lib/chain.mjs`, because that module is now load-
 * bearing in eleven suites and its own failure mode is the one this audit
 * exists to catch.
 *
 * It was written to stop a suite reporting a different number of checks
 * depending on which branch it took. Within an hour of being written it had a
 * hole of exactly that shape: `step` past the end of its label list emitted
 * `check(cond, undefined, …)` — a check with NO SENTENCE, printing `PASS
 * undefined` and counting towards the total, so a chain used past its length
 * silently inflated the count. Found by calling `step` three times on a chain
 * of two; invisible by reading.
 *
 * So the module gets a test, and the test is a checker like the ones beside it
 * rather than a vitest file, because `test/e2e` has no runner and inventing one
 * for six assertions is how a check ends up unregistered.
 *
 * Every assertion here is the module's contract stated out loud:
 *
 *   1. a chain reports exactly its declared length, whichever path it takes;
 *   2. `step` past the end THROWS rather than emitting a nameless check —
 *      including with a label override, because the declared length is what
 *      `rest` and the suite's `EXPECTED_CHECKS` both rely on;
 *   3. `rest` fails every remaining check, with the reason;
 *   4. `skipRest` needs a counted `skip`, and refuses without one — an
 *      uncounted skip is the short run the module exists to prevent;
 *   5. a label override replaces the sentence at a valid index.
 */
import { makeChain } from '../test/e2e/lib/chain.mjs'

let failed = 0
const is = (got, want, what) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`)
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`)
}
const throws = (fn, needle, what) => {
  let msg = null
  try {
    fn()
  } catch (e) {
    msg = e.message
  }
  const ok = msg !== null && msg.includes(needle)
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`)
  if (!ok) console.log(`        ${msg === null ? 'it did not throw' : `threw: ${msg}`}`)
}

const rec = () => {
  const out = []
  return {
    out,
    check: (ok, label, detail = '') => out.push([ok, label, detail]),
    skip: (label, why) => out.push(['skip', label, why]),
  }
}

console.log('\n1. a chain reports its declared length whichever path it takes')
{
  const a = rec()
  const c = makeChain(a.check)('one', 'two', 'three')
  c.step(true)
  c.rest('stopped')
  is(a.out.map((r) => r[1]), ['one', 'two', 'three'], 'one step then rest reports all three')
  is(a.out.map((r) => r[0]), [true, false, false], 'the unreached ones are FAILED, not passed')
  is(a.out[2][2], 'stopped', 'and each carries the reason the chain stopped')
}
{
  const b = rec()
  const c = makeChain(b.check)('one', 'two', 'three')
  c.step(true)
  c.step(false)
  c.step(true)
  is(b.out.length, 3, 'three steps report three')
}

console.log('\n2. step past the end throws rather than reporting nothing')
throws(
  () => {
    const a = rec()
    const c = makeChain(a.check)('one', 'two')
    c.step(true)
    c.step(true)
    c.step(true)
  },
  'out of',
  'a third step on a chain of two throws',
)
throws(
  () => {
    const a = rec()
    const c = makeChain(a.check)('one')
    c.step(true)
    c.step(true, '', 'an override')
  },
  'out of',
  'and a label override does not buy an extra slot',
)

console.log('\n3. skipRest needs a counted skip')
throws(
  () => makeChain(rec().check)('one', 'two').skipRest('no soundcard'),
  'no skip function',
  'skipRest without one refuses, rather than losing the checks',
)
{
  const a = rec()
  const c = makeChain(a.check, a.skip)('one', 'two')
  c.step(true)
  c.skipRest('no soundcard')
  is(a.out.map((r) => r[0]), [true, 'skip'], 'with one, the remainder is SKIPPED not failed')
  is(a.out[1][2], 'no soundcard', 'and carries the reason')
}

console.log('\n4. a label override replaces the sentence at a valid index')
{
  const a = rec()
  const c = makeChain(a.check)('the count is right', 'unused')
  c.step(true, '', 'the count is right (7)')
  is(a.out[0][1], 'the count is right (7)', 'the override is what gets reported')
  c.rest('x')
  is(a.out.map((r) => r[1]), ['the count is right (7)', 'unused'], 'and rest continues from the next slot')
}

console.log(`\n${failed === 0 ? '[chain-helper] all assertions hold' : `[chain-helper] ${failed} FAILED`}`)
process.exitCode = failed === 0 ? 0 : 1
