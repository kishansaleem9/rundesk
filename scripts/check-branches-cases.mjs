#!/usr/bin/env node
/*
 * THE CONDITIONAL-CHECK RULE, BROKEN ON PURPOSE.
 *
 * `check-suite-check-branches.mjs` gates preflight and CI, its steady-state
 * answer is zero, and until this file it had NOTHING able to tell a working
 * rule from a broken one. That is the position `check-suite-section-enders.mjs`
 * was in, and the position three mutation harnesses turned out to be in even
 * after they had one.
 *
 * Its own header already makes the argument: it says "both verdicts below are
 * zeros", and it grew a suite-count floor precisely because a scan that reads
 * nothing prints the same zero as a scan that reads everything. The floor
 * answers "did it read anything?". It cannot answer "would it notice?", which
 * is what these cases are for.
 *
 * NO REFACTOR. The rule stays a loop over text; this points it at a directory
 * of fixture suites through `SUITE_DIR` and asserts on what it prints. The
 * brace matcher, the `else` test, the check-call test, the ratchet and the
 * denominator floor are all exercised as they actually run.
 *
 *   node scripts/check-branches-cases.mjs            # the cases
 *   node scripts/check-branches-cases.mjs --mutate   # and that each one bites
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { proveMutationsBite } from './lib/mutate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CHECKER = process.env.BRANCHES_CHECKER ?? join(HERE, 'check-suite-check-branches.mjs')

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
 * The summary is what a person reads, so the summary is what is parsed — the
 * same reasoning `check-suite-enders.mjs` gives. `total` and the number of
 * suites READ both matter: a zero without its denominator is the shape this
 * rule's own header warns about.
 */
const SUMMARY = /\[check-branches\] (\d+) conditional check block\(s\) with no else, in (\d+) of (\d+) suite\(s\) read\./

/*
 * EVERY FIXTURE DECLARES `EXPECTED_CHECKS`, because the checker enforces that
 * too and a fixture without one fails for a reason that has nothing to do with
 * the case being made. Prepended here rather than in nine string literals: a
 * fixture that has to repeat boilerplate is a fixture somebody will forget to
 * update.
 */
const DECLARES =
  'const EXPECTED_CHECKS = 1\n' +
  // Declaring it is not enough: the checker also requires it to be COMPARED,
  // and compared with `!==` rather than a range. A fixture missing either
  // fails for a reason that has nothing to do with the case being made.
  'if (ran !== EXPECTED_CHECKS) process.exitCode = 1\n'

