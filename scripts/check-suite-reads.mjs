#!/usr/bin/env node
/*
 * RULE SIX, BROKEN ON PURPOSE.
 *
 * The rule says: a throwing read on a testid locator inside a `chk` MESSAGE is
 * a section ender, because a message is evaluated whether the check passes or
 * fails and so no `&&` in the condition can spare it. It found seventeen sites
 * across thirteen suites, all fixed, and it is now a gate — which means the
 * answer it gives when the tree is clean is ZERO, and zero is the number this
 * whole audit has learnt not to take on trust. "0 failed is not it ran."
 *
 * So each case below is written so that DELETING the line it is about changes
 * the answer. Two of them were the reason for pulling the reader out of the
 * checker at all:
 *
 *   · `.slice(2)` is the rule. Without it, every guarded condition in the tree
 *     reports as a defect; the case "a read in the CONDITION is not this rule"
 *     is what says so.
 *   · `topLevelArgs` has to skip commas inside nested calls AND inside strings,
 *     and getting either wrong shifts an argument's index UP — which walks a
 *     condition read into the message's range and reports it. Both cases put
 *     two commas in front of the read, because one comma only moves it to index
 *     1, which `.slice(2)` drops either way and so proves nothing.
 *
 *   node scripts/check-suite-reads.mjs
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { proveMutationsBite } from './lib/mutate.mjs'

/*
 * DYNAMIC, so `--mutate` can aim these cases at a broken copy. This is rule
 * six's reader, and rule six GATES — a reader that quietly stopped finding
 * anything would report 0 sites forever and read as a clean tree.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const SUBJECT = process.env.SUITE_READS_LIB ?? './lib/suite-reads.mjs'
const { messageReads, topLevelArgs, THROWS, locatorVars, locatorTestIds, withLocatorsResolved, checkSpanLines } =
  await import(SUBJECT)

let pass = 0
let fail = 0
const chk = (cond, good, bad) => {
  if (cond) {
    pass += 1
    console.log(`  \x1b[32mPASS\x1b[0m ${good}`)
  } else {
    fail += 1
    console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`)
  }
}

console.log('\n▶ the shape the rule is for')

/*
 * BOTH MESSAGE ARGUMENTS. `chk(cond, good, bad)` is an ordinary call, so all
 * three are evaluated before `chk` runs: a throwing read in the PASS sentence
 * throws exactly as surely as one in the failure reason. The reader started at
 * index 2 and nothing pinned that, so narrowing it back reddens nothing —
 * which is how `--mutate` found this.
 */
chk(
  messageReads(`chk(ok, \`saw \${await page.getByTestId('t').innerText()}\`, 'why')`).length === 1,
  'a throwing read in the PASS sentence is a site too — every argument is evaluated',
  'a read in the second argument was not seen',
)
chk(
  messageReads(`chk(await page.getByTestId('t').innerText(), 'l', 'w')`).length === 0,
  'but the CONDITION is not this rule — rule seven owns it, and an `&&` can short-circuit there',
  'the condition was reported as a message read',
)

chk(
  messageReads(
    `chk(
      ok,
      'a label',
      \`the card read \${JSON.stringify((await page.getByTestId('ai-model-hint-fast').innerText()).trim())}\`,
    )`,
  ).length === 1,
  'a read in the message is one site',
  'the shape rule six was written for was not reported',
)

chk(
  messageReads(`chk(ok, 'l', \`\${await page.getByTestId('t').innerText()}\`)`)[0]?.verb ===
    'innerText',
  'and it names the verb it found',
  'the site came back without the verb, so a row could not say what to bound',
)

chk(
  messageReads(
    `// line one\n// line two\nchk(ok, 'l', \`\${await page.getByTestId('t').innerText()}\`)`,
  )[0]?.line === 3,
  'and the line the `chk` opens on',
  'the line number did not point at the chk',
)

