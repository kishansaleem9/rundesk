#!/usr/bin/env node
/**
 * How many suites have ever had a break patch written for them at all.
 *
 * THE AUDIT HAS BEEN REPORTING "N break-tested" PER ROW AND NEVER THE
 * DENOMINATOR. Counted on 21 September: 101 suites carry 1961 checks between
 * them, and **47 suites had no break patch at all** — including the largest
 * ones in the repository: `video-regression` (81 checks),
 * `custom-field-progress` (58), `task-menu` (33), `comment-recording` (32),
 * `a61-meeting-record` (28), `task-merge` and `list-export` (25 each).
 *
 * THE FIRST ANSWER WAS 53, AND IT WAS REPORTED BEFORE IT WAS CHECKED. That
 * version attributed a patch by `# Reddens: <suite>:` or by a filename prefix,
 * and missed two shapes: `# Reddens: task-field-create — "…"` separates with an
 * EM DASH, and the abbreviated prefixes (`tfc-`, `taf-`, `tai-`, `lwb-`) match
 * no suite filename. 64 patches went unattributed and four suites that DO have
 * patches were counted as having none. The pile of unattributed patches was
 * sitting in the output the whole time as a number in brackets.
 *
 * Twenty-eight have been closed since — `task-menu`, `custom-field-progress`,
 * `list-export`, `task-merge`, `comment-recording`, `view-visibility`,
 * `list-name-taken`, `checklists`, `ai-value`, `planner-blocks`,
 * `login-workspace-binding`, `space-presets`, `doc-task-links`,
 * `malformed-ids`, `trending-sort`, `undo-delete`, `task-provenance`,
 * `search-sources`, `bookmarks`, `list-statuses-seeded`, `list-save-view`,
 * `replies-inline-thread`, `request-access`, `planner-priorities`,
 * `space-features` and `assign-to-priorities` among them — so the ratchet
 * stands at 19. The count printed is always the current one; the paragraph
 * above is what it was when anybody first looked.
 *
 * KEEP THIS PARAGRAPH IN STEP WITH THE CONSTANT. It said 37 while the constant
 * said 27, which is the stale-reason defect in the file that exists to stop a
 * number describing something it no longer describes.
 *
 * A suite with no patch is not a suite that failed. It is a suite about which
 * nothing is known: every one of its checks may be a facade, and being green
 * says nothing either way. That is the same sentence this audit has applied to
 * individual checks since step 6 was written down, and it had never been
 * applied to the set of suites as a whole.
 *
 * This is deliberately NOT a count of checks proven. One patch can redden
 * several checks and most do; the honest thing a static reading can say is
 * whether a suite has ever been AIMED at, and it says that.
 *
 * AND IT CANNOT TELL WHETHER THE AIM WAS ANY GOOD. `save-comment` counted as
 * covered while both its patches edited `notifications.snoozedUntil` — the
 * snooze that puts a NOTIFICATION in the Later tab — and the suite reads
 * `task_comment_saves`, a different table behind a different endpoint. Their
 * `# Reddens:` lines quoted real sentences from the suite, so
 * `check-break-claims.mjs` verified them and this file attributed them; both
 * ran green because they had nothing to do with the feature.
 *
 * No static reading can catch that: the claim was true and the code was wrong.
 * Only the run distinguishes a patch aimed at a suite from a patch that
 * reaches it. So this number means "somebody has tried", and the ledger's
 * section 8 — which records what actually reddened — is where "it works" is
 * written down.
 *
 * Registered as a ratchet: the count of uncovered suites may fall and may not
 * rise, so a new suite arrives with a patch or fails the build that brings it.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SUITES = join(ROOT, 'test/e2e')
const BREAKS = join(ROOT, 'test/e2e/breaks')

const suiteNames = readdirSync(SUITES)
  .filter((f) => f.endsWith('.mjs'))
  .map((f) => f.slice(0, -4))

const checksIn = {}
for (const n of suiteNames) {
  checksIn[n] = (readFileSync(join(SUITES, `${n}.mjs`), 'utf8').match(/\bchk\(/g) || []).length
}

// The longest prefix of a patch's filename that is a suite — step two of the
// three below.
const prefixSuite = (name) => {
  const p = name.split('-')
  for (let i = p.length; i > 0; i--) {
    const c = p.slice(0, i).join('-')
    if (existsSync(join(SUITES, `${c}.mjs`))) return c
  }
  return null
}

/*
 * ATTRIBUTION HAS THREE STEPS, AND THE FIRST VERSION HAD ONE AND A HALF.
 *
 * It read `# Reddens: <suite>:` and fell back to the filename prefix. That
 * missed two whole shapes and produced a headline number that was too big:
 *
 *   - `# Reddens: task-field-create — "…"` separates with an EM DASH, not a
 *     colon. Nine `tfc-*` patches were invisible to it;
 *   - the abbreviated prefixes — `tfc-`, `taf-`, `tai-`, `lwb-` — match no
 *     suite filename, so the fallback could not save them either.
 *
 * 64 patches went unattributed and four suites that DO have patches were
 * reported as having none, which was published as "53 suites have never had a
 * single break patch" before anybody checked the unattributed pile. So the
 * third step is the one `check-break-claims.mjs` already uses: ask which suite
 * actually contains the sentence the patch quotes. A patch that names its check
 * can always be attributed, whatever punctuation it used.
 */
