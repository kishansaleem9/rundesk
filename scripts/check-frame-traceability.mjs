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

const read = (p) => readFileSync(p, 'utf8')
const suiteText = readdirSync(join(ROOT, 'test/e2e'))
  .filter((f) => f.endsWith('.mjs'))
  .map((f) => read(join(ROOT, 'test/e2e', f)))
  .join('\n')

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