console.log('\n▶ and the three shapes it is NOT for')

chk(
  messageReads(
    `chk((await page.getByTestId('t').innerText()) === 'x', 'a label', 'a plain message')`,
  ).length === 0,
  'a read in the CONDITION is not this rule — that is what `&&` can guard',
  'a condition read was reported as a message read: `.slice(2)` is not doing anything',
)

chk(
  messageReads(
    `chk(ok, 'l', \`\${await page.getByTestId('t').innerText().catch(() => null)}\`)`,
  ).length === 0,
  'a message read that already catches is not a site',
  'a caught read was reported, which would make the fix unfixable',
)

chk(
  messageReads(`chk(ok, 'l', \`\${await page.getByTestId('t').count()} row(s)\`)`).length === 0,
  '`count()` in a message is not a site — it answers 0 rather than throwing',
  '`count()` was reported, and bounding it would be busywork',
)

chk(
  messageReads(`chk(ok, 'l', \`\${(await page.locator('main').innerText()).trim()}\`)`).length === 0,
  'and a read on something that is not a testid is left alone',
  'a read on `main` was reported — the element a suite cannot remove',
)

console.log('\n▶ a locator held in a VARIABLE is still a locator')

chk(
  messageReads(
    `const section = page.getByTestId('s')\nchk(ok, 'l', \`it said \${await section.getAttribute('data-count')}\`)`,
  ).length === 1,
  'a variable assigned from getByTestId is tracked, and a read on it in a message is a site',
  'the shape `sidebar-dms-1-no-section` ended a run at 10 of 14 on was not reported',
)

chk(
  messageReads(
    `const box = page.locator('[data-testid="b"]')\nchk(ok, 'l', \`it read \${await box.inputValue()}\`)`,
  ).length === 1,
  'and one assigned from page.locator too',
  'only getByTestId was tracked, so half the suites write this shape invisibly',
)

chk(
  messageReads(
    `const section = page.getByTestId('s')\nchk((await section.getAttribute('x')) === 'y', 'l', 'plain')`,
  ).length === 0,
  'a variable read only in the CONDITION is not this rule — that is what `&&` can guard',
  'a condition read on a variable was reported, which is the false-positive class rule six avoids',
)

chk(
  messageReads(
    `const n = someNumber()\nchk(ok, 'l', \`it was \${await n.getAttribute('x')}\`)`,
  ).length === 0,
  'and a variable NOT assigned from a locator factory is left alone',
  'any identifier with a matching method name was treated as a locator — a rule to argue with',
)

chk(
  messageReads(
    `const section = page.getByTestId('s')\nchk(ok, 'l', \`\${await section.getAttribute('x').catch(() => null)}\`)`,
  ).length === 0,
  'a caught read on a variable is not a site',
  'a caught variable read was reported, which would make the fix unfixable',
)

chk(
  [...locatorVars(`const a = page.getByTestId('x')\nconst b = page2.locator('y')\nlet c = await page.getByRole('button')`)].length === 3,
  'locatorVars finds const, let, a numbered page, and an awaited factory',
  'a locator assignment shape the suites actually use was missed',
)

console.log('\n▶ the comma splitter, which decides which argument is which')

chk(
  topLevelArgs("a, 'b, c', d").length === 3,
  'a comma inside a string is not an argument boundary',
  `"a, 'b, c', d" split into ${topLevelArgs("a, 'b, c', d").length} argument(s), not 3`,
)

chk(
  topLevelArgs('a, f(b, c), d').length === 3,
  'nor is one inside a nested call',
  `'a, f(b, c), d' split into ${topLevelArgs('a, f(b, c), d').length} argument(s), not 3`,
)

chk(
  topLevelArgs('a, [b, c], {d: 1, e: 2}').length === 3,
  'nor one inside an array or an object literal',
  'a bracket or a brace was counted as flat, so a message holding a list becomes two arguments',
)

