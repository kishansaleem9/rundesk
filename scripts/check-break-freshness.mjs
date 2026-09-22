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
import { patchDeps, makeDriftCheck, CONTROL } from './lib/log-tree.mjs'

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
  process.exit(0)
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
  // The deps: the suite that did the measuring, and the product files that each
  // patch NAMED IN THIS LOG edits. The patch files themselves are left out —
  // they are re-worded constantly and `check-break-reddened.mjs` re-reads every
  // claim against the log's own text, so a comment edit is not a re-measurement.
  const deps = new Set([`test/e2e/${named}.mjs`])
  for (const line of patchLines) {
    const name = line.slice(3).split(/\s/)[0]
    const file = join(ROOT, 'test/e2e/breaks', `${name}.py`)
    if (existsSync(file)) for (const d of patchDeps(readFileSync(file, 'utf8'), null)) deps.add(d)
  }
  const moved = [...new Set(shas.flatMap((sha) => drifted(sha, [...deps])))]

  // NO SHA IS NOT NO DRIFT. Logs from before `wt-break.sh` recorded what it
  // synced to cannot be placed in the history at all, and a check that cannot
  // run reports UNKNOWN rather than passing: 73 of these would otherwise be 73
  // silent "fresh" rows resting on a line that was never written.
  const verdict = refused
    ? 'REFUSED'
    : dirty || moved.length
      ? 'STALE'
      : shas.length
        ? 'fresh'
        : 'UNKNOWN'
  rows.push({
    suite,
    verdict,
    patches,
    buildFailed,
    missing,
    noChange,
    done,
    detail:
      (sliceOf ? `slice of ${sliceOf}: ` : '') +
      (dirty
        ? 'suite has UNCOMMITTED edits — the run cannot be about this file'
        : moved.length
          ? `measured at ${shas.join(',')}, since when ${moved.length} file(s) it depended on changed: ${moved
              .slice(0, 3)
              .map((p) => p.replace(/^(apps|packages)\//, ''))
              .join(' ')}${moved.length > 3 ? ' …' : ''}`
          : shas.length
            ? `measured at ${shas.join(',')}, nothing it depended on has changed since`
            : 'the log records no commit — nothing can be said about which tree it measured'),
  })
}

rows.sort((a, b) => a.verdict.localeCompare(b.verdict) || a.suite.localeCompare(b.suite))
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
const stale = rows.filter((r) => r.verdict === 'STALE')
const refusedSets = rows.filter((r) => r.verdict === 'REFUSED')
const broken = rows.filter((r) => r.buildFailed > 0)
const absent = rows.filter((r) => r.missing > 0)
const inert = rows.filter((r) => r.noChange > 0)
for (const r of refusedSets) console.error(`\n[break-freshness] ${r.suite}: the run REFUSED — a red baseline means no patch was measured`)
for (const r of broken) console.error(`[break-freshness] ${r.suite}: ${r.buildFailed} patch(es) never built — they prove nothing about the checks they aimed at`)
for (const r of absent) console.error(`[break-freshness] ${r.suite}: ${r.missing} patch file(s) were never found — that set opened nothing`)
for (const r of inert) console.error(`[break-freshness] ${r.suite}: ${r.noChange} patch(es) left the tree identical — applied and inert`)
const unknown = rows.filter((r) => r.verdict === 'UNKNOWN')
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
const neverRan = new Map()
for (const f of readdirSync(join(ROOT, 'test/e2e/breaks')).filter((f) => f.endsWith('.py'))) {
  const name = f.slice(0, -3)
  if (everRun.has(name)) continue
  const text = readFileSync(join(ROOT, 'test/e2e/breaks', f), 'utf8')
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

if (
  stale.length ||
  unknown.length ||
  refusedSets.length ||
  broken.length ||
  absent.length ||
  inert.length
)
  process.exit(1)
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
