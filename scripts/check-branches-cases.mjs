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
 * Its own header already makes the argument: it says "every verdict below is a
 * zero", and it grew a suite-count floor precisely because a scan that reads
 * nothing prints the same zero as a scan that reads everything. The floor
 * answers "did it read anything?". It cannot answer "would it notice?", which
 * is what these cases are for.
 *
 * AND IT DID NOT NOTICE, which is why the cases below the first fourteen
 * exist. With every one of those passing, the rule read 0 over a tree holding
 * a 9-vs-8 `else`, a chain of four against one `bad()`, and three checks
 * against a `console.log('SKIP …')` — because it asked only whether an `else`
 * EXISTED, and only saw `chk(` and `check(`. Fourteen cases, all green, for a
 * rule that could not see the shape it was named for: the fixtures had been
 * written in the rule's own vocabulary. Run against that rule, 25 of the 39
 * below fail. The new ones are written in the SUITES' vocabulary — `bad()`,
 * `skip()`, chains, `.rest()`, loops, wrappers — and each is paired with the
 * balanced twin that must NOT be a finding, so a mutation that counts
 * everything is caught as surely as one that counts nothing.
 *
 * NO REFACTOR. The rule stays a loop over text; this points it at a directory
 * of fixture suites through `SUITE_DIR` and asserts on what it prints.
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
const UNEQUAL = /\[check-branches\] (\d+) of (\d+) if\/else pair\(s\) report different numbers of checks/
const LITERAL = /\[check-branches\] (\d+) loop\(s\) report a literal count of checks/
const ON_CATCH = /\[check-branches\] (\d+) check\(s\) are reported from a \.catch callback/

/*
 * EVERY FIXTURE DECLARES `EXPECTED_CHECKS`, because the checker enforces that
 * too and a fixture without one fails for a reason that has nothing to do with
 * the case being made. Prepended here rather than in every string literal: a
 * fixture that has to repeat boilerplate is a fixture somebody will forget to
 * update.
 */
const DECLARES =
  'const EXPECTED_CHECKS = 1\n' +
  // Declaring it is not enough: the checker also requires it to be COMPARED,
  // and compared with `!==` rather than a range. A fixture missing either
  // fails for a reason that has nothing to do with the case being made.
  'if (ran !== EXPECTED_CHECKS) process.exitCode = 1\n'