const run = (files, { env = {}, checker = CHECKER } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'branches-'))
  try {
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), DECLARES + body)
    const r = spawnSync(process.execPath, [checker], {
      encoding: 'utf8',
      env: { ...process.env, SUITE_DIR: dir, ...env },
    })
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
    const m = out.match(SUMMARY)
    return {
      code: r.status,
      out,
      total: m ? +m[1] : null,
      flagged: m ? +m[2] : null,
      read: m ? +m[3] : null,
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// Every fixture sets the ratchet to 0 unless it says otherwise, so a finding is
// a failure and the exit code is part of what is being asserted.
const AT_ZERO = { BRANCHES_MAX: '0' }

console.log('\n▶ the shape the rule is for')

{
  const res = run(
    {
      'guarded.mjs': ['if (dockThere) {', "  chk(await visible('ai-dock'), 'the dock is there', 'no dock')", '}', ''].join('\n'),
    },
    { env: AT_ZERO },
  )
  chk(res.total === 1, 'an if whose body calls chk, with no else, is one block', `it counted ${res.total}`)
  chk(res.read === 1, 'and the zero carries its denominator — one suite read', `it said ${res.read} suite(s) read`)
  chk(res.out.includes('guarded.mjs'), 'named by file', 'the row did not name the file')
  chk(res.code !== 0, 'and a finding over the ratchet exits non-zero', `it exited ${res.code}`)
}

console.log('\n▶ what is NOT a finding')

chk(
  run(
    {
      'balanced.mjs': [
        'if (dockThere) {',
        "  chk(await visible('ai-dock'), 'the dock is there', 'no dock')",
        '} else {',
        "  chk(false, 'the dock is there', 'the page never offered one')",
        '}',
        '',
      ].join('\n'),
    },
    { env: AT_ZERO },
  ).total === 0,
  'an if with an else is balanced — the two paths are comparable',
  'a balanced branch was reported',
)

chk(
  run(
    { 'nocheck.mjs': ['if (ready) {', '  await page.goto(url)', '}', ''].join('\n') },
    { env: AT_ZERO },
  ).total === 0,
  'an if whose body asserts NOTHING cannot make the run length conditional',
  'an if with no check in it was reported',
)

chk(
  run(
    { 'single.mjs': ["if (ready) await page.goto(url)", ''].join('\n') },
    { env: AT_ZERO },
  ).total === 0,
  'and the single-statement form carries no check in this directory',
  'a braceless if was reported',
)

console.log('\n▶ the brace matcher, which is the fragile part')

chk(
  run(
    {
      'nested.mjs': [
        'if (outer) {',
        '  if (inner) {',
        '    await page.goto(url)',
        '  }',
        "  chk(ok, 'a thing', 'no thing')",
        '}',
        '',
      ].join('\n'),
    },
    { env: AT_ZERO },
  ).total === 1,
  'a nested block does not end the outer body early — the chk after it still counts',
  'the brace matcher stopped at the inner block',
)

chk(
  run(
    {
      'elsewhere.mjs': [
        'if (a) {',
        '  await page.goto(url)',
        '}',
        "chk(ok, 'outside the block', 'no')",
        '',
      ].join('\n'),
    },
    { env: AT_ZERO },
  ).total === 0,
  'and it does not run PAST the closing brace and claim the check below it',
  'a check outside the block was counted as inside it',
)

chk(
  run(
    {
      'wrapped.mjs': [
        'if (someConditionThatIsRatherLong) ',
        '{',
        "  chk(ok, 'a thing', 'no thing')",
        '}',
        '',
      ].join('\n'),
    },
    { env: AT_ZERO },
  ).total === 1,
  'a brace on the NEXT line is still the block — the whitespace skip is what finds it',
  'an if whose brace wrapped was missed entirely',
)

console.log('\n▶ the denominator floor, which is what makes the zero a claim')

{
  // The floor is what makes the zero a claim rather than a number, so it is
  // raised above what this fixture can supply instead of emptying SUITE_DIR —
  // an unreadable directory would throw, which is a different failure.
  const res = run({ 'one.mjs': "chk(ok, 'a', 'b')\n" }, { env: { ...AT_ZERO, BRANCHES_MIN_SUITES: '5' } })
  chk(
    res.code !== 0 && /below the\s+floor|floor of 5/s.test(res.out),
    'with fewer suites than the floor it refuses rather than printing a clean zero',
    `it exited ${res.code} without naming the floor`,
  )
}

console.log('\n▶ the ratchet')

chk(
  run(
    { 'one.mjs': ["if (a) {", "  chk(ok, 'x', 'y')", '}', ''].join('\n') },
    { env: { BRANCHES_MAX: '1' } },
  ).code === 0,
  'a count at the ratchet passes',
  'a count equal to the ratchet was treated as a rise',
)

chk(
  run(
    {
      'two.mjs': [
        'if (a) {',
        "  chk(ok, 'x', 'y')",
        '}',
        'if (b) {',
        "  chk(ok, 'p', 'q')",
        '}',
        '',
      ].join('\n'),
    },
    { env: { BRANCHES_MAX: '1' } },
  ).code !== 0,
  'and a count above it does not',
  'a rise above the ratchet was allowed',
)

const MIN_CASES = 12
if (pass + fail < MIN_CASES) {
  console.error(
    `\n[branches-cases] only ${pass + fail} case(s) ran, below the floor of ${MIN_CASES}. ` +
      'A case file with its cases deleted passes; this line is what stops it saying so.',
  )
  fail += 1
}

console.log(
  `\n${fail === 0 ? '\x1b[32mok\x1b[0m' : '\x1b[31mnot ok\x1b[0m'} branches-cases: ` +
    `${pass} case(s) held, ${fail} did not`,
)

if (process.argv.includes('--mutate')) {
  fail += proveMutationsBite({
    subject: join(HERE, 'check-suite-check-branches.mjs'),
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'BRANCHES_CHECKER',
    label: 'the conditional-check rule',
    // It walks a fixture directory or it does not; a mutant that cannot start
    // is caught by the named-case guard, but asking directly names the error.
    alive: (mutant) => {
      const dir = mkdtempSync(join(tmpdir(), 'branches-alive-'))
      try {
        writeFileSync(join(dir, 'x.mjs'), "chk(ok, 'a', 'b')\n")
        const r = spawnSync(process.execPath, [mutant], {
          encoding: 'utf8',
          timeout: 30_000,
          env: { ...process.env, SUITE_DIR: dir, BRANCHES_MAX: '0' },
        })
        return { ok: SUMMARY.test(`${r.stdout ?? ''}${r.stderr ?? ''}`), why: (r.stderr ?? '').trim() }
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
    mutations: [
      ['the else test stops sparing a balanced branch', "if (/^\\s*else\\b/.test(src.slice(block.end, block.end + 40))) continue", 'if (false) continue'],
      ['an if with no check in it becomes a finding', 'if (!CHECK_CALL.test(block.body)) continue', 'if (false) continue'],
      /*
       * THE WHITESPACE SKIP, not the braceless guard beside it. Removing the
       * guard reddens nothing and that is not a gap: with it gone the brace
       * matcher starts on a non-brace, its depth never rises, and it returns an
       * empty body — which contains no check and so cannot become a finding.
       * A mutation has to be able to produce a WRONG ANSWER, and that one
       * cannot. The skip is the part that decides whether a wrapped brace is
       * seen at all.
       */
      ['a brace on the next line stops being found', "while (i < src.length && /\\s/.test(src[i])) i++\n  if (src[i] !== '{') return null", "if (src[i] !== '{') return null"],
      ['the block body stops at the first nested brace', "else if (src[i] === '}') depth--", "else if (src[i] === '}') depth = 0"],
      ['the denominator floor stops refusing an empty scan', 'if (suiteList.length < MIN_SUITES) {', 'if (false) {'],
      ['the ratchet stops holding', 'if (total > BASELINE) {', 'if (false) {'],
    ],
  })
}

if (fail) {
  console.error(`\n[branches-cases] ${fail} case(s) did not hold:`)
  for (const f of failures) console.error(`  · ${f}`)
  process.exitCode = 1
}
