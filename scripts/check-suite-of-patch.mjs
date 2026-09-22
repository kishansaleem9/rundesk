#!/usr/bin/env node
/*
 * THE ATTRIBUTION CONTRACT, ASSERTED.
 *
 * `scripts/lib/suite-of-patch.mjs` decides which suite a break patch is about,
 * and four separate copies of that decision used to disagree — which is how 24
 * patches came out as "(no suite named)" in one report and attributed in
 * another. A shared module removes the disagreement; it does not by itself make
 * the one remaining answer right.
 *
 * So this pins the shape of every step, in both directions where a direction
 * exists. The suites are written into a temporary directory rather than read
 * from `test/e2e`, because an assertion about a real suite's sentence is an
 * assertion about a file somebody will edit, and a test that goes red when a
 * check is reworded is a test people delete.
 *
 * THE ONE THAT MATTERS MOST is the truncation: `# Reddens: sidebar-dms "…"`
 * separates with a SPACE, and the regex this replaces matched `sidebar` and
 * treated the hyphen as its delimiter. A suite name silently cut at the first
 * hyphen is the shape of every confident-wrong answer in this audit.
 *
 * Break-tested three ways: drop the walk-back in step one, drop the `unit:`
 * guard in step three, and let step three answer when two suites match. Each
 * turns at least one line below red.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { proveMutationsBite } from './lib/mutate.mjs'

/*
 * DYNAMIC, so `--mutate` can aim these cases at a broken copy. This subject
 * answers "whose patch is this?", and two answers to that question is the
 * duplicated-list defect the audit keeps finding — every per-suite number
 * rests on it.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const SUBJECT = process.env.SUITE_OF_PATCH_LIB ?? './lib/suite-of-patch.mjs'
const { makeSuiteOf, declaresShortRun } = await import(SUBJECT)

const dir = mkdtempSync(join(tmpdir(), 'suite-of-patch-'))
let passed = 0
let failed = 0
let ran = 0
const is = (got, want, what) => {
  ran += 1
  if (got === want) {
    passed += 1
    console.log(`  \x1b[32mPASS\x1b[0m ${what}`)
  } else {
    failed += 1
    console.log(`  \x1b[31mFAIL\x1b[0m ${what} — got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`)
  }
}

try {
  writeFileSync(join(dir, 'sidebar-dms.mjs'), "check(x, 'the workspace tree has a Direct Messages section')\n")
  writeFileSync(join(dir, 'sidebar.mjs'), "check(x, 'a sidebar exists and it is not this one')\n")
  writeFileSync(join(dir, 'list-customize.mjs'), "chk(x, 'the open export dialog carries the plan caption')\n")
  writeFileSync(join(dir, 'ui-sweep.mjs'), "chk(x, 'each level carries a one-line meaning of its own')\n")
  writeFileSync(join(dir, 'other-sweep.mjs'), "chk(x, 'each level carries a one-line meaning of its own')\n")
  const candidates = ['sidebar-dms', 'sidebar', 'list-customize', 'ui-sweep', 'other-sweep']
  const suiteOf = makeSuiteOf({ suiteDir: dir, candidates })
  const bare = makeSuiteOf({ suiteDir: dir })

  console.log('\n1. step one: the suite the header names, whatever follows it')
  is(suiteOf('zzz-1', '# Reddens: sidebar-dms: "a"\n'), 'sidebar-dms', 'a colon')
  is(suiteOf('zzz-1', '# Reddens: sidebar-dms — "a"\n'), 'sidebar-dms', 'an em dash')
  is(suiteOf('zzz-1', '# Reddens: sidebar-dms, "a"\n'), 'sidebar-dms', 'a comma')
  is(
    suiteOf('zzz-1', '# Reddens: sidebar-dms "the workspace tree has a Direct Messages section"\n'),
    'sidebar-dms',
    'and a bare SPACE before the quote — the shape that used to truncate',
  )

  console.log('\n2. and it does not answer with a shorter name that happens to exist')
  // `sidebar.mjs` is right there, so a walk-back that ran unconditionally, or a
  // regex that treated the hyphen as a delimiter, would answer `sidebar` — a
  // real file, a real-looking answer, and the wrong suite.
  is(
    suiteOf('sidebar-dms-1-no-section', '# Reddens: sidebar-dms "a"\n'),
    'sidebar-dms',
    'the longest name that exists wins over its own prefix',
  )
  is(
    suiteOf('zzz-1', '# Reddens: sidebar-dms-nonesuch: "a"\n'),
    'sidebar-dms',
    'and an unknown suffix walks back only as far as something real',
  )
  is(suiteOf('zzz-1', '# Reddens: nothing-like-this: "a"\n'), null, 'while a name with no real prefix is null')

  console.log('\n3. step two: the longest prefix of the filename')
  is(
    suiteOf('list-customize-10-no-caption', '# Reddens: "the open export dialog carries the plan caption"\n'),
    'list-customize',
    'a header that names no suite falls back to the filename',
  )
  is(suiteOf('acc-9-breakdown', '# Reddens: "something else entirely"\n'), null, 'and an abbreviated prefix does not')

  console.log('\n4. step three: the sentence decides, and only when it decides alone')
  is(
    suiteOf('tfc-1-whatever', '# Reddens: "the open export dialog carries the plan caption"\n'),
    'list-customize',
    'one suite holds the sentence',
  )
  is(
    suiteOf('tfc-1-whatever', '# Reddens: "each level carries a one-line meaning of its own"\n'),
    null,
    'two suites hold it, so it answers nothing rather than guessing',
  )
  is(
    bare('tfc-1-whatever', '# Reddens: "the open export dialog carries the plan caption"\n'),
    null,
    'and with no candidates step three is off, which is how claims uses it',
  )

  /*
   * A `Reddens:` BLOCK RUNS OVER MORE THAN ONE LINE, and nothing here covered
   * that until `--mutate` said so: deleting the loop that gathers the
   * continuation lines left every case green. Patches in the tree use the
   * shape — a second claim indented under the first — and
   * `task-cover-14-upload-commits-without-uploading` was written with it the
   * same day this gap was found.
   *
   * The sentence that decides is on the SECOND line, so a reader that stops at
   * the first attributes nothing.
   */
  is(
    suiteOf(
      'tfc-1-whatever',
      '# Reddens: some-suite: "a sentence no suite contains at all"\n' +
        '#          list-customize: "the open export dialog carries the plan caption"\n',
    ),
    'list-customize',
    'a claim on a CONTINUATION line of the block still decides',
  )

  console.log('\n5. a `unit:` claim is not attributed by a fragment of its sentence')
  // `aar-17-views-hardcoded` names a `*.test.ts` sentence that exists in no
  // suite, and step three attributed it to an e2e suite anyway, because
  // `findsClaim` falls back to a five-word fragment.
  is(
    suiteOf('tfc-1-whatever', '# Reddens: unit: some.test.ts "the open export dialog carries the plan caption"\n'),
    null,
    'a unit claim resolves to no e2e suite',
  )
  is(
    suiteOf('list-customize-9-caption', '# Reddens: unit: some.test.ts "anything at all"\n'),
    'list-customize',
    'though its own filename still places it, which is a convention and not a sentence',
  )

  console.log('\n6. and no Reddens line at all')
  is(suiteOf('zzz-1', '# just a comment\n'), null, 'is null rather than a throw')

  // A DECLARED SHORT RUN. `check-break-reddened.mjs` waives its length guard on
  // this line, so a patch that could set it by accident would have its own run
  // length stop being checked. The empty-value case is the one that matters:
  // `\s` after the colon matches the newline, and `# Expect:` alone would then
  // read as SHORT because the next line's first word happened to follow it.
  console.log('\n7. a patch that declares a short run')
  is(declaresShortRun('# Expect: SHORT\nimport io\n'), true, 'the marker is read')
  is(declaresShortRun('#   Expect:   SHORT\n'), true, 'and spacing around it does not matter')
  is(declaresShortRun('# Expect:\nSHORT anything\n'), false, 'a bare `# Expect:` declares nothing')
  is(declaresShortRun('# Expect: SHORTER\n'), false, 'and SHORTER is not SHORT')
  is(declaresShortRun('# Reddens: a: "b"\nimport io\n'), false, 'an ordinary patch declares nothing')
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.error('[suite-of-patch] the attribution contract is broken')
  process.exit(1)
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
 * AND THAT EACH CASE BITES. The three attribution steps are ordered on purpose
 * — the header, then the filename, then the sentence — and each mutation below
 * either removes a step or lets it answer where it should decline.
 */