chk(
  topLevelArgs("a, 'it\\'s', b").length === 3,
  'and an escaped quote does not end the string early',
  "an escaped quote ended the string, so everything after \"it's\" shifted an argument",
)

/*
 * THE TWO CASES THAT PROVE THE SPLITTER IS LOAD-BEARING, not merely tidy.
 *
 * Both put a read in the CONDITION behind TWO commas of the kind the splitter
 * has to see through. A splitter that misses them puts the read at argument
 * index 2 — inside the message's range — and the rule reports a guarded
 * condition as a defect. One comma would only move it to index 1, which
 * `.slice(2)` drops whatever the splitter does, so a one-comma case would pass
 * with the skipping deleted and prove nothing.
 */
chk(
  messageReads(
    `chk(f(a, b, c) && (await page.getByTestId('t').innerText()) === 'x', 'l', 'plain')`,
  ).length === 0,
  'a condition read behind two commas of a nested call stays a condition read',
  'depth blindness walked a condition read into the message range and reported it',
)

chk(
  messageReads(
    `chk(x === 'a, b, c' && (await page.getByTestId('t').innerText()) === 'y', 'l', 'plain')`,
  ).length === 0,
  'and behind two commas inside a string',
  'string blindness walked a condition read into the message range and reported it',
)

console.log('\n▶ a call this cannot read is not a call it guesses at')

chk(
  messageReads(`chk(ok, 'l', \`\${await page.getByTestId('t').innerText()}\``).length === 0,
  'an unbalanced `chk(` is skipped rather than half-parsed',
  'a truncated call was scanned anyway, on an argument list that was invented',
)

chk(
  (() => {
    try {
      messageReads('chk(')
      return true
    } catch {
      return false
    }
  })(),
  'and a bare `chk(` at the end of a file does not throw',
  'the reader crashed on a truncated file instead of reporting nothing',
)

console.log('\n▶ the verb list')

chk(
  !THROWS.test('.count()'),
  '`count` is absent from it, on purpose',
  '`count` is in the throwing-verb list, and it answers 0 rather than throwing',
)

chk(
  ['innerText', 'textContent', 'inputValue', 'isDisabled', 'isEnabled', 'isChecked', 'isEditable', 'getAttribute', 'boundingBox']
    .every((v) => THROWS.test(`.${v}(`)),
  'and every verb that waits for its element is in it',
  'a verb that throws on an absent element is missing from the list',
)

/*
 * AND A FLOOR ON THE CASE COUNT. `17 case(s) held, 0 did not` is what this
 * prints when it works; `0 case(s) held, 0 did not` is what it would print with
 * every case deleted, and it exited 0 either way. The four older contract tests
 * had the same hole and the ledger had described it as protection.
 *
 * Measured 22 September: 17 cases. A floor, because the set grows.
 */
console.log('\n▶ locator variables, written out for the line rules')

{
  const src = [
    "const opener = page.getByTestId('thread-open')",
    "const first = page.getByTestId('row').first()",
    "const inner = page.locator('[data-testid=\"row\"] a')",
    "const wide = page.getByTestId('row').locator('button')",
    "// then opener.click() in a comment",
    "await opener.click()",
    "await first.fill('x')",
  ].join('\n')
  const ids = locatorTestIds(src)
  chk(ids.get('opener') === 'thread-open' && ids.get('first') === 'row', 'a variable assigned from one testid is resolved, `.first()` included', `resolved ${JSON.stringify([...ids])}`)
  chk(!ids.has('inner') && !ids.has('wide'), 'one assigned from a wider selector is not — it is not that element', `resolved ${JSON.stringify([...ids])}`)
  const out = withLocatorsResolved(src)
  chk(out[5] === "await page.getByTestId('thread-open').click()" && out[6] === "await page.getByTestId('row').fill('x')", 'a use is written out as its testid', JSON.stringify(out.slice(5)))
  chk(out[0] === "const opener = page.getByTestId('thread-open')", 'the declaration itself is left alone', out[0])
  chk(out[4] === '// then opener.click() in a comment', 'and a comment that mentions one is prose, not a read', out[4])
}
{
  const lines = [
    "chk(",
    "  (await rows.count()) === 1",
    "    && (await page.getByTestId('h').getAttribute('x')) === 'y',",
    "  'a header', 'none',",
    ")",
    "await page.getByTestId('h').click()",
  ]
  const inside = checkSpanLines(lines)
  chk(inside.has(1) && inside.has(2) && inside.has(4), "a multi-line check's continuation lines are the check's", JSON.stringify([...inside]))
  chk(!inside.has(0) && !inside.has(5), 'and neither its first line nor the statement after it are', JSON.stringify([...inside]))
}

