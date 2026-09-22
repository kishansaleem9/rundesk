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
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { proveMutationsBite } from './lib/mutate.mjs'

/*
 * DYNAMIC, so `--mutate` can aim these cases at a broken copy. Every suite that
 * uses a chain depends on this counting exactly right: a chain that quietly
 * stops counting is the short run the whole module exists to prevent.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const SUBJECT = process.env.CHAIN_LIB ?? '../test/e2e/lib/chain.mjs'
const { makeChain } = await import(SUBJECT)

let failed = 0
let ran = 0
const is = (got, want, what) => {
  ran += 1
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`)
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`)
}
const throws = (fn, needle, what) => {
  ran += 1
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
{
  /*
   * MORE THAN ONE LEFT, because every case above left exactly one and so
   * covered nothing about the LOOP. `--mutate` found it: making `skipRest`
   * advance past the end after a single skip — recording one of three — left
   * every case green. A counted skip that counts one of three is the short run
   * this module exists to prevent, wearing the fix.
   */
  const a = rec()
  const c = makeChain(a.check, a.skip)('one', 'two', 'three')
  c.step(true)
  c.skipRest('no soundcard')
  is(
    a.out.map((r) => r[0]),
    [true, 'skip', 'skip'],
    'and with TWO left it skips both — the remainder is every remaining label, not the next one',
  )
  is(a.out.map((r) => r[1]), ['one', 'two', 'three'], 'each named by its own sentence')
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

/*
 * AND A FLOOR ON HOW MANY ASSERTIONS RAN, because "all assertions hold" is true
 * of no assertions at all.
 *
 * Measured 22 September: with every assertion in this file commented out, it
 * printed exactly the line below and exited 0. All four contract tests did. The
 * ledger had said they "cannot go vacuous without going to zero cases" — which
 * is the failure itself, written down as though it were protection.
 *
 * So the count is asserted and then printed beside the verdict. A verdict that
 * does not say what it is about is the same shape as a suite reporting
 * `0 failed` for checks it never reached.
 */
let short = false
/*
 * AND THAT EACH CASE BITES. Every mutation here is a way a chain could stop
 * counting — which is the failure this module was written for, and the one a
 * suite's `EXPECTED_CHECKS` would otherwise catch hours later in a break run.
 */
if (process.argv.includes('--mutate')) {
  failed += proveMutationsBite({
    subject: join(HERE, '../test/e2e/lib/chain.mjs'),
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'CHAIN_LIB',
    label: 'the chain helper',
    alive: (mutant) => {
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(mutant)})`], {
        encoding: 'utf8',
        timeout: 30_000,
      })
      return { ok: r.status === 0, why: (r.stderr ?? '').trim() }
    },
    mutations: [
      ['a step past the end reports `undefined` again instead of throwing', 'if (at >= labels.length) {', 'if (false) {'],
      ['an overriding label ADDS an index rather than replacing one', 'const l = label ?? labels[at]\n        at += 1', 'const l = label ?? labels[at]\n        if (!label) at += 1'],
      ['`rest` stops reporting the checks that never ran', 'while (at < labels.length) {\n          check(false, labels[at], why)', 'while (false) {\n          check(false, labels[at], why)'],
      ['`rest` reports the remainder as PASSING', 'check(false, labels[at], why)', 'check(true, labels[at], why)'],
      ['`skipRest` runs with no skip function, so the skips go uncounted', 'if (!skip) {', 'if (false) {'],
      ['`skipRest` stops advancing, so it never terminates or never counts', 'skip(labels[at], why)\n          at += 1', 'skip(labels[at], why)\n          at += labels.length + 1'],
    ],
  })
}

const MIN_ASSERTIONS = 10
if (ran < MIN_ASSERTIONS) {
  console.error(
    `\n[chain-helper] only ${ran} assertion(s) ran, below the floor of ${MIN_ASSERTIONS}. ` +
      'A contract test that asserts nothing passes; this line is what stops it saying so.',
  )
  short = true
}
console.log(
  `\n${failed === 0 ? `[chain-helper] all ${ran} assertions hold` : `[chain-helper] ${failed} of ${ran} FAILED`}`,
)
process.exitCode = failed === 0 && !short ? 0 : 1
