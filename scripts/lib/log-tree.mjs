/*
 * WHICH TREE IS THIS NUMBER ABOUT?
 *
 * Every break log opens with the line `wt-break.sh` writes when it syncs the
 * worktree:
 *
 *     == syncing /tmp/claude-0/wt2 to 85025dfd
 *
 * That sha is the whole provenance of every number below it. A log is evidence
 * about THAT tree, and about the current one only while nothing it depended on
 * has moved.
 *
 * `never-run-plan.mjs --stale` used to answer this with the suite file's last
 * commit against the log's MTIME, and the mtime is the moment the run ENDED. So
 * a suite fix committed WHILE its set was running looked newer than the suite
 * and passed the test — while every patch in that run had been measured minutes
 * earlier against the unfixed suite. `folder-dialog` fixed at 06:29:10 with a
 * log stamped 06:29:50 is exactly that: `fd-7-toggle-latches` ran at 06:27, the
 * plan said the suite was current, and the patch was never re-measured. Two
 * suites were in that state, and the two patches were the ones whose greens the
 * fixes were FOR.
 *
 * And it only ever asked about the SUITE. A green that was fixed in the PRODUCT
 * leaves the suite file untouched, so the log stayed "fresh" by a rule that
 * could not see the change it was fixed by. `folder-create-12-toast-bottom-right`
 * is that one: the number on disk predates the code it is about, and no mode of
 * the plan generator would name it.
 *
 * The sha removes both, because it is a statement about the tree rather than
 * about the clock. A log is current when nothing the run depended on differs
 * between its sha and HEAD.
 *
 * WHAT A RUN DEPENDS ON: the suite that does the measuring, and the product
 * files the patch edits. Not the patch file itself — patches are authored,
 * re-worded and re-headed constantly, and `check-break-reddened.mjs` already
 * re-reads each claim against the log's own text, so a comment edit would
 * otherwise invalidate 26 more measurements than the code in it justifies.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

// THE FOUR LINES THAT LOOK LIKE A PATCH AND ARE NOT. `wt-break.sh` writes its
// own progress with the same `== ` prefix a patch result uses, so anything
// reading these files needs this list — and it is exported rather than spelled
// out twice, because `check-break-freshness.mjs` had its own copy and this
// module quietly recorded `restoring` as a patch measured at some commit.
// `classify-break-log.awk` holds the third copy, in a language that cannot
// import this one; the two that can, do.
export const CONTROL = /^== (syncing|BASELINE|restoring|REFUSING)\b/

// AND THE FOUR LINES THAT NAME A PATCH WHICH NEVER RAN. `wt-break.sh` writes
// `== <patch> MISSING`, `PATCH FAILED`, `PATCH CHANGED NOTHING` and
// `BUILD FAILED` when a patch could not be applied, changed nothing, or did not
// compile — and the suite never ran against it. These were read as
// measurements at that sha: the planner skipped the patch as measured, and the
// reddened checker read the PREVIOUS run's `brk-<patch>.log` and dated it by
// the new sha. It went live on 23 September: five "refuses everything" patches
// failed to build in both of their runs and were on record as measured.
// `classify-break-log.awk` already knew these four; this module did not.
export const NOT_RUN = /^== \S+ (MISSING|PATCH FAILED|PATCH CHANGED NOTHING|BUILD FAILED)\b/

// The sha in force at each patch's line, from the NEWEST log that names it.
//
// Newest rather than first, because a patch measured twice is described by its
// latest run — and the sha is read forward through the file rather than off line
// one, so a log holding two runs attributes each patch to the sync above it
// rather than to the top of the file.
export function measuredAt(logsDir) {
  const at = new Map()
  // SORTED, so the answer does not depend on the order the filesystem hands
  // names back. Without it the mtime comparison below is only consulted when
  // readdir happens to yield the older file first — which is how the case
  // written to prove the comparison passed with the comparison deleted.
  for (const f of readdirSync(logsDir).filter((n) => /^break-.+\.txt$/.test(n)).sort()) {
    const path = join(logsDir, f)
    const mtime = statSync(path).mtimeMs
    let sha = null
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const s = line.match(/^== syncing \S+ to ([0-9a-f]{7,40})/)
      if (s) {
        sha = s[1]
        continue
      }
      const m = line.match(/^== ([a-z0-9][a-z0-9-]*)\b/)
      if (!m || CONTROL.test(line) || NOT_RUN.test(line)) continue
      const prev = at.get(m[1])
      if (!prev || prev.mtime < mtime) at.set(m[1], { sha, mtime, log: f })
    }
  }
  return at
}

// A PATCH MAY SAY THAT ITS OWN LOG IS NOT EVIDENCE, with a header line
//
//     # Re-run: <why>
//
// and then it is in the work list until it has been measured after that line
// was written. One patch has needed it:
// `folder-create-12-toast-bottom-right` edits `packages/ui`, and it was run
// while `wt-break.sh` applied `packages/**` patches in the worktree and built
// from the repo — so the change never reached the app, the position check it
// aims at passed, and three checks about a 409 message failed for reasons a
// toast-position patch cannot cause. Nothing in the TREE changed to fix that;
// the RUNNER did, and a rule about files cannot see it.
//
// Its header already said "the fix is a re-run, not a re-aim, and `folder-create`
// is in the stale plan". That sentence was false — the plan's rule could not
// see this patch at all — and a claim in a header that nothing checks is the
// stale reason this audit keeps finding. This makes the sentence true by making
// it mechanical.
//
// IT IS SPENT BY BEING MEASURED, not by being deleted. The declaration counts
// while the patch file has changed since the run that measured it: I edited the
// patch to say "this needs re-running", so any measurement older than that edit
// predates the declaration. Once it re-runs, the new log's commit is at or
// after the edit, the diff is empty, and the patch leaves the list on its own.
// A declaration that could never be spent would keep a chain of rounds running
// forever on one row.
// `[ \t]` rather than `\s`, because `\s` matches the NEWLINE: `# Re-run:` with
// nothing after it read as a declaration whose reason was the first word of the
// next line, so a patch could be put back in the work list by an empty label.
export const declaresRerun = (text) => /^#[ \t]*Re-run:[ \t]*\S/im.test(text)

// The product files a patch edits, as the patch itself names them. Patches
// address the checkout absolutely (`p = '/home/user/rundesk/apps/web/...'`), so
// the repo-relative tail is what git wants.
export function patchDeps(text, suite) {
  /*
   * `$` IS IN THE CLASS, AND LEAVING IT OUT COST 75 PATCHES THEIR PRODUCT
   * DEPENDENCY.
   *
   * TanStack Router names its files after their parameters, so the biggest
   * route in this product is
   * `apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx` —
   * the list, board, calendar and Gantt views in one file. Without `$` the
   * match stopped at `apps/web/src/routes/app.`, a path that does not exist,
   * and `drifted()` cannot report a change to a file it is not looking at. So
   * every one of the 75 patches that edits that route recorded a dependency on
   * nothing, and a change to it marked none of them as needing a re-run.
   *
   * The sweep's terminal sentence — "every log on disk measured the current
   * tree" — was false for those 75 whenever that file moved, and nothing said
   * so. Found by `check-plan-population`, which exists because these two
   * instruments have to answer one question the same way.
   *
   * 77 files under `apps/` and `packages/` carry a `$`, and no tracked path
   * needs any character outside this class.
   */
  const deps = new Set(
    [...text.matchAll(/\/home\/user\/rundesk\/((?:apps|packages)\/[A-Za-z0-9_.$/-]+)/g)].map(
      (m) => m[1],
    ),
  )
  if (suite) {
    deps.add(`test/e2e/${suite}.mjs`)
    for (const lib of suiteLibs(suite)) deps.add(lib)
  }
  return [...deps]
}

