#!/usr/bin/env node
// A BREAK RESULT IS ONLY EVIDENCE ABOUT THE SUITE THAT WAS RUNNING WHEN IT WAS
// MEASURED. Fix a suite's fixture and every earlier result through it becomes a
// statement about a suite that no longer exists.
//
// This is not hypothetical. `sidebar-dms` was recorded in the ledger as 10
// patches, 10 reddened. Nine of those ten ran at 20:31-20:38; the fixture fix
// that gave the run a SECOND direct message landed at 20:43. Their logs say so
// in their own words — "the server now reports 1 direct message(s)" — and the
// suite went from 13 checks to 14 in the same commit. The total was nine
// sentences about a dead suite plus one about the live one, added together.
//
// The failure is silent in exactly the way this audit keeps finding: nothing
// was red, no log said anything was wrong, and the number in the table was
// simply not about the thing it named. So the comparison gets a script, because
// the version I do by eye is the version that produced the 10.
//
// For every suite with a break log: take the commit the run SYNCED TO, which
// `wt-break.sh` writes as its first line, and ask git whether anything the run
// depended on has changed between that commit and HEAD. Anything = STALE.
//
// THIS USED TO BE A QUESTION ABOUT THE CLOCK — the suite file's commit date
// against the log's mtime — and the clock got it wrong twice, both times on the
// measurement I most needed:
//
//  - A suite fix committed WHILE its own set was still running dates AFTER the
//    run started and BEFORE the log was last appended to. `folder-dialog` was
//    fixed at 06:29:10 under a log stamped 06:29:50, and `fd-7-toggle-latches`
//    had been measured at 06:27 against the unfixed suite. The row said fresh.
//  - A green fixed in the PRODUCT never touches the suite file, so no rule about
//    suite dates can see it. `folder-create-12-toast-bottom-right` sat UNPROVEN
//    for a day under a row that called its log current.
//
// The sha is a statement about the tree instead of about when someone typed, and
// the deps are the suite that did the measuring plus the product files each
// patch in the log edits. `scripts/lib/log-tree.mjs` carries the reckoning.
//
// THIS IS A LOCAL CHECK AND BELONGS IN PREFLIGHT, NOT IN CI. Its evidence is
// the run logs under /tmp on the machine that did the running, and a CI box has
// none — so there it would print "no break logs on this machine" and exit 0
// every time, which is a check that cannot fail dressed as a passing one. The
// two checks that ARE in CI (check-break-patches.py, check-break-claims.mjs)
// read only files in the repository, which is why they can be.
//
// Exit 1 if any set is stale.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { makeSuiteOf } from './lib/suite-of-patch.mjs'
import { patchDeps, suiteLibs, makeDriftCheck, makeMeasurementCheck, CONTROL, measuredAt } from './lib/log-tree.mjs'
import { bail } from './lib/bail.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const BREAKS = '/tmp/claude-0'

// `break-<suite>-YYYYMMDD-HHMMSS.txt` is a per-run ARCHIVE, not a suite's
// current log. Including them listed eleven imaginary suites as "no suite
// file" — noise introduced by the archiving change itself, in the checker
// written to read these files.
const ARCHIVE = /-\d{8}-\d{6}\.txt$/
const logs = readdirSync(BREAKS).filter((f) => /^break-.+\.txt$/.test(f) && !ARCHIVE.test(f))
if (logs.length === 0) {
  console.log('[break-freshness] no break logs on this machine — nothing to check')
  bail(0)
}