let short = false
/*
 * AND THAT EACH CASE BITES. The floor below catches an empty case file; it
 * cannot catch a reader that has stopped reading. Each mutation is a way this
 * module could go quiet — and going quiet is the dangerous direction, because
 * rule six reports 0 sites on a clean tree either way.
 */
if (process.argv.includes('--mutate')) {
  fail += proveMutationsBite({
    subject: join(HERE, 'lib/suite-reads.mjs'),
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'SUITE_READS_LIB',
    label: "rule six's reader",
    alive: (mutant) => {
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(mutant)})`], {
        encoding: 'utf8',
        timeout: 30_000,
      })
      return { ok: r.status === 0, why: (r.stderr ?? '').trim() }
    },
    mutations: [
      ['the comma splitter stops counting square brackets', "else if ('([{'.includes(c)) depth += 1", "else if ('({'.includes(c)) depth += 1"],
      ['the comma splitter stops skipping strings', "if (c === \"'\" || c === '\"' || c === '`') quote = c", 'if (false) quote = c'],
      ['an escaped quote ends a string early', "if (c === quote && inner[i - 1] !== '\\\\') quote = null", 'if (c === quote) quote = null'],
      ['the reader goes back to skipping the PASS sentence', 'topLevelArgs(src.slice(paren + 1, end)).slice(1)', 'topLevelArgs(src.slice(paren + 1, end)).slice(2)'],
      ['the reader starts at the CONDITION, which rule seven owns', 'topLevelArgs(src.slice(paren + 1, end)).slice(1)', 'topLevelArgs(src.slice(paren + 1, end)).slice(0)'],
      ['a locator variable stops counting as a read', '!readsAVar(arg)', 'true'],
      ['a variable from a wider selector is resolved as if it were the element', ")(?:\\s*\\.\\s*(?:first|last)\\(\\)|\\s*\\.\\s*nth\\(\\d+\\))?\\s*$/gm", ")/gm"],
      ['a comment is read as code again', "if (/^\\s*(?:\\*|\\/\\/)/.test(line)) return line", ''],
      ["a check's continuation lines stop being the check's", 'for (let l = first + 1; l <= last; l++) inside.add(l)', ''],
      ['a testid spelling stops counting as a read', '/getByTestId\\(|data-testid/.test(arg)', 'false'],
      ['isDisabled stops being a throwing read', '/\\.(innerText|textContent|inputValue|isDisabled', '/\\.(innerText|textContent|inputValue'],
    ],
  })
}

const MIN_CASES = 20
if (pass + fail < MIN_CASES) {
  console.error(
    `\n[suite-reads] only ${pass + fail} case(s) ran, below the floor of ${MIN_CASES}. A case file ` +
      'that asserts nothing passes; this line is what stops it saying so.',
  )
  short = true
}

console.log(
  `\n${fail === 0 ? '\x1b[32mok\x1b[0m' : '\x1b[31mnot ok\x1b[0m'} suite-reads: ` +
    `${pass} case(s) held, ${fail} did not`,
)
process.exitCode = fail === 0 && !short ? 0 : 1
