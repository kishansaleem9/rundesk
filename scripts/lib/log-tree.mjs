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
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

// THE FOUR LINES THAT LOOK LIKE A PATCH AND ARE NOT. `wt-break.sh` writes its
// own progress with the same `== ` prefix a patch result uses, so anything
// reading these files needs this list — and it is exported rather than spelled
// out twice, because `check-break-freshness.mjs` had its own copy and this
// module quietly recorded `restoring` as a patch measured at some commit.
// `classify-break-log.awk` holds the third copy, in a language that cannot
// import this one; the two that can, do.
export const CONTROL = /^== (syncing|BASELINE|restoring|REFUSING)\b/

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
      if (!m || CONTROL.test(line)) continue
      const prev = at.get(m[1])
      if (!prev || prev.mtime < mtime) at.set(m[1], { sha, mtime, log: f })
    }
  }
  return at
}

// The product files a patch edits, as the patch itself names them. Patches
// address the checkout absolutely (`p = '/home/user/rundesk/apps/web/...'`), so
// the repo-relative tail is what git wants.
export function patchDeps(text, suite) {
  const deps = new Set(
    [...text.matchAll(/\/home\/user\/rundesk\/((?:apps|packages)\/[A-Za-z0-9_./-]+)/g)].map(
      (m) => m[1],
    ),
  )
  if (suite) deps.add(`test/e2e/${suite}.mjs`)
  return [...deps]
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