if (process.argv.includes('--mutate')) {
  failed += proveMutationsBite({
    subject: join(HERE, 'lib/suite-of-patch.mjs'),
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'SUITE_OF_PATCH_LIB',
    label: 'the patch-to-suite attributor',
    alive: (mutant) => {
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(mutant)})`], {
        encoding: 'utf8',
        timeout: 30_000,
      })
      return { ok: r.status === 0, why: (r.stderr ?? '').trim() }
    },
    mutations: [
      ['step 1 stops reading the header', 'named(text) || byFilename(patchName)', 'byFilename(patchName)'],
      ['step 2 stops reading the filename', 'byFilename(patchName) || bySentence(text)', 'bySentence(text)'],
      ['step 3 answers even when two suites match', 'if (hits.length === 1) return hits[0]', 'if (hits.length >= 1) return hits[0]'],
      ['a `unit:` claim is attributed to an e2e suite again', "if (/^unit\\b/i.test(block)) return null", 'if (false) return null'],
      ['the header name stops being walked back to a suite that exists', 'if (has(n)) return n', 'return n'],
      ['a Reddens block stops carrying its continuation lines', 'for (let j = i + 1; j < lines.length && /^#\\s\\s+\\S/.test(lines[j]); j += 1) out.push(lines[j])', 'void lines'],
      ['`Expect: SHORT` matches with nothing after it', '/^#[ \\t]*Expect:[ \\t]*SHORT\\b/im', '/^#[ \\t]*Expect:/im'],
    ],
  })
}

const MIN_ASSERTIONS = 18
if (ran < MIN_ASSERTIONS) {
  console.error(
    `\n[suite-of-patch] only ${ran} assertion(s) ran, below the floor of ${MIN_ASSERTIONS}. ` +
      'A contract test that asserts nothing passes; this line is what stops it saying so.',
  )
  short = true
}
console.log(`[suite-of-patch] all ${ran} assertions hold`)
process.exitCode = failed === 0 && !short ? 0 : 1
