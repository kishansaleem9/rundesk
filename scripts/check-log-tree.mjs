#!/usr/bin/env node
/*
 * THE PROVENANCE READER, READ BACK.
 *
 * `scripts/lib/log-tree.mjs` answers "which tree is this number about?", and
 * every re-run decision in this audit now rests on it — `check-break-freshness`
 * to say a set is STALE, `never-run-plan --drifted` to put it back in the work
 * list. Both would be quiet if it were wrong in the direction that matters:
 * saying CURRENT about a log it could not place. That is the shape the rule it
 * replaced had, and it cost me two measurements.
 *
 * So the cases are written down. Each one is a way the old clock rule read
 * wrong, or a way this one could:
 *
 *   node scripts/check-log-tree.mjs
 */
import { mkdtempSync, writeFileSync, utimesSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { proveMutationsBite } from './lib/mutate.mjs'

/*
 * THE SUBJECT IS IMPORTED DYNAMICALLY, so `--mutate` can point these same cases
 * at a deliberately-broken copy. A static import cannot be redirected, and a
 * contract test that cannot be pointed at a broken subject can only prove that
 * its cases run — never that they would notice.
 *
 * The mutant is written BESIDE `lib/log-tree.mjs`, so `./` resolves the same
 * way for it; `lib/mutate.mjs` records what putting it anywhere else cost.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const SUBJECT = process.env.LOG_TREE_LIB ?? './lib/log-tree.mjs'
const { measuredAt, patchDeps, makeDriftCheck, makeMeasurementCheck, declaresRerun } = await import(SUBJECT)

let failed = 0
let ran = 0
const ok = (cond, what) => {
  ran += 1
  console.log(`${cond ? '  PASS' : '  FAIL'} ${what}`)
  if (!cond) failed++
}

const dir = mkdtempSync(join(tmpdir(), 'log-tree-'))
const log = (name, body, mtime) => {
  const p = join(dir, name)
  writeFileSync(p, body)
  if (mtime) utimesSync(p, mtime, mtime)
  return p
}

console.log('▶ which commit was this patch measured at')

// THE SHA ABOVE THE PATCH, NOT THE ONE AT THE TOP OF THE FILE. A canonical log
// is truncated per run, but `wt-break.sh` appends and the archives do not
// promise one run per file — `ui-sweep`'s duplicate dispatch put two runs in
// one. Dating the second run's patches by the first run's sha is how a measured
// patch gets credited to a tree it never saw.
log(
  'break-two-runs.txt',
  [
    '== syncing /tmp/claude-0/wt2 to aaaaaaa',
    '== early-1-first',
    '31 passed, 1 failed',
    '== syncing /tmp/claude-0/wt2 to bbbbbbb',
    '== late-1-second',
    '31 passed, 1 failed',
    '',
  ].join('\n'),
  1_700_000_000,
)
let at = measuredAt(dir)
ok(at.get('early-1-first')?.sha === 'aaaaaaa', 'the first run\'s patch carries the first sha')
ok(at.get('late-1-second')?.sha === 'bbbbbbb', 'and the second run\'s patch carries the second')

// A LOG WITH NO SYNC LINE IS NOT A LOG AT AN UNKNOWN-BUT-FINE COMMIT. 73 logs
// on this machine predate the line being written; the callers turn a null sha
// into UNKNOWN, and they can only do that if it arrives as null rather than as
// the string 'undefined' or the previous file's sha.
log('break-old-format.txt', ['== antique-1-nothing', '31 passed, 1 failed', ''].join('\n'), 1_700_000_100)
at = measuredAt(dir)
ok(at.get('antique-1-nothing')?.sha === null, 'a log with no syncing line reports its sha as null')

// THE NEWEST LOG WINS, BY MTIME. A patch measured twice is described by its
// latest run; taking the first would re-prove a number the re-run already
// corrected, and taking whichever readdir happened to yield last is not a rule.
//
// THE NAMES DO THE WORK HERE, AND THEY WERE THE WRONG WAY ROUND.
//
// The comment that stood here said the OLDER file has to be read first "or
// deleting the mtime comparison altogether still produces the right answer and
// this case proves nothing" — and then named the files so the older WAS read
// first, which is the arrangement it was warning against. Reading older then
// newer, a module that simply overwrote every time would end on the newer and
// answer correctly. `--mutate` proved it: replacing the comparison with
// `if (true)` left all 36 cases green.
//
// So the NEWER file sorts first. Now a missing comparison lets the older one
// overwrite it, and the answer is wrong — which is what this case is for.
log(
  'break-dup-a-newer.txt',
  ['== syncing /tmp/claude-0/wt3 to 2222222', '== twice-1-measured', '32 passed, 0 failed', ''].join('\n'),
  1_700_009_999,
)
log(
  'break-dup-b-older.txt',
  ['== syncing /tmp/claude-0/wt3 to 1111111', '== twice-1-measured', '31 passed, 1 failed', ''].join('\n'),
  1_700_000_000,
)
at = measuredAt(dir)
ok(at.get('twice-1-measured')?.sha === '2222222', 'the newest log that names a patch is the one that dates it')
ok(at.get('twice-1-measured')?.log === 'break-dup-a-newer.txt', 'and it says which log that was')

// CONTROL LINES ARE NOT PATCHES. `== BASELINE`, `== restoring` and
// `== REFUSING` all start with the same three characters, and a refusal
// recorded as a measured patch is a set that proved nothing reading as one that
// proved something.
log(
  'break-controls.txt',
  [
    '== syncing /tmp/claude-0/wt4 to 3333333',
    '== BASELINE (no patch) 37 passed, 0 failed',
    '== REFUSING TO BREAK-TEST — the unpatched suite is not green',
    '== restoring /tmp/claude-0/wt4',
    '',
  ].join('\n'),
  1_700_000_200,
)
at = measuredAt(dir)
ok(!at.has('BASELINE'), 'a BASELINE line is not a patch')
ok(!at.has('REFUSING'), 'nor is a refusal')
ok(!at.has('restoring'), 'nor is the restore line')
ok(!at.has('syncing'), 'nor the sync line itself')

console.log('▶ what a run depended on')

const PATCH = [
  '# Reddens: folder-dialog: "the toggle starts off"',
  "p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'",
  "q = '/home/user/rundesk/packages/ui/src/components/toaster.tsx'",
  "tmp = '/tmp/claude-0/scratch.tsx'",
  "again = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'",
].join('\n')
const deps = patchDeps(PATCH, 'folder-dialog')
ok(deps.includes('apps/web/src/components/quick-create-modal.tsx'), 'an apps/ file the patch edits is a dep')
ok(deps.includes('packages/ui/src/components/toaster.tsx'), 'and a packages/ one — the case the clock rule could never see')
ok(deps.includes('test/e2e/folder-dialog.mjs'), 'and the suite that does the measuring')
ok(!deps.some((d) => d.includes('/tmp/')), 'a scratch path outside the repo is not a dep')
ok(deps.filter((d) => d.endsWith('quick-create-modal.tsx')).length === 1, 'a file named twice is one dep')
ok(!patchDeps(PATCH, null).some((d) => d.startsWith('test/e2e/')), 'with no suite named, no suite dep is invented')

console.log('▶ has anything it depended on changed since')

// A REAL REPOSITORY, because the whole point is what `git diff` says.
const repo = mkdtempSync(join(tmpdir(), 'log-tree-repo-'))
const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' })
git('init', '-q')
git('config', 'user.email', 't@t')
git('config', 'user.name', 't')
mkdirSync(join(repo, 'apps/web/src'), { recursive: true })
mkdirSync(join(repo, 'test/e2e'), { recursive: true })
writeFileSync(join(repo, 'apps/web/src/a.tsx'), 'one\n')
writeFileSync(join(repo, 'test/e2e/s.mjs'), 'suite\n')
git('add', '-A')
git('commit', '-qm', 'first')
const first = git('rev-parse', 'HEAD').trim()
writeFileSync(join(repo, 'apps/web/src/a.tsx'), 'two\n')
git('add', '-A')
git('commit', '-qm', 'second')

const drift = makeDriftCheck({ root: repo })
ok(drift(first, ['apps/web/src/a.tsx']).length === 1, 'a product file edited since the run is named')
ok(drift(first, ['test/e2e/s.mjs']).length === 0, 'a file nothing touched is not')
ok(drift(git('rev-parse', 'HEAD').trim(), ['apps/web/src/a.tsx']).length === 0, 'and HEAD has drifted from nothing')

// AN UNKNOWN SHA MUST NOT READ AS "NOTHING CHANGED". This is the one that
// matters: `git diff` on a commit this checkout does not have exits non-zero,
// and the obvious `catch { return [] }` turns every unplaceable log into a
// clean row. The answer has to be a reason, not an empty list.
const bad = drift('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', ['apps/web/src/a.tsx'])
ok(bad.length > 0, 'a sha this repository has never seen does not answer "no drift"')
ok(bad[0] === '<unknown commit>', 'it says so in words a row can print')

// NO PATHS IS NO QUESTION. A patch that names no product file and no suite has
// nothing to compare, and asking git for a diff with no pathspec would return
// the whole commit range — every log would be stale forever.
ok(drift(first, []).length === 0, 'a patch with no deps at all is not stale by default')

console.log('▶ a patch that says its own log is not evidence')

ok(declaresRerun('# Re-run: the runner built the wrong copy\nimport io\n'), 'a reason after the line counts')
ok(!declaresRerun('# Reddens: folder-create: "a sentence"\nimport io\n'), 'and `Reddens:` is not it — one hyphen apart')
ok(!declaresRerun('# Re-run:\nimport io\n'), 'a declaration with no reason is not a declaration')
ok(!declaresRerun('# nothing here\nimport io\n'), 'and a header that says nothing declares nothing')
ok(
  declaresRerun('# The toaster is bottom-right again.\n#\n# Re-run: measured under the old runner\n'),
  'the line is found anywhere in the header, not only first',
)

console.log('▶ and the same question about a whole measurement')

// THE TWO ABSENCES. `check-break-reddened.mjs` and the plan generator both have
// to decide what a MISSING record and a null sha mean, and both had the
// conditional written out by hand. `rec?.sha ? drifted(…) : []` is the version
// that reads every unplaceable log as a measurement of the current tree, which
// is how nine greens from before their own fixes were counted as greens.
const current = makeMeasurementCheck({ root: repo })
ok(current(undefined, ['apps/web/src/a.tsx'])[0] === '<no run log>', 'no record at all is a reason, not a pass')
ok(
  current({ sha: null }, ['apps/web/src/a.tsx'])[0] === '<no commit recorded>',
  'a log that never recorded its commit is a reason too',
)
ok(current({ sha: first }, ['apps/web/src/a.tsx']).length === 1, 'and a real record still answers by the diff')
ok(current({ sha: first }, ['test/e2e/s.mjs']).length === 0, 'a measurement nothing has moved under is current')

console.log('▶ the patch\'s own body, which its comments are not')

// THE RULE THAT PROTECTS AGAINST COMMENT CHURN ALSO HID A REWRITTEN PATCH.
// `po-3-one-provider` had been setting the `hidden` attribute, which a Tailwind
// class overrides, so it hid nothing and ran green twice. Rewriting what it DOES
// left its old measurement in place, because `patchDeps` leaves patch files out
// on purpose. Stripped of `#` lines, a reworded header is nothing and a new body
// is a re-run.
mkdirSync(join(repo, 'test/e2e/breaks'), { recursive: true })
const PATCH_PATH = join(repo, 'test/e2e/breaks/p-1-thing.py')
writeFileSync(PATCH_PATH, '# the first explanation\nimport io\ns = "one"\n')
git('add', '-A')
git('commit', '-qm', 'the patch')
const atPatch = git('rev-parse', 'HEAD').trim()
const patchOf = (text) => current({ sha: atPatch }, [], { name: 'p-1-thing', text })

ok(patchOf('# the first explanation\nimport io\ns = "one"\n').length === 0, 'the same patch is current')
ok(
  patchOf('# a WHOLLY different explanation\n#\n# over three lines\nimport io\ns = "one"\n').length === 0,
  'and a reworded header is still the same patch',
)
const rewritten = patchOf('# the first explanation\nimport io\ns = "two"\n')
ok(rewritten.length === 1, 'a changed body is not')
// `?? ''` on every read of a reason, because an assertion that CRASHES on an
// empty answer is not an assertion. Deleting the "not committed" reason made
// this case die on `[0].includes` instead of reporting — the same defect these
// checks exist to catch in the suites, in the file that checks them.
ok((rewritten[0] ?? '').includes('<body>'), 'and it says which file and why')
ok(
  (current({ sha: atPatch }, [], { name: 'p-2-never-committed', text: 'import io\n' })[0] ?? '').includes(
    '<not committed when it ran>',
  ),
  'a patch with no blob at that commit is a reason, not a pass — it ran before it was committed',
)
// The deps still win: a suite that moved is a re-run whatever the patch says.
ok(
  current({ sha: first }, ['apps/web/src/a.tsx'], {
    name: 'p-1-thing',
    text: '# the first explanation\nimport io\ns = "one"\n',
  }).length === 1,
  'and a moved dependency still answers first',
)

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
 * AND THAT EACH CASE BITES. The floor below catches "every case deleted"; it
 * cannot catch "the subject is broken and the cases pass anyway", which is the
 * failure this file exists to prevent. Every mutation here is a way
 * `log-tree.mjs`'s own comments say it could go wrong — mostly by answering
 * CURRENT about a log it could not place, which is the direction that turns a
 * stale number into a measurement.
 */
if (process.argv.includes('--mutate')) {
  const subject = join(HERE, 'lib/log-tree.mjs')
  failed += proveMutationsBite({
    subject,
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'LOG_TREE_LIB',
    label: 'the provenance reader',
    // It loads or it does not: a mutant that cannot be imported makes the case
    // file throw on its own `await import`, which the named-case guard catches.
    alive: (mutant) => {
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(mutant)})`], {
        encoding: 'utf8',
        timeout: 30_000,
      })
      return { ok: r.status === 0, why: (r.stderr ?? '').trim() }
    },
    mutations: [
      ['a log with no run at all reads as current', "if (!rec) return ['<no run log>']", 'if (!rec) return []'],
      ['a log with no commit recorded reads as current', "if (!rec.sha) return ['<no commit recorded>']", 'if (!rec.sha) return []'],
      ['the sha stops being read forward through the file', 'sha = s[1]\n        continue', 'continue'],
      /*
       * THE MTIME COMPARISON, NOT THE `.sort()` BESIDE IT. Deleting the sort
       * reddens nothing and that is correct: the sort exists so the CASE is
       * deterministic, not so the answer is right — with it gone, readdir order
       * decides which file is read first and the mtime comparison still picks the
       * newer. The lib's own comment says so. The comparison is the load-bearing
       * part, and it is the part that was once deleted while its case passed.
       */
      ['the newest log stops winning', 'if (!prev || prev.mtime < mtime) at.set', 'if (true) at.set'],
      ['a patch stops depending on its own suite', 'if (suite) deps.add(`test/e2e/${suite}.mjs`)', 'void suite'],
      ['a patch stops depending on the product files it edits', '/\\/home\\/user\\/rundesk\\/((?:apps|packages)\\/[A-Za-z0-9_./-]+)/g', '/__never_matches__()/g'],
      ['an unreadable commit reads as no drift', "out = ['<unknown commit>']", 'out = []'],
      ['a Re-run: line with nothing after it counts', '/^#[ \\t]*Re-run:[ \\t]*\\S/im', '/^#[ \\t]*Re-run:/im'],
    ],
  })
}

const MIN_ASSERTIONS = 30
if (ran < MIN_ASSERTIONS) {
  console.error(
    `\nlog-tree only ${ran} assertion(s) ran, below the floor of ${MIN_ASSERTIONS}. ` +
      'A contract test that asserts nothing passes; this line is what stops it saying so.',
  )
  short = true
}
console.log(
  failed === 0 ? `\nok log-tree: all ${ran} cases hold` : `\n${failed} of ${ran} FAILED`,
)
process.exitCode = failed === 0 && !short ? 0 : 1
