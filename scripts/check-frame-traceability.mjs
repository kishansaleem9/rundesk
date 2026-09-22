#!/usr/bin/env node
/*
 * EVERY FRAME OBSERVATION IS ANSWERED SOMEWHERE, AND SAYS WHERE.
 *
 * The method of this audit is one sentence: *the frames are the ground truth
 * and the transcript is the commentary*. That makes
 * `docs/video2-frame-observations.md` the specification, and the specification
 * has 115 timestamped observations in it.
 *
 * Nothing checked that they were all answered. The ledger reconciles its own
 * sections against each other — §4 against §2, the table against the paragraph
 * under it, the handoff against §4 — and every one of those is the audit
 * agreeing with itself. This is the other direction: does a line of the SPEC
 * appear anywhere in the evidence?
 *
 * Asking it found `03:15`. The cover picker's Link tab — *"Paste image link…"*,
 * a Submit, *"Works with any image from the web"* — had a check that the TAB
 * existed and not one check on anything inside it: five of that component's
 * eighteen testids were named by its suite, and the three that make the tab do
 * its job were among the thirteen that were not. Thirteen other frames came
 * back unnamed too and all thirteen turned out to be covered under an adjacent
 * timestamp, which is the answer this check cannot tell apart from a hole —
 * hence the ledger's table of those thirteen, which is what makes them findable
 * without a reader repeating the work.
 *
 * WHERE AN ANSWER MAY LIVE, and a unit test is one of the places. `18:20`'s
 * *"No changes made."* is asserted in `ai-command.test.ts` rather than in a
 * browser, correctly — it is a sentence the planner composes, and the audit
 * already records `unit:` claims for that shape. A check that only looked in
 * `test/e2e` would have called it missing and sent me to build a second copy.
 *
 * Exit 1 if any observation is named nowhere.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const OBS = join(ROOT, 'docs/video2-frame-observations.md')
if (!existsSync(OBS)) {
  console.error('[frames] no docs/video2-frame-observations.md — nothing to trace')
  process.exit(1)
}

// An OBSERVATION is a top-level bullet that opens with a timestamp. Nested
// bullets and prose mention plenty of others in passing; those are commentary
// on the observation above them, not separate rows of the specification.
const stamps = [...readFileSync(OBS, 'utf8').matchAll(/^- (\d{2}:\d{2})/gm)].map((m) => m[1])
const distinct = [...new Set(stamps)]

/*
 * FLOORS, BECAUSE THIS CHECK'S PASSING ANSWER IS A ZERO.
 *
 * `nowhere.length === 0` is what it exits 0 on, and there were two ways to
 * reach that without covering anything:
 *
 *   · THE SPEC GOES EMPTY. The regex above is `^- (\d{2}:\d{2})` — a top-level
 *     bullet opening with a timestamp. Reformat the observations file, change
 *     the bullet character, indent the list under a heading, and `distinct` is
 *     `[]`, `nowhere` is `[]`, and this prints "0 observation(s) … 0 nowhere"
 *     and passes. A coverage claim over an empty specification.
 *
 *   · THE EVIDENCE GOES EMPTY. If `test/e2e` stopped being read, every stamp
 *     would fall through to the ledger — which mentions all of them, because
 *     the ledger is where the audit writes about frames — and this would still
 *     report 0 nowhere while claiming nothing was named in a suite. The
 *     DISTRIBUTION is the substance of the claim, not just the total.
 *
 * Both are the shape `check-no-break-patches.mjs` was found in: a control that
 * passes by looking at nothing. Measured 22 September — 115 observations, 113
 * suites, 3 answered in a unit test — and the numbers are floors so the tree can
 * grow. Moving one down is legitimate only when the measurement changed and the
 * new number is the true one, said here with what changed.
 *
 * AND THE FLOORS ARE ON THE TEXT, NOT ON THE FILE COUNT — which the first
 * version got wrong and the break test caught. Flooring `suiteFiles.length`
 * while the corpus itself went empty passed: 113 files listed, nothing read
 * from them. What this check searches is the TEXT, so that is what has to be
 * measured. Both numbers are kept, because a corpus can shrink either way.
 *
 * Measured 22 September: 115 observations · 113 suites, 2,447,535 bytes · 167
 * unit test files, 1,081,317 bytes.
 */