/*
 * THE HELPERS A SUITE IMPORTS ARE PART OF WHAT IT MEASURES.
 *
 * A measurement depended on the files its patch edits and on the suite — and
 * not on `test/e2e/lib`, which nearly every suite imports: `signin.mjs` in 97 of
 * them, `wait.mjs` in 79, `chain.mjs` in 10. A change to `waitUntil` or to the
 * chain helper changes what every importing suite measures, and the planner,
 * the reddened checker and freshness all went on calling the old logs current.
 * `chain.mjs` has changed behaviour before (580793d, "the chain helper had the
 * hole it exists to prevent").
 *
 * Followed through the helpers that import each other (`signin.mjs` is
 * imported by two of them), static `from`/`import` and dynamic `import()`
 * alike, and cached per suite: the planner asks once per patch.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const libCache = new Map()
const IMPORTED = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+\.mjs)['"]/g
export function suiteLibs(suite, root = REPO_ROOT) {
  const key = `${root}\0${suite}`
  if (libCache.has(key)) return libCache.get(key)
  const found = new Set()
  const visit = (rel) => {
    let src
    try {
      src = readFileSync(join(root, rel), 'utf8')
    } catch {
      return
    }
    for (const m of src.matchAll(IMPORTED)) {
      const dep = posix.normalize(posix.join(posix.dirname(rel), m[1]))
      if (!dep.startsWith('test/e2e/lib/') || found.has(dep)) continue
      found.add(dep)
      visit(dep)
    }
  }
  visit(`test/e2e/${suite}.mjs`)
  const libs = [...found].sort()
  libCache.set(key, libs)
  return libs
}

// `(record from measuredAt, deps) => why this measurement is not about HEAD`,
// empty when it is. The record may be missing entirely (no log names this patch)
// or carry a null sha (a log from before the line was written), and BOTH are
// reasons rather than absences: the tempting `rec?.sha ? drifted(…) : []` reads
// every unplaceable log as current, which is the direction that turns a stale
// green into a measurement. Two callers had that conditional written out by
// hand, so it lives here with the test beside it.
//
// A `# Re-run:` declaration is ONE OF THOSE REASONS, and it lives here so the
// planner and the reddened checker cannot disagree about it. The planner
// honoured it and the checker could not see it (its body comparison strips
// every `#` line, and the declaration is one), so while a re-run was pending
// the checker credited as current a log the patch itself said was not
// evidence. Both now compare the WORKING COPY, which is what `wt-break.sh`
// runs; the planner's old test read `git diff sha HEAD`, committed changes
// only.
export function makeMeasurementCheck({ root }) {
  const drifted = makeDriftCheck({ root })
  return (rec, deps, patch = null) => {
    if (!rec) return ['<no run log>']
    if (!rec.sha) return ['<no commit recorded>']
    if (patch && declaresRerun(patch.text) && patchFileMoved({ root, sha: rec.sha, name: patch.name, text: patch.text })) {
      return [`test/e2e/breaks/${patch.name}.py <declares Re-run>`]
    }
    const moved = drifted(rec.sha, deps)
    if (moved.length || !patch) return moved
    return patchCodeMoved({ root, sha: rec.sha, name: patch.name, text: patch.text })
  }
}

// THE PATCH'S OWN CODE IS A DEPENDENCY, AND ITS COMMENTS ARE NOT.
//
// `patchDeps` deliberately leaves the patch file out: headers are re-worded
// constantly, `check-break-reddened.mjs` re-reads every claim against the log's
// own text anyway, and treating a comment edit as a re-measurement would have
// invalidated twenty-six runs for nothing.
//
// Then I rewrote what `po-3-one-provider` DOES — it had been setting the
// `hidden` attribute, which a Tailwind class overrides, so it hid nothing and
// ran green twice — and nothing put it back in the work list. The rule that
// protects against comment churn also hid a patch that had become a different
// patch. So the comparison is against the code with the `#` lines stripped:
// a reworded header changes nothing, a rewritten body is a re-run.
//
// A PATCH THAT WAS NOT YET COMMITTED WHEN IT RAN cannot be compared at all —
// `wt-break.sh` applies the working copy, so a patch written and run in the same
// minute has no blob at that sha. UNKNOWN is not CURRENT: that is a reason, and
// twenty-odd patches are in that state until their next run records them.
const stripComments = (text) =>
  text
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n')
    .trim()

const patchAt = ({ root, sha, name }) => {
  try {
    return execFileSync('git', ['show', `${sha}:test/e2e/breaks/${name}.py`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return null
  }
}

function patchCodeMoved({ root, sha, name, text }) {
  const path = `test/e2e/breaks/${name}.py`
  const was = patchAt({ root, sha, name })
  if (was === null) return [`${path} <not committed when it ran>`]
  return stripComments(was) === stripComments(text) ? [] : [`${path} <body>`]
}

// The whole file, comments included — the declaration IS a comment, and it is
// spent by the measurement that postdates it, whatever else the edit touched.
// A patch with no blob at that sha had not been written when it ran, so its
// declaration cannot have been measured either.
const patchFileMoved = ({ root, sha, name, text }) => {
  const was = patchAt({ root, sha, name })
  return was === null || was !== text
}

// `(sha, paths) => the paths that changed between sha and HEAD`, memoised
// because 650 patches across 80 suites ask the same question a few hundred
// times. An unknown sha answers `['<unknown commit>']`: a log whose tree cannot
// be found is not evidence that the tree is unchanged.
export function makeDriftCheck({ root }) {
  const cache = new Map()
  return (sha, paths) => {
    if (!paths.length) return []
    const key = `${sha}\u0000${paths.join('\u0000')}`
    if (cache.has(key)) return cache.get(key)
    let out
    try {
      out = execFileSync('git', ['diff', '--name-only', sha, 'HEAD', '--', ...paths], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .trim()
        .split('\n')
        .filter(Boolean)
    } catch {
      out = ['<unknown commit>']
    }
    cache.set(key, out)
    return out
  }
}