const norm = (s) =>
  s
    .replace(/\\(["'\\])/g, '$1')
    .replace(/[\u2018\u2019\u02bc'"\u201c\u201d]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
const hayOf = new Map()
const hayFor = (s) => {
  if (!hayOf.has(s)) hayOf.set(s, norm(readFileSync(join(SUITES, `${s}.mjs`), 'utf8')))
  return hayOf.get(s)
}
const MIN_WORDS = 5
const findsClaim = (hay, q) => {
  if (hay.includes(q)) return true
  const w = q.split(' ')
  for (let len = w.length - 1; len >= MIN_WORDS; len--) {
    for (let i = 0; i + len <= w.length; i++) {
      if (hay.includes(w.slice(i, i + len).join(' '))) return true
    }
  }
  return false
}

const patches = {}
const unattributedNames = []
for (const f of readdirSync(BREAKS).filter((x) => x.endsWith('.py'))) {
  const text = readFileSync(join(BREAKS, f), 'utf8')
  // A colon, an em dash or a hyphen after the suite name — all three are in use.
  const named = (text.match(/^#\s*Reddens:\s*([a-z0-9][a-z0-9-]*)\s*[:\u2014-]/im) || [])[1]
  let suite =
    (named && existsSync(join(SUITES, `${named}.mjs`)) && named) || prefixSuite(f.slice(0, -3))
  if (!suite) {
    // The sentence decides. Only when exactly one suite holds it, because two
    // would be a guess and a guess in a coverage number is how this went wrong.
    const block = text.match(/^#\s*Reddens:[\s\S]*?(?=^[^#]|^#\s*$)/m)?.[0] ?? ''
    for (const q of [...block.matchAll(/"((?:[^"\\]|\\.){8,}?)"/g)].map((m) => norm(m[1]))) {
      const hits = suiteNames.filter((n) => checksIn[n] > 0 && findsClaim(hayFor(n), q))
      if (hits.length === 1) {
        suite = hits[0]
        break
      }
    }
  }
  if (suite) patches[suite] = (patches[suite] ?? 0) + 1
  else unattributedNames.push(f.slice(0, -3))
}
const unattributed = unattributedNames.length

const withChecks = suiteNames.filter((n) => checksIn[n] > 0)
const uncovered = withChecks.filter((n) => !patches[n]).sort((a, b) => checksIn[b] - checksIn[a])
const totalChecks = withChecks.reduce((a, n) => a + checksIn[n], 0)
const totalPatches = Object.values(patches).reduce((a, b) => a + b, 0)

console.log(
  `[break-coverage] ${withChecks.length} suites · ${totalChecks} checks · ${totalPatches} patches ` +
    `attributed (${unattributed} could not be attributed to a suite)`,
)
console.log(`[break-coverage] ${uncovered.length} suites have NO break patch at all:`)
for (const n of uncovered) console.log(`    ${String(checksIn[n]).padStart(3)} checks  ${n}`)
if (unattributedNames.length) {
  // NAMED, NOT COUNTED. Every one of these has no `# Reddens:` line at all, so
  // nothing but reading it says which suite it belongs to — and a bare count
  // of them is how the first version of this file hid four covered suites.
  console.log(`\n[break-coverage] ${unattributedNames.length} patches name no check, so they`)
  console.log('               belong to no suite here and count towards none:')
  for (const n of unattributedNames) console.log(`    ${n}`)
}

// THE RATCHET. Lower it when a suite is covered; never raise it to pass.
const BASELINE_UNCOVERED = 19
if (uncovered.length > BASELINE_UNCOVERED) {
  console.error(
    `\n[break-coverage] WORSE: ${BASELINE_UNCOVERED} → ${uncovered.length} suites with no break patch.`,
  )
  console.error('  A new suite arrives with a patch, or this build fails. Do not raise the baseline.')
  process.exit(1)
}
if (uncovered.length < BASELINE_UNCOVERED) {
  console.log(`\n[break-coverage] better — lower the baseline in this file to ${uncovered.length}`)
}
process.exit(0)