const MIN_OBSERVATIONS = 115
const MIN_SUITES = 100
const MIN_SUITE_BYTES = 2_000_000
const MIN_UNIT_TESTS = 50
const MIN_UNIT_BYTES = 800_000

const read = (p) => readFileSync(p, 'utf8')
const suiteFiles = readdirSync(join(ROOT, 'test/e2e')).filter((f) => f.endsWith('.mjs'))
const suiteText = suiteFiles.map((f) => read(join(ROOT, 'test/e2e', f))).join('\n')

// Unit tests, wherever they are. `18:20` lives in one.
const unitText = []
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.test\.(ts|tsx|mjs)$/.test(e.name)) unitText.push(read(p))
  }
}
for (const top of ['apps', 'packages']) walk(join(ROOT, top))

const docText = ['docs/video2-reaudit.md', 'docs/video2-rundesk-gap-audit.md']
  .filter((f) => existsSync(join(ROOT, f)))
  .map((f) => read(join(ROOT, f)))
  .join('\n')

const units = unitText.join('\n')

// THE FLOORS, ASKED BEFORE THE QUESTION. A distribution over an empty corpus is
// not a weaker answer than a real one; it is a different statement entirely, and
// it comes out of here looking identical.
const short = [
  distinct.length < MIN_OBSERVATIONS &&
    `the specification yielded ${distinct.length} timestamped observation(s), below the floor of ` +
      `${MIN_OBSERVATIONS}. The bullet pattern is \`^- HH:MM\` — a reformat of ` +
      'docs/video2-frame-observations.md silently empties this whole check.',
  suiteFiles.length < MIN_SUITES &&
    `only ${suiteFiles.length} suite(s) were listed, below the floor of ${MIN_SUITES}. With the ` +
      'suites unread every stamp falls through to the ledger, which mentions all of them, and ' +
      '"0 nowhere" would be true and meaningless.',
  suiteText.length < MIN_SUITE_BYTES &&
    `the ${suiteFiles.length} suite(s) yielded ${suiteText.length} byte(s), below the floor of ` +
      `${MIN_SUITE_BYTES}. Listing the files is not reading them — this is the half the first ` +
      'version of this floor missed.',
  unitText.length < MIN_UNIT_TESTS &&
    `only ${unitText.length} unit test file(s) were read, below the floor of ${MIN_UNIT_TESTS}. ` +
      '`18:20` is answered in one, so an unread corpus moves a real answer into the ledger column.',
  units.length < MIN_UNIT_BYTES &&
    `the ${unitText.length} unit test file(s) yielded ${units.length} byte(s), below the floor of ` +
      `${MIN_UNIT_BYTES}`,
  !docText.trim() && 'neither ledger document was readable, so the third column is empty by accident',
].filter(Boolean)
if (short.length) {
  console.error(`\n[frames] this check cannot answer anything as it stands:\n`)
  for (const s of short) console.error(`  · ${s}\n`)
  console.error(
    'Each of these makes `0 nowhere` come out of a scan that covered nothing — the same shape as a\n' +
      'break-patch guard that passes because its roots resolved to nowhere. Fix the scan; do not\n' +
      'lower a floor to meet it unless the measurement really changed, and then say so here.',
  )
  process.exitCode = 1
}

const inSuite = []
const inUnit = []
const inDocs = []
const nowhere = []
for (const t of distinct) {
  if (suiteText.includes(t)) inSuite.push(t)
  else if (units.includes(t)) inUnit.push(t)
  else if (docText.includes(t)) inDocs.push(t)
  else nowhere.push(t)
}

console.log(
  `[frames] ${distinct.length} observation(s): ${inSuite.length} named in a suite, ` +
    `${inUnit.length} in a unit test, ${inDocs.length} in the ledger or the gap audit, ` +
    `${nowhere.length} nowhere`,
)
if (nowhere.length) {
  console.error(`\n[frames] named nowhere: ${nowhere.join(' ')}`)
  console.error(
    'Each of these is a line of the specification with no evidence pointing back at it. Either a\n' +
      'check names the frame, or the ledger records which suite answers it and why it is not named\n' +
      'there — an unanswered frame and a frame answered under another timestamp look identical from\n' +
      'here, and the difference is the whole point.',
  )
  process.exit(1)
}
