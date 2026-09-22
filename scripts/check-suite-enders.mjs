#!/usr/bin/env node
/*
 * RULES ONE TO FIVE, BROKEN ON PURPOSE.
 *
 * `check-suite-section-enders.mjs` carries six rules. Rule six got a case file
 * the day it was written, because its steady-state answer is zero and "0 failed
 * is not it ran". The five above it had none — each was measured against the
 * tree when it went in (nineteen, five, twenty, three and twenty sites, all
 * real) and then left as a loop that reports 0 forever with nothing able to
 * tell a working rule from a broken one.
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
const CHECKER = join(HERE, 'check-suite-section-enders.mjs')

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
  /(\d+) site\(s\).*?(\d+) press\(es\).*?(\d+) gate\(s\).*?(\d+) box read\(s\).*?(\d+) use\(s\) of a locator.*?(\d+) use\(s\) of something.*?(\d+) read\(s\) in a chk message/s

const run = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'enders-'))
  try {
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body)
    const r = spawnSync(process.execPath, [CHECKER], {
      encoding: 'utf8',
      env: { ...process.env, SUITE_DIR: dir },
    })
    const m = (r.stdout ?? '').match(SUMMARY)
    return {
      code: r.status,
      stdout: r.stdout ?? '',
      sites: m ? +m[1] : null,
      counts: m
        ? {
            presses: +m[2],
            gates: +m[3],
            boxes: +m[4],
            sames: +m[5],
            sections: +m[6],
            messages: +m[7],
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
  'the assertion does not carry into the NEXT section — a throw there destroys a different scope',
  'the section boundary is not resetting, so the rule spans the whole file',
)

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
const MIN_CASES = 20
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
  const ORIGINAL = readFileSync(CHECKER, 'utf8')
  const MUTATIONS = [
    ["rule one stops requiring a press at all", ".click\\\\(`).test(line)", "`).test(line)"],
    ['rule one stops honouring its window', 'Math.min(i + 1 + WINDOW, lines.length)', 'lines.length'],
    ['rule one stops asking whether the check is about existence', "if (!/\\.count\\(\\)|isVisible|visible\\(|waitUntil/.test(cond)) continue", 'if (false) continue'],
    ['rule two forgets which testids are asserted', 'if (!checked.has(m[1])) continue', 'if (false) continue'],
    ['rule two forgets to skip a caught gate', "if (!m || /catch/.test(lines[i])) continue", 'if (!m) continue'],
    ['rule three forgets the two lines below it', 'lines.slice(i, i + 3).join(\' \')', 'lines[i]'],
    ['rule four stops matching on the identifier', "if (!new RegExp(`\\\\b${v}\\\\s*\\\\.`).test(lines[j]) || !ANYVERB.test(lines[j])) continue", 'if (!ANYVERB.test(lines[j])) continue'],
    ['rule five forgets the section boundary', "if (/console\\.log\\(['\"`]\\\\n/.test(lines[i])) {", 'if (false) {'],
    ['rule five forgets that waitUntil catches', "if (/waitUntil\\(/.test(lines.slice(Math.max(0, i - 3), i + 1).join(' '))) continue", 'if (false) continue'],
    ['the summary drops a rule from the press subtraction', 'rows.length - gates - boxes - sames - sections - messages', 'rows.length - gates - boxes - sames - sections'],
  ]
  console.log('\n▶ and each mutation of the checker reddens a case')
  let blind = 0
  for (const [label, from, to] of MUTATIONS) {
    if (ORIGINAL.split(from).length - 1 !== 1) {
      console.log(`  \x1b[31mANCHOR MISS\x1b[0m ${label}`)
      blind += 1
      continue
    }
    writeFileSync(CHECKER, ORIGINAL.split(from).join(to))
    const r = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' })
    writeFileSync(CHECKER, ORIGINAL)
    const named = (r.stdout ?? '').split('\n').filter((l) => l.includes('FAIL')).length
    if (r.status === 0) {
      console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — every case still passes`)
      blind += 1
    } else {
      console.log(`  \x1b[32mreddens\x1b[0m ${label} (${named} case(s))`)
    }
  }
  writeFileSync(CHECKER, ORIGINAL)
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