const lastChanged = (name) => {
  try {
    const iso = execFileSync('git', ['log', '-1', '--format=%cI', '--', `test/e2e/${name}.mjs`], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim()
    return iso ? new Date(iso) : null
  } catch {
    return null /* not a tracked suite file */
  }
}

const drifted = makeDriftCheck({ root: ROOT })
const notCurrent = makeMeasurementCheck({ root: ROOT })

const rows = []
for (const log of logs) {
  const suite = log.replace(/^break-/, '').replace(/\.txt$/, '')
  /*
   * A SLICE LOG IS EVIDENCE ABOUT ITS PARENT SUITE, NOT ABOUT NOTHING.
   *
   * Five logs here name a slice rather than a file — `-batch1`, `-batch2`,
   * `-full`, `-patch15-rerun`, `-fixed` — because a 23-patch suite gets run
   * four at a time and each batch was given its own log so the truncation
   * would not eat the last one. They were reported `??  not tracked` and then
   * skipped, which is the worst of the three possible answers: the canonical
   * `break-custom-field-types.txt` holds ONE patch line, the other fourteen
   * live in the batch logs, and the row that said "1 patches" was the only one
   * compared against the suite at all.
   *
   * So the name is walked back a segment at a time until a tracked suite file
   * turns up, and the log is measured against THAT — which is the file the run
   * was really about. The row still prints the log's own name and says whose
   * slice it is, because attributing by name-stripping is a guess, and a guess
   * a reader cannot see is the stale reason this audit keeps finding.
   */
  let named = suite
  let suiteMtime = lastChanged(named)
  while (!suiteMtime) {
    const cut = named.lastIndexOf('-')
    if (cut <= 0) break
    named = named.slice(0, cut)
    suiteMtime = lastChanged(named)
  }
  const sliceOf = suiteMtime && named !== suite ? named : null
  if (!suiteMtime) {
    rows.push({ suite, verdict: 'NO SUITE FILE', detail: `no tracked suite file for ${suite} or any prefix of it` })
    continue
  }
  const text = readFileSync(join(BREAKS, log), 'utf8')
  // COUNT PATCHES BY WHAT A PATCH LINE IS NOT, never by the suite's own name.
  // The first version of this script counted `^== <suite>-`, and patches are
  // named after the FEATURE rather than the suite — `folder-dialog`'s are
  // `folder-statuses-*`, `list-customize`'s are `list-trio-*`,
  // `ai-model-picker`'s are `mp-*`. It reported 0 for six sets that had run
  // fully, which would have read as the ledger inventing numbers. A confident
  // zero, produced by the very script written to catch confident numbers.
  const patchLines = text.split('\n').filter((l) => l.startsWith('== ') && !CONTROL.test(l))
  const patches = patchLines.length
  const buildFailed = patchLines.filter((l) => /BUILD FAILED|PATCH FAILED/.test(l)).length
  // A PATCH FILE THAT WAS NEVER FOUND IS THE SAME KIND OF NOTHING AS ONE THAT
  // NEVER BUILT, and it hid for longer because its line is quieter. `wt-break.sh`
  // read patches from `/tmp/claude-0/breaks` long after the tracked copy became
  // the source, so a patch written into `test/e2e/breaks` and never hand-copied
  // came back "== <name> MISSING". That line starts with `== `, is not a control
  // line and does not say FAILED, so it counted as a patch here and as a patch
  // in `break-queue.sh` — two sets of four reported "patches 4 · STILL-GREEN 0 ·
  // UNBUILT 0" having opened no file at all.
  //
  // `PATCH CHANGED NOTHING` joins it: applied, left the tree identical, proved
  // nothing, and says neither MISSING nor FAILED.
  const missing = patchLines.filter((l) => / MISSING/.test(l)).length
  const noChange = patchLines.filter((l) => /PATCH CHANGED NOTHING/.test(l)).length
  const refused = /^== REFUSING TO BREAK-TEST/m.test(text)
  const done = /^DONE /m.test(text)

  // The working tree can hold an edit no commit knows about.
  let dirty = false
  try {
    dirty = execFileSync('git', ['status', '--porcelain', '--', `test/e2e/${named}.mjs`], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim().length > 0
  } catch {
    /* ignore */
  }

  // EVERY sha in the file, not the first. A log that holds two runs is current
  // only if BOTH trees are — the earlier run's numbers are still in it, and
  // reading line one would date the whole file by whichever run came first.
  const shas = [...text.matchAll(/^== syncing \S+ to ([0-9a-f]{7,40})/gm)].map((m) => m[1])
  // What moved under this log, asked the way `check-break-reddened.mjs` and the
  // planner ask it — one function, `makeMeasurementCheck` — for every patch the
  // log names: the suite and the helpers it imports, the product files the
  // patch edits, the patch's own CODE (a comment edit is still not a
  // re-measurement) and a pending `# Re-run:`. This had its own copy of the
  // question with the patch body and the helpers left out, so a rewritten patch
  // read "fresh" here and "drifted" there.
  const moved = new Set()
  for (const sha of shas) {
    for (const d of drifted(sha, [`test/e2e/${named}.mjs`, ...suiteLibs(named)])) moved.add(d)
    for (const line of patchLines) {
      const name = line.slice(3).split(/\s/)[0]
      const file = join(ROOT, 'test/e2e/breaks', `${name}.py`)
      if (!existsSync(file)) continue
      const text = readFileSync(file, 'utf8')
      for (const d of notCurrent({ sha }, patchDeps(text, named), { name, text })) moved.add(d)
    }
  }
  const movedList = [...moved]

  // NO SHA IS NOT NO DRIFT. Logs from before `wt-break.sh` recorded what it
  // synced to cannot be placed in the history at all, and a check that cannot
  // run reports UNKNOWN rather than passing: 73 of these would otherwise be 73
  // silent "fresh" rows resting on a line that was never written.
  // WHICH TREE, AND WHAT HAPPENED, ARE TWO FACTS. They were one field, with
  // REFUSED winning, and that lost the only thing worth knowing about a
  // refusal: `ai-assign` and `create-menu-ai` both refused their baselines
  // against suites that have since been fixed, and both printed as live
  // failures with nothing to say they were about a tree from this morning.
  const tree = dirty || movedList.length ? 'older' : shas.length ? 'current' : 'unknown'
  const verdict = refused
    ? 'REFUSED'
    : tree === 'older'
      ? 'STALE'
      : tree === 'unknown'
        ? 'UNKNOWN'
        : 'fresh'
  rows.push({
    suite,
    verdict,
    tree,
    patches,
    // The patch names this log actually holds, so a superseded log can be told
    // from a stale one: every name having a NEWER measurement elsewhere means
    // re-running this file reprints numbers already on disk.
    patchNames: patchLines
      .map((l) => l.slice(3).trim().split(/\s+/)[0])
      .filter((n) => n && !/MISSING|FAILED|CHANGED/.test(n)),
    buildFailed,
    missing,
    noChange,
    done,
    detail:
      (sliceOf ? `slice of ${sliceOf}: ` : '') +
      (dirty
        ? 'suite has UNCOMMITTED edits — the run cannot be about this file'
        : movedList.length
          ? `measured at ${shas.join(',')}, since when ${movedList.length} file(s) it depended on changed: ${movedList
              .slice(0, 3)
              .map((p) => p.replace(/^(apps|packages)\//, ''))
              .join(' ')}${movedList.length > 3 ? ' …' : ''}`
          : shas.length
            ? `measured at ${shas.join(',')}, nothing it depended on has changed since`
            : 'the log records no commit — nothing can be said about which tree it measured'),
  })
}

rows.sort((a, b) => a.verdict.localeCompare(b.verdict) || a.suite.localeCompare(b.suite))

// `--porcelain` is this answer for another program to read, and it exits 0
// because it is a lookup rather than a gate. `break-report.sh` marks each of
// its rows with it: a REFUSED baseline or a GREEN patch measured against an
// older tree is a row whose fix may already be in, and I diagnosed
// `create-menu-ai`'s type filter as a live product defect off exactly such a
// row — the suite had been expecting nine kinds where the product shipped ten,
// and the suite was corrected hours before I read the log.
//
// One implementation, two readers, for the reason every other shared module in
// here exists: two answers to "is this current?" would disagree eventually, and
// the disagreement would be invisible.
if (process.argv.includes('--porcelain')) {
  for (const r of rows) console.log(`${r.verdict}\t${r.suite}\t${r.tree ?? 'unknown'}`)
  bail(0)
}

const TAGS = {
  fresh: '  ok  ',
  STALE: ' STALE',
  REFUSED: 'REFUSED',
  UNKNOWN: 'UNKNOWN',
  'NO SUITE FILE': '  ??  ',
}
for (const r of rows) {
  const bf = r.buildFailed ? `  ${r.buildFailed} BUILD/PATCH FAILED` : ''
  const ms = r.missing ? `  ${r.missing} MISSING` : ''
  const nc = r.noChange ? `  ${r.noChange} CHANGED NOTHING` : ''
  console.log(
    `${TAGS[r.verdict] ?? '  ??  '} ${r.suite.padEnd(34)} ${r.patches ?? '-'} patches  ${r.detail}${bf}${ms}${nc}`,
  )
}

// A LOG THAT REFUSED, AND A PATCH THAT DID NOT BUILD, ARE BOTH "IT RAN" WEARING
// A RESULT'S CLOTHES. `integration-error-card`'s most recent log is a refusal —
// "the unpatched suite is not green" — under a ledger row reading 7 of 7, and
// `gantt-controls`'s holds one patch that BUILD FAILED under a row reading
// 12 of 12. Neither number is supported by anything currently on disk.
/*
 * A LOG EVERY PATCH OF WHICH HAS A NEWER MEASUREMENT IS HISTORY, NOT WORK.
 *
 * This file answers per LOG FILE; `never-run-plan.mjs` and
 * `check-break-reddened.mjs` answer per PATCH, taking the newest log for each.
 * Five logs on this machine are ad-hoc SLICES — `custom-field-types-batch1`,
 * `-batch2`, `-full`, `-patch15-rerun`, `task-mentions-fixed` — 82 patches
 * between them, and every one of the 82 has since been measured by the
 * canonical set. So this reported four stale sets and one unknown while the
 * chain reported `nothing left` and the reddened checker reported 0 drifted.
 *
 * Two instruments, one question, three answers — the duplicated list again, and
 * in the last red step of the preflight. Re-running a superseded slice changes
 * no number that is not already on disk, which is the same reason the plan does
 * not schedule a short run: it is not work, and demanding it keeps a gate red
 * forever.
 *
 * SUPERSEDED IS REPORTED, NOT SWALLOWED. It is printed with its count, because
 * "this log is old and it does not matter" is a claim, and a reader should be
 * able to see which logs it was made about.
 */
const newestPerPatch = measuredAt(BREAKS)
const supersededBy = (r) => {
  const names = r.patchNames ?? []
  if (!names.length) return false
  return names.every((n) => {
    const rec = newestPerPatch.get(n)
    // `log` is the FILE the newest record came from. Any file but this one —
    // the canonical set or one of its archives — means this log is history.
    return rec && rec.log && rec.log !== `break-${r.suite}.txt`
  })
}
const superseded = rows.filter((r) => (r.tree === 'older' || r.tree === 'unknown') && supersededBy(r))
if (superseded.length) {
  console.log(
    `\n[break-freshness] ${superseded.length} log(s) are SUPERSEDED: every patch in them has since ` +
      'been measured by another run, so re-running them would reprint numbers already on disk.',
  )
  for (const r of superseded) console.log(`                    ${r.suite} (${(r.patchNames ?? []).length} patch(es))`)
}
const isSuperseded = new Set(superseded.map((r) => r.suite))
const stale = rows.filter((r) => r.tree === 'older' && !isSuperseded.has(r.suite))
const refusedSets = rows.filter((r) => r.verdict === 'REFUSED')
const broken = rows.filter((r) => r.buildFailed > 0)
const absent = rows.filter((r) => r.missing > 0)
const inert = rows.filter((r) => r.noChange > 0)
for (const r of refusedSets) console.error(`\n[break-freshness] ${r.suite}: the run REFUSED — a red baseline means no patch was measured`)
for (const r of broken) console.error(`[break-freshness] ${r.suite}: ${r.buildFailed} patch(es) never built — they prove nothing about the checks they aimed at`)
for (const r of absent) console.error(`[break-freshness] ${r.suite}: ${r.missing} patch file(s) were never found — that set opened nothing`)
for (const r of inert) console.error(`[break-freshness] ${r.suite}: ${r.noChange} patch(es) left the tree identical — applied and inert`)
const unknown = rows.filter((r) => r.tree === 'unknown' && !isSuperseded.has(r.suite))
if (stale.length) {
  console.error(
    `\n[break-freshness] ${stale.length} break set(s) were measured against a tree that has since changed.`,
  )
  console.error('Re-run them, or the ledger is reporting numbers about files that no longer exist.')
  console.error('   node scripts/e2e-lanes/never-run-plan.mjs --drifted > /tmp/claude-0/plan.txt')
}
if (unknown.length) {
  console.error(
    `\n[break-freshness] ${unknown.length} log(s) record no commit, so whether they are current cannot be answered.`,
  )
  console.error('They are counted here rather than passed over — a check that cannot run is UNKNOWN, not clean.')
}
/*
 * AND THE PATCHES WHOSE RUN LOG IS NOT ON THIS MACHINE AT ALL.
 *
 * Everything above compares a surviving log against its suite. This asks the
 * prior question — is there a log? — and the answer for 290 of 764 patches is
 * no. `check-break-coverage.mjs` counts every one of them as covering its
 * suite, and says in its own header that it counts AIM rather than proof;
 * between the two, a patch can be written, attributed, claim-verified and
 * reported as closing a suite with nothing on disk saying it ever applied.
 *
 * TWO CAUSES, AND THIS CANNOT TELL THEM APART, so it does not claim to:
 *
 *  - the set was written and never run. That is the one worth acting on, and
 *    it is why the list is printed on every run rather than at the end of a
 *    session.
 *  - the set RAN and its log was overwritten. `wt-break.sh` truncates
 *    `break-<suite>.txt` at the start of every run, so a suite exercised in
 *    batches of four keeps only the last batch. `break-ai-answer-rendering.txt`
 *    holds exactly one patch line, `aar-23`, out of twenty-three that ran.
 *    The per-run archive (`break-<suite>-YYYYMMDD-HHMMSS.txt`) exists to stop
 *    that, and it was added after most of these ran — so what this number
 *    measures, for the older sets, is how much the truncation cost before
 *    anybody noticed.
 *
 * Either way the ledger's §8 is the only surviving record for those rows, and
 * a number whose evidence is gone is a number nobody can check. That is this
 * file's whole premise, one level up.
 *
 * MATCHED BY PATCH NAME ACROSS EVERY LOG, ARCHIVES INCLUDED, and the first
 * version matched by SUITE name instead. Patches are named after the feature
 * rather than the suite — `ai-model-cards`'s are `amc-*`,
 * `task-attachments`'s are `tat-*`, `notification-gaps`'s ran inside
 * `break-video1-acceptance.txt` — so asking whether a log is named after the
 * suite reported a set that had run as never having run. The same mistake this
 * file's own header describes making when counting patches.
 */
const everRun = new Set()
for (const f of readdirSync(BREAKS).filter((f) => /^break-.+\.txt$/.test(f))) {
  for (const line of readFileSync(join(BREAKS, f), 'utf8').split('\n')) {
    const m = line.match(/^== ([a-z0-9][a-z0-9-]*)\b/)
    if (m) everRun.add(m[1])
  }
}
/*
 * ATTRIBUTED THE WAY COVERAGE ATTRIBUTES, because the two numbers are read
 * side by side and this one was smaller for a reason that had nothing to do
 * with the patches.
 *
 * This kept step one only, with `[,:—-]` as the delimiter — and
 * `# Reddens: sidebar-dms "the workspace tree has a Direct Messages section"`
 * separates with a SPACE, so the regex matched `sidebar` and used the hyphen
 * as its delimiter. Nine `sidebar-dms-*`, five `teams-empty-state-*` and eight
 * `list-customize-*` came out as "(no suite named)" while coverage attributed
 * every one of them, and the run plan built from this list could not schedule
 * them. A patch that cannot be scheduled is a patch that stays unmeasured,
 * which is this report's whole subject.
 */
const suiteOf = makeSuiteOf({
  suiteDir: join(ROOT, 'test/e2e'),
  candidates: readdirSync(join(ROOT, 'test/e2e'))
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => f.slice(0, -4)),
})
/*
 * A `unit:` CLAIM IS COUNTED SEPARATELY, NOT FOLDED INTO "NO SURVIVING RUN LOG".
 *
 * Its evidence is a `*.test.ts` and `check-unit-claims.mjs` measures all four
 * every preflight — so "no e2e log here" is true of them and means nothing.
 * They were being added to the no-log pile, where two of them showed up as
 * `(no suite named)` and this printed "9 patch(es) … have NO SURVIVING RUN LOG"
 * against the plan's 7. Same question, two answers, and the header of
 * `never-run-plan.mjs` promises the opposite: "the number printed here has to
 * be the number printed there."
 *
 * Counted rather than dropped, because a patch measured somewhere else is not a
 * patch nothing measures — that is the counted-skip rule this file applies to
 * its own UNKNOWNs two paragraphs up, turned on itself. The line names the tool
 * that does measure them, so the number can be followed rather than trusted.
 */
const neverRan = new Map()
const unitClaims = []
for (const f of readdirSync(join(ROOT, 'test/e2e/breaks')).filter((f) => f.endsWith('.py'))) {
  const name = f.slice(0, -3)
  if (everRun.has(name)) continue
  const text = readFileSync(join(ROOT, 'test/e2e/breaks', f), 'utf8')
  if (/^#\s*Reddens:\s*unit\b/im.test(text)) {
    unitClaims.push(name)
    continue
  }
  const suite = suiteOf(name, text) ?? '(no suite named)'
  neverRan.set(suite, (neverRan.get(suite) ?? 0) + 1)
}
if (neverRan.size) {
  const patches = [...neverRan.values()].reduce((a, b) => a + b, 0)
  console.log(
    `\n[break-freshness] ${patches} patch(es) across ${neverRan.size} suite(s) have NO SURVIVING RUN LOG here.`,
  )
  console.log('                  Either never run, or run before per-run archiving existed and')
  console.log('                  overwritten — this cannot tell which, and does not guess:')
  for (const [s, n] of [...neverRan].sort((a, b) => b[1] - a[1])) {
    console.log(`                    ${String(n).padStart(3)}  ${s}`)
  }
  console.log('                  Coverage counts all of them as aimed at. Nothing here proves any ran.')
}
if (unitClaims.length) {
  console.log(
    `\n[break-freshness] and ${unitClaims.length} patch(es) with no e2e log claim a UNIT test, ` +
      'which is where their evidence is:',
  )
  for (const n of unitClaims.sort()) console.log(`                    ${n}`)
  console.log(
    '                  `check-unit-claims.mjs` applies each one and requires the named test to\n' +
      '                  fail, every preflight. Counted here rather than left out, and kept out of\n' +
      '                  the pile above because no e2e run could ever settle them.',
  )
}

if (
  stale.length ||
  unknown.length ||
  refusedSets.length ||
  broken.length ||
  absent.length ||
  inert.length
)
  bail(1)
// A row with no suite file was never COMPARED to anything, so it cannot be
// folded into "all N postdate their suite" — that sentence is the whole output
// most readers see, and counting an unmeasured log inside it is how a total
// stops being about what it names.
const unmatched = rows.filter((r) => r.verdict === 'NO SUITE FILE')
console.log(
  `\n[break-freshness] all ${rows.length - unmatched.length} break set(s) postdate their suite, none refused, ` +
    'every patch file was found, built, and changed something' +
    (unmatched.length
      ? `\n                  ${unmatched.length} log(s) name no suite file and were NOT compared: ${unmatched
          .map((r) => r.suite)
          .join(', ')}`
      : ''),
)
