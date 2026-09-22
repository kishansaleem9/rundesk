#!/usr/bin/env node
/*
 * THE LINE-BASED RULES, BROKEN ON PURPOSE.
 *
 * `check-suite-section-enders.mjs` carries eight rules. Rule six got a case
 * file the day it was written, because its steady-state answer is zero and "0
 * failed is not it ran". The line-based ones had none — each was measured
 * against the tree when it went in (nineteen, five, twenty, three, twenty and
 * fifteen sites, all real) and then left as a loop that reports 0 forever with
 * nothing able to tell a working rule from a broken one.
 *
 * THIS DOES NOT REFACTOR THEM. Pulling five line-based loops out into pure
 * functions is the kind of change that turns a real 0 into a false one while
 * looking like tidying, and the whole point is to stop trusting 0. So the
 * checker takes a `SUITE_DIR` and this points it at fixture suites — one shape
 * per file — and asserts on what it actually prints. The rules, the file
 * walking and the reporting are all under test, and nothing in the audit reads
 * that variable but this.
 *
 * EVERY CASE IS WRITTEN SO THAT BREAKING THE RULE IT COVERS CHANGES THE ANSWER,
 * and `--mutate` proves it: each mutation of the checker is applied, these cases
 * are re-run, and the mutation has to redden at least one of them. A case that
 * still passes with its rule deleted is a case that proves nothing, which is
 * the defect class this file exists inside.
 *
 *   node scripts/check-suite-enders.mjs            # the cases
 *   node scripts/check-suite-enders.mjs --mutate   # and that each one bites
 */
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
/*
 * COUNTING THE CASES A MUTATION NAMED, AND COUNTING THEM PROPERLY.
 *
 * This matched the substring `FAIL` anywhere in a line, which also matches the
 * word FAILURE inside a PASSING case's own sentence — "a root that is not there
 * is a FAILURE, not a silent skip" was counted as a failing case every time it
 * passed. The number the mutation pass prints is the only evidence that a
 * mutation was attributed to anything, so it has to count the marker `chk`
 * prints rather than a word that appears in prose.
 */