// The reporters the suites define, as the suites define them. `ok`, `bad` and
// `skip` count because their bodies push a result — see the predicate case.
const REPORTERS = [
  'const results = []',
  "const ok = (m) => { results.push(1); console.log(`  \\x1b[32mPASS\\x1b[0m ${m}`) }",
  "const bad = (m) => { results.push(0); console.log(`  \\x1b[31mFAIL\\x1b[0m ${m}`) }",
  "const skip = (m, why) => { results.push([m, 'skip']); console.log(`  SKIP ${m} — ${why}`) }",
  'const chk = (c, g, b) => (c ? ok(g) : bad(b))',
  'const chain = makeChain(chk, skip)',
  '',
].join('\n')

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
    const num = (re) => {
      const x = out.match(re)
      return x ? +x[1] : null
    }
    return {
      code: r.status,
      out,
      total: m ? +m[1] : null,
      flagged: m ? +m[2] : null,
      read: m ? +m[3] : null,
      unequal: num(UNEQUAL),
      pairs: (() => {
        const x = out.match(UNEQUAL)
        return x ? +x[2] : null
      })(),
      literal: num(LITERAL),
      onCatch: num(ON_CATCH),
      unsettled: /could not settle/.test(out),
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
// One fixture file in the suites' own vocabulary.
const suite = (lines) => ({ 'suite.mjs': REPORTERS + lines.join('\n') + '\n' })
const nothing = (r) => r.total === 0 && r.unequal === 0 && r.literal === 0 && r.onCatch === 0

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

// Playwright's `.check()` ticks a checkbox; it is not the suite's helper. A
// conditional tick asserts nothing, and read as a check it would be reported
// as a run whose length depends on the branch.
chk(
  run(
    { 'tick.mjs': ['if (terms) {', "  await page.getByTestId('agree').check()", '}', ''].join('\n') },
    { env: AT_ZERO },
  ).total === 0,
  "a conditional `.check()` on a checkbox is not a conditional check",
  'a checkbox tick inside an if was reported as a check',
)

chk(
  run(
    { 'single.mjs': ["if (ready) await page.goto(url)", ''].join('\n') },
    { env: AT_ZERO },
  ).total === 0,
  'and the single-statement form with nothing in it is nothing',
  'a braceless if with no check was reported',
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
  'a brace on the NEXT line is still the block',
  'an if whose brace wrapped was missed entirely',
)

/*
 * CODE, NOT TEXT. A sentence that mentions `chk(`, a comment citing `bad(`
 * at a line number, a `{` in a regex and a `}` in a template are the four
 * ways a count over raw text goes wrong — the first two invent checks, the
 * last two end a block early. Each side here reports ONE check.
 */
chk(
  nothing(
    run(
      suite([
        'if (x) {',
        "  // bad('this comment is not a check') — nor is chk(",
        '  const re = /\\{[a-z]{2}\\}/',
        "  chk(re.test(s), `the value ${JSON.stringify({ a: { b: 1 } })} matches`, 'it calls chk(a) and bad(b) in its sentence')",
        '} else {',
        "  bad('no value to match')",
        '}',
      ]),
      { env: AT_ZERO },
    ),
  ),
  'a chk( in a sentence or a comment is not a check, and a { in a regex or a template is not a block',
  'text in a string, comment, regex or template was read as code',
)

console.log('\n▶ counting: every reporter the suites use')

// THE CASE THE LEDGER ASKED FOR: an else that reports through `bad()` only.
chk(
  nothing(run(suite(['if (x) {', "  chk(a, 'the one check', 'no')", '} else {', "  bad('the one check — there was no x')", '}']), { env: AT_ZERO })),
  'an else that reports through bad() alone is counted: one against one is balanced',
  'a bad()-only else was read as reporting nothing',
)
{
  const res = run(
    suite(['if (x) {', "  chk(a, 'first', 'no')", "  chk(b, 'second', 'no')", '} else {', "  bad('no x to check')", '}']),
    { env: AT_ZERO },
  )
  chk(res.unequal === 1 && /reports 2 · else \(line \d+\) reports 1/.test(res.out), 'and two against one bad() is a finding, with both counts named', `unequal=${res.unequal}`)
}

// THE OTHER CASE IT ASKED FOR: nine against a loop of eight — 3a4f426's drift.
{
  const nine = Array.from({ length: 9 }, (_, i) => `  chk(c${i}, 'check ${i}', 'no')`)
  const res = run(suite(['if (geometry) {', ...nine, '} else {', "  for (let i = 0; i < 8; i++) bad('no chip geometry to measure')", '}']), { env: AT_ZERO })
  chk(res.unequal === 1 && /reports 9 · else \(line \d+\) reports 8/.test(res.out), 'nine against a loop of eight is a finding, 9 · 8', `unequal=${res.unequal}`)
  chk(res.literal === 1, 'and the loop of eight is a re-typed count on its own', `literal=${res.literal}`)
  const matched = run(suite(['if (geometry) {', ...nine, '} else {', "  for (let i = 0; i < 9; i++) bad('no chip geometry to measure')", '}']), { env: AT_ZERO })
  chk(
    matched.unequal === 0 && matched.literal === 1,
    'a loop of nine balances the count today and is STILL a finding — it is the number that drifts',
    `unequal=${matched.unequal} literal=${matched.literal}`,
  )
}

chk(
  run(suite(['if (x) {', "  chk(a, 'one', 'no')", "  chk(b, 'two', 'no')", "  chk(c, 'three', 'no')", '} else {', "  console.log('  SKIP  not exposed here')", '}']), { env: AT_ZERO }).unequal === 1,
  'three against a console.log SKIP is a finding — an uncounted skip reports nothing',
  'a console.log SKIP was taken for a counted one',
)
chk(
  nothing(run(suite(['if (x) {', "  chk(a, 'one', 'no')", '} else {', "  skip('one', 'no routable output here')", '}']), { env: AT_ZERO })),
  'and a COUNTED skip() is one check',
  'a counted skip() was not counted',
)

// Six suites define `ok` as a predicate, five of them on an HTTP status. Called
// inside a check it is a value, and counting it would make the side it is on
// one check longer.
chk(
  nothing(
    run(
      {
        'predicate.mjs': [
          'const ok = (res) => res.status >= 200 && res.status < 300',
          'const chk = (c, g, b) => console.log(c ? g : b)',
          'if (x) {',
          "  chk(ok(res), 'the write succeeded', `status ${res.status}`)",
          '} else {',
          "  chk(false, 'the write succeeded', 'nothing was written')",
          '}',
          '',
        ].join('\n'),
      },
      { env: AT_ZERO },
    ),
  ),
  'an ok() that is a status predicate is not a check',
  'a predicate ok() was counted as a report',
)

console.log('\n▶ chains: .step is one, .rest fills to the declared length')

chk(
  nothing(
    run(
      suite([
        "const c = chain('there is a control', 'and pressing it works', 'and it stays pressed')",
        "c.step(have, 'no control')",
        "if (!have) c.rest('skipped: there was nothing to press')",
        'else {',
        "  c.step(await pressed(), 'it did nothing')",
        "  c.step(await stays(), 'it sprang back')",
        '}',
      ]),
      { env: AT_ZERO },
    ),
  ),
  'a braceless rest against two steps is balanced: the rest fills two of three',
  'a .rest() was not read as filling its chain',
)
{
  const res = run(
    suite([
      "const c = chain('there is a control', 'and pressing it works', 'and it stays pressed')",
      "c.step(have, 'no control')",
      "if (!have) c.rest('skipped: there was nothing to press')",
      "else c.step(await pressed(), 'it did nothing')",
    ]),
    { env: AT_ZERO },
  )
  chk(res.unequal === 1 && /c ends at 2 of 3 on one side and nothing after fills it/.test(res.out), 'and a side that forgets a step is a finding — nothing after it fills the chain', `unequal=${res.unequal}`)
}
chk(
  run(suite(['if (open) {', "  const d = chain('a', 'b', 'c', 'd')", '  d.step(p)', '  d.step(q)', '  d.step(r)', '  d.step(s)', '} else {', "  bad('the dialog never opened')", '}']), { env: AT_ZERO }).unequal === 1,
  'a chain of four declared on one side against one bad() is a finding',
  'a chain declared inside a branch was not counted',
)
// THE AMOUNT a `.rest()` fills, which only shows where the chain is declared
// on the side being counted: one step and a rest is the chain's whole length.
chk(
  nothing(
    run(
      suite([
        'if (open) {',
        "  const d = chain('it opens', 'it lists', 'it closes')",
        "  d.step(listed, 'nothing opened')",
        "  d.rest('skipped: it opened empty, so nothing could be listed or closed')",
        '} else {',
        "  bad('it opens — never opened'); bad('it lists — never opened'); bad('it closes — never opened')",
        '}',
      ]),
      { env: AT_ZERO },
    ),
  ),
  'a chain of three stepped once and then stopped with .rest() reports three — against three bad() it is balanced',
  'a .rest() filled the wrong number of checks',
)
{
  const res = run(
      suite([
        "const bg = chain('a picker', 'with swatches', 'that paint', 'and survive the join')",
        "bg.step(hasPicker, 'no picker')",
        'if (hasPicker) {',
        "  bg.step(swatches > 2, 'too few')",
        "  bg.step(painted, 'nothing painted')",
        '}',
        'if (hasPicker && joined) {',
        "  bg.step(carried, 'the call ignored it')",
        '} else {',
        "  bg.rest('skipped: nothing was chosen to carry')",
        '}',
      ]),
      { env: AT_ZERO },
    )
  chk(
    nothing(res) && !res.unsettled,
    'an if with no else that only steps a chain a later .rest() completes is balanced, and settled — syncup-live\'s bgChain',
    res.unsettled ? 'the later fill, from a place the flow lost, was left unsettled' : 'a chain completed further down was reported as short',
  )
}
chk(
  run(suite(["const bg = chain('a picker', 'with swatches', 'that paint')", "bg.step(hasPicker, 'no picker')", 'if (hasPicker) {', "  bg.step(swatches > 2, 'too few')", "  bg.step(painted, 'nothing painted')", '}']), { env: AT_ZERO }).total === 1,
  'and the same if with nothing after it is a finding — the sentences it skipped are never reported',
  'a chain left short was not reported',
)
// ui-sweep's board: the inner else reports through a counted skip() where the
// other side steps the chain, and the chain's `.rest()` is in the OUTER else —
// later in the text, and never run after the inner `if`.
chk(
  nothing(
    run(
      suite([
        "const board = chain('the board renders its columns', 'clicking a card opens the task')",
        'if (haveTab) {',
        "  board.step(rendered, 'no columns')",
        '  if (haveCard) {',
        "    board.step(opened, 'the click was swallowed')",
        '  } else {',
        "    skip('no known card on the board to click', 'the board had none')",
        '  }',
        '} else {',
        "  board.rest('no Board view tab in the view strip')",
        '}',
      ]),
      { env: AT_ZERO },
    ),
  ),
  'a chain step against a counted skip() is one against one, and a .rest() in the other branch is not "after" it',
  'the board shape was reported',
)
// Only a FILL makes a difference up. A later step adds one on both paths, so
// the path that skipped a step is still one short after it.
chk(
  run(suite(["const bg = chain('a picker', 'with swatches', 'and it paints')", "bg.step(hasPicker, 'no picker')", 'if (hasPicker) {', "  bg.step(swatches > 2, 'too few')", '}', "bg.step(painted, 'nothing painted')"]), { env: AT_ZERO }).total === 1,
  'and a later .step() does not make it up — only a .rest() fills what a side skipped',
  'a later step was taken to fill the chain',
)

console.log('\n▶ what a suite builds its checks out of')

chk(
  nothing(
    run(
      suite([
        "const expectRow = (id) => chk(rows.has(id), `row ${id} is there`, 'no row')",
        'if (rows) {',
        '  expectRow(1)',
        '  expectRow(2)',
        '} else {',
        "  bad('row 1 is there — no rows')",
        "  bad('row 2 is there — no rows')",
        '}',
      ]),
      { env: AT_ZERO },
    ),
  ),
  "a suite's own function that reports counts what its body reports",
  'a reporting function was counted as nothing',
)
chk(
  nothing(
    run(
      suite([
        "const unread = chain('marked read', 'offers Mark unread', 'and it un-reads')",
        "const chainRest = (why) => unread.rest(why)",
        'if (!seeded) {',
        "  chainRest('skipped: nothing seeded')",
        '} else {',
        "  unread.step(read, 'still unread')",
        "  unread.step(offered, 'no way back')",
        "  unread.step(back, 'still read')",
        '}',
      ]),
      { env: AT_ZERO },
    ),
  ),
  'and a function that only calls .rest() fills the chain where it is called — panel-collapse\'s chainRest',
  'a .rest() behind a function was lost',
)
{
  const res = run(
    suite([
      'const same = (a, b) => Array.isArray(a) ? a.every((x, i) => same(x, b[i])) : a === b',
      'if (back) {',
      "  chk(same(back.rules, NESTED), 'the rules come back as saved', 'they did not')",
      '} else {',
      "  chk(false, 'the rules come back as saved', 'nothing came back')",
      '}',
    ]),
    { env: AT_ZERO },
  )
  chk(nothing(res) && !res.unsettled, 'a recursive predicate reports nothing, and is not a call it cannot count', res.unsettled ? 'it was left unsettled' : 'it was a finding')
}
chk(
  nothing(run(suite(['if (list) {', "  for (const v of ['List', 'Board', 'Table']) chk(seen.includes(v), `the ${v} view is offered`, 'no')", '} else {', "  bad('no List view'); bad('no Board view'); bad('no Table view')", '}']), { env: AT_ZERO })),
  'a loop over a literal list counts its items, and is data rather than a re-typed count',
  'a loop over a literal list was miscounted or flagged',
)
chk(
  run(
    suite([
      'if (x) {',
      "  chk(a, 'one', 'no')",
      '} else if (y) {',
      "  chk(b, 'one', 'no')",
      '} else {',
      "  bad('one — neither'); bad('two — neither')",
      '}',
    ]),
    { env: AT_ZERO },
  ).unequal === 1,
  'an else-if chain is compared arm by arm',
  'an unequal arm of an else-if chain was missed',
)

console.log('\n▶ a check that exists only when a call fails')

chk(
  run(suite(["await page.getByTestId('nav-item').click().catch(async () => bad('the item could not be pressed'))", "chk(done, 'the item is pressed', 'no')"]), { env: AT_ZERO }).onCatch === 1,
  'a bad() inside a .catch callback is a finding — it adds a check only when the click fails',
  'a check reported from a .catch was missed',
)

console.log('\n▶ a file it cannot read')

{
  const res = run({ 'truncated.mjs': ['if (x) {', "  chk(a, 'one', 'no')", ''].join('\n') }, { env: AT_ZERO })
  chk(
    res.code !== 0 && /could not be read/.test(res.out) && res.out.includes('truncated.mjs'),
    'a file whose brackets do not balance is refused by name, not read as having nothing in it',
    `it exited ${res.code} without naming the file`,
  )
}

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
chk(
  run(suite(['if (x) {', "  chk(a, 'one', 'no')", "  chk(b, 'two', 'no')", '} else {', "  bad('no x')", '}']), { env: { BRANCHES_MAX: '0' } }).code !== 0,
  'and an unequal pair counts towards it as surely as a missing else',
  'an unequal pair did not count towards the ratchet',
)

const MIN_CASES = 39
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
      ['an else stops being read', "const alt = wordAt(code, k) === 'else' ? statement(code, k + 4, to) : null", 'const alt = null'],
      ['a report stops being counted', "if (ev.kind === 'report') count = plusC(count, [sym(1)])", "if (ev.kind === 'report') count = plusC(count, [sym(0)])"],
      // The shared pattern without its dot exclusion: `.check(` is the helper.
      ['a method called `.check(` counts as a check', "import { CHECK_CALL } from './lib/check-call.mjs'", 'const CHECK_CALL = /\\b(chk|check)\\s*\\(/'],
      ['bad() stops being a reporter', "const EXTRA_REPORTERS = ['ok', 'bad', 'skip']", "const EXTRA_REPORTERS = ['ok', 'skip']"],
      ['a predicate ok() is counted as a check', '/\\.push\\(|\\bPASS\\b|\\bFAIL\\b|\\bSKIP\\b/.test(src.slice(defs.get(n).at, defs.get(n).end))', 'true'],
      ['comments and strings stop being blanked', "  return out.join('')\n}", '  return src\n}'],
      ['the block body stops at the first nested brace', '      depth -= 1\n      if (depth === 0) return j + 1', '      depth = 0\n      if (depth === 0) return j + 1'],
      ['.rest stops filling', 'const amount = Math.max(0, rec.length - rec.pos)', 'const amount = 0'],
      ['a chain\'s declared length is misread', '  if (/,\\s*$/.test(args)) n -= 1\n  return n', '  if (/,\\s*$/.test(args)) n -= 1\n  return n + 1'],
      ['unequal sides stop being reported', 'if ([...A, ...B].map(view).every(settledPhi)) report(', 'if (false) report('],
      ['a chain left short is taken as made up', 'if (unknownAmount || filledAfter(rec, s.end, env)) madeUp.add', 'if (true) madeUp.add'],
      ['a later .rest() stops making up a chain', 'if (unknownAmount || filledAfter(rec, s.end, env)) madeUp.add', 'if (unknownAmount || false) madeUp.add'],
      ['a fill from a lost place stops being taken as completing', 'if (unknownAmount || filledAfter(rec, s.end, env)) madeUp.add', 'if (false || filledAfter(rec, s.end, env)) madeUp.add'],
      ['the other side of an if counts as after it', '!elsewhere.some(([a, b]) => o >= a && o < b)', 'true'],
      ['a later .step() is taken to make up a chain', "    if (m[2] !== 'step') fillsOf.set", '    fillsOf.set'],
      ['a literal loop stops multiplying', 'return uniq(body.map((a) => timesSym(a, bound.n)))', 'return uniq(body.map((a) => timesSym(a, 1)))'],
      ['a re-typed loop count stops being reported', 'if (bound?.numeric && !isZeroC(body)) sink.literal.push', 'if (false) sink.literal.push'],
      ['a .catch callback stops being reported', "if (callee === '.catch') sink.onCatch.push", 'if (false) sink.onCatch.push'],
      ["a suite's own reporting functions stop being counted", '    if (callRe) {\n      for (const m of text.matchAll(callRe))', '    if (false) {\n      for (const m of text.matchAll(callRe))'],
      ['a function that reports nothing is kept as a call', 'for (const n of [...defs.keys()]) if (!reporting.has(n)) defs.delete(n)', ''],
      ['a file it cannot read is read anyway', 'if (badAt >= 0) return { unreadable: lineOf(badAt) }', ''],
      ['the denominator floor stops refusing an empty scan', 'if (suiteList.length < MIN_SUITES) {', 'if (false) {'],
      ['the ratchet stops holding', 'if (findings > BASELINE) {', 'if (false) {'],
    ],
  })
}

if (fail) {
  console.error(`\n[branches-cases] ${fail} case(s) did not hold:`)
  for (const f of failures) console.error(`  · ${f}`)
  process.exitCode = 1
}
