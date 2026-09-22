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
import { messageReads, topLevelArgs, THROWS } from './lib/suite-reads.mjs'

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

console.log(
  `\n${fail === 0 ? '\x1b[32mok\x1b[0m' : '\x1b[31mnot ok\x1b[0m'} suite-reads: ` +
    `${pass} case(s) held, ${fail} did not`,
)
process.exit(fail === 0 ? 0 : 1)