const NAMED_FAIL = /\x1b\[31mFAIL\x1b\[0m/
const namedFailures = (stdout) => (stdout ?? '').split('\n').filter((l) => NAMED_FAIL.test(l)).length

/*
 * THE FILE UNDER TEST IS NEVER WRITTEN. `ENDERS_CHECKER` points this at a COPY.
 *
 * The mutation pass used to write a deliberately-broken version of the real
 * checker, run, and write the original back — and that is a design that can
 * lose. It did: `check-suite-section-enders.mjs` was twice found with rule
 * one's ten-line window deleted, once from an interrupted run and once from a
 * SIGKILL test proving the point. `process.on('exit')` does not fire on
 * SIGKILL; nothing does. A `finally` and a signal handler shrink the window,
 * they do not close it.
 *
 * So the mutation is written to a copy and THAT is what runs. The original is
 * only ever read. There is no window to lose, and no restore to forget.
 *
 * The copy is a SIBLING of the original, not a file in a temp directory, and
 * the paragraph by the mutation loop records what that cost to learn: the
 * checker imports `./lib/suite-reads.mjs`, so a copy anywhere else cannot load.
 */
const CHECKER = process.env.ENDERS_CHECKER ?? join(HERE, 'check-suite-section-enders.mjs')

let pass = 0
let fail = 0
const failures = []
const chk = (cond, good, bad) => {
  if (cond) {
    pass += 1
    console.log(`  \x1b[32mPASS\x1b[0m ${good}`)
  } else {
    fail += 1
    failures.push(bad ?? good)
    console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`)
  }
}

/*
 * Run the checker over a throwaway directory of fixture suites and read the six
 * counts back off its summary line. Parsing the summary rather than counting
 * rows is deliberate: the summary is what a person reads, and it has been wrong
 * before — the `rows.length - gates - boxes - …` subtraction that produces the
 * press count has to be updated by hand every time a rule is added, and a rule
 * left out of it silently steals from rule one's number.
 */
const SUMMARY =
  /(\d+) site\(s\).*?(\d+) press\(es\).*?(\d+) gate\(s\).*?(\d+) box read\(s\).*?(\d+) use\(s\) of a locator.*?(\d+) use\(s\) of something this section.*?(\d+) use\(s\) of something asserted elsewhere.*?(\d+) read\(s\) in a chk message.*?(\d+) at the head of a condition/s

// `checker` is only ever passed by the mutation pass, to ask a mutant whether
// it runs at all before its verdict is read.
const run = (files, checker = CHECKER) => {
  const dir = mkdtempSync(join(tmpdir(), 'enders-'))
  try {
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body)
    const r = spawnSync(process.execPath, [checker], {
      encoding: 'utf8',
      env: { ...process.env, SUITE_DIR: dir },
    })
    const m = (r.stdout ?? '').match(SUMMARY)
    return {
      code: r.status,
      stdout: r.stdout ?? '',
      stderr: r.stderr ?? '',
      sites: m ? +m[1] : null,
      counts: m
        ? {
            presses: +m[2],
            gates: +m[3],
            boxes: +m[4],
            sames: +m[5],
            sections: +m[6],
            files: +m[7],
            messages: +m[8],
            leads: +m[9],
          }
        : null,
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// Only the rule under test fired, and it fired the expected number of times.
const only = (res, rule, n = 1) => {
  if (!res.counts) return false
  const zeroes = Object.entries(res.counts).filter(([k]) => k !== rule)
  return res.counts[rule] === n && zeroes.every(([, v]) => v === 0)
}

console.log('\n▶ nothing at all')

{
  const res = run({
    'clean.mjs': [
      `console.log('\\n▶ a section that does everything right')`,
      `chk(await page.getByTestId('row').count() === 1, 'a row', 'no row')`,
      `await page.getByTestId('row').click({ timeout: 8000 }).catch(() => {})`,
      `const box = await page.getByTestId('row').boundingBox().catch(() => null)`,
      `chk((box?.height ?? 0) >= 10, 'a band', 'a hairline')`,
      '',
    ].join('\n'),
  })
  chk(res.code === 0, 'a clean suite exits 0', `it exited ${res.code}`)
  chk(
    res.counts && Object.values(res.counts).every((v) => v === 0),
    'with every rule reporting nothing',
    `the counts were ${JSON.stringify(res.counts)}`,
  )
}

console.log('\n▶ rule one — a press on a control the check above it may find absent')

{
  const res = run({
    'press.mjs': [
      `chk(await visible('thing'), 'there is a control to press', 'no control')`,
      `await page.getByTestId('thing').click()`,
      '',
    ].join('\n'),
  })
  /*
   * RULE FIVE FIRES ON THIS TOO, and it is right to: rule five is rule one
   * without the ten-line window, so every press rule one catches is also
   * something the section asserts. This case is what found that the summary
   * reported one physical site as two places to fix — asserting exclusivity
   * here would have been asserting a bug.
   */
  chk(
    res.counts?.presses === 1 && res.counts?.sections === 1,
    'the bare press is a press AND something the section asserts — the rules overlap',
    `the counts were ${JSON.stringify(res.counts)}`,
  )
  chk(
    res.sites === 1,
    'and it is counted as ONE site, whatever number of rules flagged it',
    `the summary said ${res.sites} site(s) for a file with one bad line in it`,
  )
  chk(
    res.stdout.includes('press.mjs:2'),
    'named at the line of the press, not the check',
    'the row did not point at the press',
  )
}

chk(
  run({
    'press-bounded.mjs': [
      `chk(await visible('thing'), 'there is a control to press', 'no control')`,
      `await page.getByTestId('thing').click({ timeout: 8000 }).catch(() => {})`,
      '',
    ].join('\n'),
  }).counts?.presses === 0,
  'a press with a timeout and a catch is not a site',
  'a bounded press was reported, so the fix does not fix it',
)

chk(
  run({
    'press-options-no-timeout.mjs': [
      `chk(await visible('thing'), 'there is a control to press', 'no control')`,
      `await page.getByTestId('thing').click({ force: true })`,
      '',
    ].join('\n'),
  }).counts?.presses === 1,
  'a press whose options carry no timeout is still a site — it waits the full thirty seconds too',
  'a `click({ force: true })` was not reported, so the rule is narrower than its own guard',
)

chk(
  run({
    'press-options-timeout.mjs': [
      `chk(await visible('thing'), 'there is a control to press', 'no control')`,
      `await page.getByTestId('thing').click({ force: true, timeout: 8000 })`,
      '',
    ].join('\n'),
  }).counts?.presses === 0,
  'and one that carries a timeout is not, options or no options',
  'a press with a timeout was reported',
)

chk(
  run({
    'press-locator-spelling.mjs': [
      `chk((await page.locator('[data-testid="thing"]').count()) === 1, 'the chip is raised', 'no chip')`,
      `await page.locator('[data-testid="thing"]').click()`,
      '',
    ].join('\n'),
  }).counts?.presses === 1,
  'the `[data-testid="x"]` spelling is the same press as `getByTestId(\'x\')`',
  'a press written with page.locator was missed — the spelling rule one was blind to until ' +
    '`list-save-view-4` ended a run at 4 of 7 on exactly it',
)

chk(
  run({
    'press-mixed-spelling.mjs': [
      `chk((await page.locator('[data-testid="thing"]').count()) === 1, 'the chip is raised', 'no chip')`,
      `await page.getByTestId('thing').click()`,
      '',
    ].join('\n'),
  }).counts?.presses === 1,
  'and the two spellings pair with each other — a check in one, a press in the other',
  'the rule only pairs a press with a check written the same way, which is how `folder-dialog` ' +
    'hid a bare press under a check that used the other form',
)

chk(
  run({
    'press-value-check.mjs': [
      `chk((await textOfSomething()) === 'x', 'it reads x', 'it read something else')`,
      `await page.getByTestId('thing').click()`,
      '',
    ].join('\n'),
  }).counts?.presses === 0,
  'a press under a check about a VALUE is left alone — that check can fail with the element present',
  'a press was paired with a check that says nothing about existence',
)

chk(
  run({
    'press-far.mjs': [
      `chk(await visible('thing'), 'there is a control to press', 'no control')`,
      ...Array.from({ length: 11 }, (_, i) => `await page.waitForTimeout(${i + 1}0)`),
      `await page.getByTestId('thing').click()`,
      '',
    ].join('\n'),
  }).counts?.presses === 0,
  'and a press eleven lines down is not "the press that check is about"',
  'the ten-line window is not bounding anything',
)

console.log('\n▶ rule two — a gate in front of a check about the same element')

{
  const res = run({
    'gate.mjs': [
      `await page.waitForSelector('[data-testid="gated"]', { timeout: 20_000 })`,
      `chk(await page.getByTestId('gated').count() === 1, 'it is drawn', 'it is not drawn')`,
      '',
    ].join('\n'),
  })
  chk(only(res, 'gates'), 'the gate is one site', `the counts were ${JSON.stringify(res.counts)}`)
}

chk(
  run({
    'gate-unasserted.mjs': [
      `await page.waitForSelector('[data-testid="page-shell"]', { timeout: 20_000 })`,
      `chk(await page.getByTestId('row').count() === 1, 'a row', 'no row')`,
      '',
    ].join('\n'),
  }).counts?.gates === 0,
  'a gate on something no check is about is a page-load wait, and left alone',
  'a legitimate page-load gate was reported — there are sixty-one of those',
)

chk(
  run({
    'gate-caught.mjs': [
      `await page.waitForSelector('[data-testid="gated"]', { timeout: 20_000 }).catch(() => {})`,
      `chk(await page.getByTestId('gated').count() === 1, 'it is drawn', 'it is not drawn')`,
      '',
    ].join('\n'),
  }).counts?.gates === 0,
  'and a caught gate is not a site',
  'a caught gate was reported',
)

chk(
  run({
    // The shape `attach-on-create.mjs:193` is written in, and its own header
    // records it as the gate `aoc-4` proved and which was fixed for it. Rule
    // two tested `lines[i]` alone and reported the FIX as the defect, the
    // moment it was taught the second spelling and started reaching this line.
    'gate-caught-wrapped.mjs': [
      `const there = await page`,
      `  .waitForSelector('[data-testid="gated"]', { state: 'attached', timeout: 20_000 })`,
      `  .then(() => true)`,
      `  .catch(() => false)`,
      `chk(there && (await page.getByTestId('gated').count()) === 1, 'it is drawn', 'it is not')`,
      '',
    ].join('\n'),
  }).counts?.gates === 0,
  'a gate caught two lines down the chain is guarded too — the tree writes them wrapped',
  'a wrapped-and-caught gate was reported as a defect, which is worse than no rule',
)

console.log('\n▶ rule three — a box read that throws when nothing matches')

{
  const res = run({
    'box.mjs': [
      `const bandBox = await coverIn(made.image).boundingBox()`,
      `chk((bandBox?.height ?? 0) >= 40, 'the band is a band', 'a hairline')`,
      '',
    ].join('\n'),
  })
  chk(only(res, 'boxes'), 'the bare box read is one site', `the counts were ${JSON.stringify(res.counts)}`)
}

chk(
  run({
    'box-caught.mjs': [
      `const bandBox = await coverIn(made.image).boundingBox().catch(() => null)`,
      `chk((bandBox?.height ?? 0) >= 40, 'the band is a band', 'a hairline')`,
      '',
    ].join('\n'),
  }).counts?.boxes === 0,
  'a caught box read is not a site',
  'a caught box read was reported',
)

chk(
  run({
    'box-multiline.mjs': [
      `const bandBox = await coverIn(made.image)`,
      `  .boundingBox()`,
      `  .catch(() => null)`,
      '',
    ].join('\n'),
  }).counts?.boxes === 0,
  'and the catch counts from two lines below, where the tree writes it',
  'a catch on the following line was missed, so every wrapped read reports',
)

console.log('\n▶ rule four — the same locator, guarded and then bare')

{
  const res = run({
    'same.mjs': [
      `const pressedTitle = ((await textOf(pressed)) ?? '').split('\\n')[0].trim()`,
      `await pressed.click()`,
      '',
    ].join('\n'),
  })
  chk(only(res, 'sames'), 'the bare use one line down is one site', `the counts were ${JSON.stringify(res.counts)}`)
}

chk(
  run({
    'same-other.mjs': [
      `const pressedTitle = ((await textOf(pressed)) ?? '').split('\\n')[0].trim()`,
      `await somethingElse.click()`,
      '',
    ].join('\n'),
  }).counts?.sames === 0,
  'a different identifier is a different element, and not this rule',
  'the rule matched on proximity rather than on the identifier that ties the two lines together',
)

chk(
  run({
    'same-guarded.mjs': [
      `const pressedTitle = ((await textOf(pressed)) ?? '').split('\\n')[0].trim()`,
      `await pressed.click({ timeout: 8000 }).catch(() => {})`,
      '',
    ].join('\n'),
  }).counts?.sames === 0,
  'and a bounded use of it is not a site',
  'a bounded use of a guarded locator was reported',
)

console.log('\n▶ rule five — asserted in this section, then used bare in it')

{
  // Thirty lines down, so rule one's ten-line window cannot reach it, and a
  // read rather than a press so rule one's click shape cannot match either.
  const res = run({
    'section.mjs': [
      `console.log('\\n▶ the section this is about')`,
      `chk(await page.getByTestId('row').count() === 1, 'a row is drawn', 'no row')`,
      ...Array.from({ length: 30 }, (_, i) => `await page.waitForTimeout(${i + 1}0)`),
      `const v = await page.getByTestId('row').getAttribute('data-x')`,
      '',
    ].join('\n'),
  })
  chk(only(res, 'sections'), 'a bare read thirty lines below its own check is one site', `the counts were ${JSON.stringify(res.counts)}`)
}

chk(
  run({
    'section-next.mjs': [
      `console.log('\\n▶ the section that asserts it')`,
      `chk(await page.getByTestId('row').count() === 1, 'a row is drawn', 'no row')`,
      ...Array.from({ length: 30 }, (_, i) => `await page.waitForTimeout(${i + 1}0)`),
      `console.log('\\n▶ a different section, which asserts nothing')`,
      `const v = await page.getByTestId('row').getAttribute('data-x')`,
      '',
    ].join('\n'),
  }).counts?.sections === 0,
  'rule five does not carry an assertion into the NEXT section — a throw there destroys a different scope',
  'the section boundary is not resetting, so the rule spans the whole file',
)

console.log('\n▶ rule eight — asserted anywhere in this file, then used bare')

{
  /*
   * THE SAME FIXTURE RULE FIVE DECLINES, which is the whole point of the pair:
   * the two scopes have to give DIFFERENT answers about one file, or one of
   * them is not earning its place. Section says no, file says yes.
   */
  const res = run({
    'next-section.mjs': [
      `console.log('\\n▶ the section that asserts it')`,
      `chk(await page.getByTestId('row').count() === 1, 'a row is drawn', 'no row')`,
      `console.log('\\n▶ a different section, which asserts nothing')`,
      `const v = await page.getByTestId('row').getAttribute('data-x')`,
      '',
    ].join('\n'),
  })
  chk(
    only(res, 'files'),
    'a bare read in a LATER section than its own check is one site, and only rule eight sees it',
    `the counts were ${JSON.stringify(res.counts)}`,
  )
  chk(
    res.stdout.includes('next-section.mjs:4'),
    'named at the line of the use',
    'the row did not point at the use',
  )
}

chk(
  run({
    'unasserted.mjs': [
      `console.log('\\n▶ a section')`,
      `chk(await page.getByTestId('row').count() === 1, 'a row is drawn', 'no row')`,
      `console.log('\\n▶ another')`,
      `await page.getByTestId('something-else').click()`,
      '',
    ].join('\n'),
  }).counts?.files === 0,
  'a testid NO check in the file asserts is not a site — that is a page-load control, not this',
  'rule eight paired with an element the suite never says can be absent',
)

{
  /*
   * THE VALUE CHECK NAMES ITS TESTID THE WAY THE RULES READ TESTIDS — through
   * `getByTestId` — or this fixture proves nothing about the existence gate.
   *
   * It was first written as `attrOf('row')`, a helper, and then deleting the
   * gate from rule one AND from rule eight left every case green: with no
   * `getByTestId` in the condition there was no testid to over-collect, so the
   * two mutations had nothing to break. The read is bounded so that rule seven,
   * which is about a throwing read at the head of a condition, stays out of it.
   *
   * Both rules are asserted here, because both carry the same gate and a
   * regression would most likely be to the phrase they share.
   */
  const res = run({
    'value-check.mjs': [
      `console.log('\\n▶ a section')`,
      `chk((await page.getByTestId('row').getAttribute('data-x', { timeout: 8000 }).catch(() => null)) === 'x', 'the row says x', 'it said something else')`,
      `await page.getByTestId('row').click()`,
      '',
    ].join('\n'),
  })
  chk(
    res.counts && Object.values(res.counts).every((v) => v === 0),
    'a check about a VALUE does not make its testid absent-able — it can fail with the row right there',
    `the counts were ${JSON.stringify(res.counts)}`,
  )
}

{
  /*
   * THE GUARD WINDOW, WHICH IS THE BUG THAT MADE THIS RULE FIND THINGS.
   *
   * A wrapped `.catch()` is part of THIS call and counts. The next `await` is a
   * different statement about a different element and must not.
   */
  chk(
    run({
      'wrapped.mjs': [
        `console.log('\\n▶ a section')`,
        `chk(await page.getByTestId('row').count() === 1, 'a row is drawn', 'no row')`,
        `console.log('\\n▶ another')`,
        `await page`,
        `  .getByTestId('row')`,
        `  .click({ timeout: 8000 })`,
        `  .catch(() => {})`,
        '',
      ].join('\n'),
    }).counts?.files === 0,
    'a catch on the next line of the SAME chain counts as this call’s guard',
    'a wrapped bounded press was reported, so the fix does not fix it',
  )
  chk(
    run({
      'neighbour.mjs': [
        `console.log('\\n▶ a section')`,
        `chk(await page.getByTestId('row').count() === 1, 'a row is drawn', 'no row')`,
        `console.log('\\n▶ another')`,
        `await page.getByTestId('row').fill('x')`,
        `await page.getByTestId('other').selectOption('y', { timeout: 8000 }).catch(() => {})`,
        '',
      ].join('\n'),
    }).counts?.files === 1,
    'but the NEXT STATEMENT’s guard is not this one’s — that is how a bare fill hid for weeks',
    'the bare fill borrowed the catch off the line below it',
  )
}

{
  // Containment, not proximity: the `waitUntil` above has closed.
  chk(
    run({
      'closed-waituntil.mjs': [
        `console.log('\\n▶ a section')`,
        `chk(await page.getByTestId('row').count() === 1, 'a row is drawn', 'no row')`,
        `console.log('\\n▶ another')`,
        `chk(await waitUntil(() => settled('0'), { timeoutMs: 8000 }), 'it emptied', 'it did not')`,
        `await page.getByTestId('row').click()`,
        '',
      ].join('\n'),
    }).counts?.files === 1,
    'a press two lines under a CLOSED waitUntil is still a site — nothing is catching for it',
    'the press was spared by a waitUntil that had already closed',
  )
  chk(
    run({
      'open-waituntil.mjs': [
        `console.log('\\n▶ a section')`,
        `chk(await page.getByTestId('row').count() === 1, 'a row is drawn', 'no row')`,
        `console.log('\\n▶ another')`,
        `const ok = await waitUntil(async () => {`,
        `  return (await page.getByTestId('row').getAttribute('data-x')) === 'y'`,
        `}, { timeoutMs: 8000 })`,
        '',
      ].join('\n'),
    }).counts?.files === 0,
    'and a read INSIDE an open one is not — waitUntil catches its predicate’s throws',
    'a read inside a waitUntil predicate was reported',
  )
}

chk(
  run({
    'section-waituntil.mjs': [
      `console.log('\\n▶ a section with a polled read')`,
      `chk(await page.getByTestId('row').count() === 1, 'a row is drawn', 'no row')`,
      ...Array.from({ length: 30 }, (_, i) => `await page.waitForTimeout(${i + 1}0)`),
      `await waitUntil(`,
      `  async () => (await page.getByTestId('row').getAttribute('data-x')) === 'y',`,
      `  { timeoutMs: 5000 },`,
      `)`,
      '',
    ].join('\n'),
  }).counts?.sections === 0,
  'and a read inside a `waitUntil` predicate is already safe — it catches its own throws',
  'a waitUntil predicate was reported, which is the false-positive class the rule names',
)

console.log('\n▶ rule seven — a throwing read at the HEAD of a condition')

chk(
  run({
    'lead-read.mjs': [
      `chk((await page.getByTestId('t').getAttribute('data-x')) === 'y', 'it reads y', 'it did not')`,
      '',
    ].join('\n'),
  }).counts?.leads === 1,
  'a read with nothing in front of it in the condition is a site',
  'the shape two agents surfaced while fixing rule six next door was not reported',
)

chk(
  run({
    'lead-guarded.mjs': [
      `chk(ready && (await page.getByTestId('t').getAttribute('data-x')) === 'y', 'l', 'no')`,
      '',
    ].join('\n'),
  }).counts?.leads === 0,
  'and one behind an `&&` is NOT — that is the idiom rule one declined to gate',
  'a short-circuitable read was reported, which is the false-positive class that kept the broad ' +
    'read scan from ever becoming a rule',
)

chk(
  run({
    'lead-bounded.mjs': [
      `chk((await page.getByTestId('t').getAttribute('data-x', { timeout: 8000 })) === 'y', 'l', 'no')`,
      '',
    ].join('\n'),
  }).counts?.leads === 0,
  'a bounded leading read is not a site',
  'a bounded read was reported, so the fix does not fix it',
)

chk(
  run({
    'lead-waituntil.mjs': [
      `chk(await waitUntil(async () => (await page.getByTestId('t').getAttribute('x')) === 'y'), 'l', 'no')`,
      '',
    ].join('\n'),
  }).counts?.leads === 0,
  'and one inside a waitUntil predicate is already safe — it catches its own throws',
  'a waitUntil predicate was reported, the same false positive rule five excludes',
)

console.log('\n▶ the summary line, which is what a person reads')

{
  // One of each, in one directory: the press count is a SUBTRACTION of every
  // other rule's count from the row total, so a rule missing from that
  // expression silently steals from rule one's number.
  const res = run({
    'a-press.mjs': [
      `chk(await visible('thing'), 'there is a control to press', 'no control')`,
      `await page.getByTestId('thing').click()`,
      '',
    ].join('\n'),
    'b-gate.mjs': [
      `await page.waitForSelector('[data-testid="gated"]', { timeout: 20_000 })`,
      `chk(await page.getByTestId('gated').count() === 1, 'it is drawn', 'it is not')`,
      '',
    ].join('\n'),
    'c-box.mjs': [`const b = await thing.boundingBox()`, ''].join('\n'),
    'd-message.mjs': [
      `chk(ok, 'l', \`it read \${await page.getByTestId('t').innerText()}\`)`,
      '',
    ].join('\n'),
  })
  chk(
    res.counts?.presses === 1 &&
      res.counts?.gates === 1 &&
      res.counts?.boxes === 1 &&
      res.counts?.messages === 1,
    'four rules firing once each are counted once each',
    `the counts were ${JSON.stringify(res.counts)} — a rule left out of the press subtraction ` +
      'shows up as an extra press',
  )
  chk(
    res.sites === 4,
    'and four files with one bad line each are four sites',
    `the summary said ${res.sites} site(s) for four files with one bad line each`,
  )
  chk(
    res.code === 1,
    'and any site at all exits 1',
    `it exited ${res.code} with sites reported`,
  )
}

/*
 * AND A FLOOR ON THE CASE COUNT. `25 case(s) held, 0 did not` is what this
 * prints when it works; `0 case(s) held, 0 did not` is what it would print with
 * every case deleted, and it exited 0 either way. The four older contract tests
 * had the same hole and the ledger had described it as protection.
 *
 * Measured 22 September: 25 cases. A floor, because the set grows.
 */
let short = false
const MIN_CASES = 30
if (pass + fail < MIN_CASES) {
  console.error(
    `\n[suite-enders] only ${pass + fail} case(s) ran, below the floor of ${MIN_CASES}. A case file ` +
      'that asserts nothing passes; this line is what stops it saying so.',
  )
  short = true
}

console.log(
  `\n${fail === 0 ? '\x1b[32mok\x1b[0m' : '\x1b[31mnot ok\x1b[0m'} suite-enders: ` +
    `${pass} case(s) held, ${fail} did not`,
)

/*
 * AND THAT EACH CASE BITES. Every mutation below deletes or defeats one rule's
 * logic; the cases above have to notice. A mutation that leaves them all green
 * means the rule it touched is covered by nothing, which is the state this file
 * was written to end.
 */
if (process.argv.includes('--mutate')) {
  /*
   * THE MUTANT LIVES BESIDE THE ORIGINAL, AND THE REASON IS A BUG THIS FOUND
   * IN ITSELF.
   *
   * The paragraph that stood here described restoring the original from a
   * `finally` and an exit handler. That design is gone — the header at the top
   * of this file says why, and says the mutation is written to a copy — but the
   * account of it stayed, so the file carried two contradictory explanations of
   * one mechanism. The stale one is deleted rather than argued with.
   *
   * What the copy design got wrong: the copy went to a fresh temp DIRECTORY,
   * and `check-suite-section-enders.mjs` imports `./lib/suite-reads.mjs`. A
   * relative import resolves against the importing FILE, so every mutant died
   * with ERR_MODULE_NOT_FOUND before executing one line of the rule it was
   * meant to break. All twelve mutations "reddened" — thirty-one cases each,
   * every time, which is what a crash looks like — and the pass reported 12 of
   * 12 bite while proving nothing whatsoever about any rule.
   *
   * That is this audit's own defect class, in its own test harness: a check
   * that cannot fail, dressed as a passing one. It was invisible because a
   * crashing mutant reddens MORE cases than a working one, so the number went
   * the reassuring way.
   *
   * Two changes. The mutant is written next to the original so its imports
   * resolve, under a dotted name nothing globs — never over the original, which
   * is still only ever read. And a mutant now has to PROVE IT RAN: the clean
   * fixture is put through it first, and a mutant that cannot produce a summary
   * line is reported as proving nothing, exactly like one that reddens nothing.
   */
  const ORIGINAL = readFileSync(CHECKER, 'utf8')
  let blind = 0
  const MUTATIONS = [
    ["rule one stops requiring a press at all", ".click\\\\(`).test(line)", "`).test(line)"],
    ['rule one stops honouring its window', 'Math.min(i + 1 + WINDOW, lines.length)', 'lines.length'],
    ['rule one stops asking whether the check is about existence', "if (!/\\.count\\(\\)|isVisible|visible\\(|waitUntil/.test(cond)) continue", 'if (false) continue'],
    ['rule two forgets which testids are asserted', 'if (!checked.has(m[1])) continue', 'if (false) continue'],
    ['rule two forgets to skip a caught gate', "if (!m || /catch/.test(lines.slice(i, i + 3).join(' '))) continue", 'if (!m) continue'],
    ['rule three forgets the two lines below it', "if (/catch/.test(lines.slice(i, i + 3).join(' '))) continue\n    boxes += 1", 'boxes += 1'],
    ['rule four stops matching on the identifier', "if (!new RegExp(`\\\\b${v}\\\\s*\\\\.`).test(lines[j]) || !ANYVERB.test(lines[j])) continue", 'if (!ANYVERB.test(lines[j])) continue'],
    ['rule seven stops requiring the read to be FIRST', "if (/&&|\\|\\||\\?/.test(before)) continue", 'if (false) continue'],
    ['rule seven forgets that waitUntil catches', "if (/waitUntil\\(/.test(cond)) continue", 'if (false) continue'],
    ['rule five forgets the section boundary', "if (/console\\.log\\(['\"`]\\\\n/.test(lines[i])) {", 'if (false) {'],
    ['rule eight reports nothing at all', 'if (rows.some((r) => r.file === file && r.line === i + 1 && r.section)) break', 'break'],
    ['rule eight stops asking whether the check is about existence', "if (!/\\.count\\(\\)|isVisible|\\bvisible\\(|waitUntil|appears\\(/.test(cond)) continue\n    for (const m of cond.matchAll(", 'for (const m of cond.matchAll('],
    ['the guard window borrows the next STATEMENT’s catch again', 'for (let j = i + 1; j < lines.length && /^\\s*\\./.test(lines[j]); j++) out += ` ${lines[j]}`', 'for (let j = i + 1; j < Math.min(i + 2, lines.length); j++) out += ` ${lines[j]}`'],
    ['“inside a waitUntil” goes back to proximity', "for (const ch of [lines[s].slice(at), ...lines.slice(s + 1, i + 1)].join('\\n'))\n      depth += ch === '(' ? 1 : ch === ')' ? -1 : 0", 'depth = 1'],
    ['“inside a waitUntil” stops sparing the predicate', 'return depth > 0', 'return false'],
    ['the summary drops a rule from the press subtraction', 'rows.length - gates - boxes - sames - sections - files - messages', 'rows.length - gates - boxes - sames - sections - files'],
  ]
  console.log('\n▶ and each mutation of the checker reddens a case')
  for (const [label, from, to] of MUTATIONS) {
    if (ORIGINAL.split(from).length - 1 !== 1) {
      console.log(`  \x1b[31mANCHOR MISS\x1b[0m ${label}`)
      blind += 1
      continue
    }
    // Beside the original, never over it: a sibling so `./lib/…` resolves, and
    // a dotted name so nothing that walks `scripts/` picks it up.
    const mutant = join(HERE, `.enders-mutant-${label.replace(/\W+/g, '-')}.mjs`)
    try {
      writeFileSync(mutant, ORIGINAL.split(from).join(to))
      /*
       * DID THE MUTANT RUN? A mutant that crashes reddens every case, which
       * reads like a strong signal and is the absence of one. So it is asked
       * the one question the rules cannot answer for it — walk a fixture and
       * print a summary — before its verdict is believed.
       */
      const alive = run({ 'alive.mjs': `console.log('\\n▶ nothing here')\n` }, mutant)
      if (!alive.counts) {
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — the mutant did not run:`)
        console.log(`      ${(alive.stderr || alive.stdout || '').trim().split('\n')[0] ?? ''}`)
        blind += 1
        continue
      }
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
        encoding: 'utf8',
        env: { ...process.env, ENDERS_CHECKER: mutant },
      })
      const named = namedFailures(r.stdout)
      if (r.status === 0) {
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — every case still passes`)
        blind += 1
      } else if (named === 0) {
        // Non-zero with nothing named is not a redden: this file stopped
        // before it could report, so the exit code is about the harness
        // rather than about the rule. Crediting it would be the same mistake
        // as crediting a mutant that never ran.
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — it exited non-zero but named no case`)
        blind += 1
      } else {
        console.log(`  \x1b[32mreddens\x1b[0m ${label} (${named} case(s))`)
      }
    } finally {
      rmSync(mutant, { force: true })
    }
  }
  console.log(
    `\n${blind === 0 ? '\x1b[32mok\x1b[0m' : '\x1b[31mnot ok\x1b[0m'} mutations: ` +
      `${MUTATIONS.length - blind} of ${MUTATIONS.length} bite`,
  )
  if (blind) fail += blind
}

if (fail) {
  console.error(`\n[suite-enders] ${fail} case(s) did not hold:`)
  for (const f of failures) console.error(`  · ${f}`)
}
process.exitCode = fail === 0 && !short ? 0 : 1
