/**
 * WHICH SUITE IS THIS BREAK PATCH ABOUT? One answer, in one place.
 *
 * WHY THIS EXISTS. There were FOUR copies of this question and they gave
 * different answers:
 *
 *   - `check-break-coverage.mjs` had three steps — the named suite, the
 *     filename prefix, then the suite that contains the quoted sentence — and
 *     a delimiter set of colon, em dash or hyphen.
 *   - `check-break-claims.mjs` had step one with a COLON ONLY, plus step two.
 *   - `check-break-freshness.mjs` had step one and nothing else, with
 *     `[,:—-]` as the delimiter.
 *   - `never-run-plan.mjs` copied freshness's, which is how a copy becomes
 *     four.
 *
 * The cost was measurable and had two halves. Freshness reported 24 patches as
 * "(no suite named)" that coverage attributes perfectly well through the
 * filename prefix — nine `sidebar-dms-*`, five `teams-empty-state-*` and eight
 * `list-customize-*` — so the plan built from that list could not schedule
 * them, and a patch that cannot be scheduled is a patch that stays unmeasured.
 *
 * And `[,:—-]` had a backtracking bug that made the shortfall worse than the
 * missing steps. `# Reddens: sidebar-dms "the workspace tree has a Direct
 * Messages section"` separates with a SPACE, so the regex matched `sidebar`
 * and used the `-` as its delimiter: a suite name silently truncated at the
 * first hyphen, reported as a suite that does not exist.
 *
 * So step one asks for the identifier and then WALKS IT BACK a segment at a
 * time until a tracked suite file turns up, which subsumes every delimiter
 * anybody used — colon, em dash, hyphen, comma, space, quote — and cannot
 * invent a shorter name that happens to exist.
 *
 * THE THREE STEPS, IN ORDER, AND EACH IS WEAKER THAN THE ONE BEFORE:
 *
 *   1. the suite the header NAMES. The author said so.
 *   2. the longest prefix of the patch's FILENAME that is a suite. A
 *      convention, and it holds for most of them.
 *   3. the suite that CONTAINS the sentence the patch quotes — and only when
 *      exactly one does, because two would be a guess, and a guess inside a
 *      coverage number is how "53 suites have never had a break patch" got
 *      published with 64 unattributed patches sitting in the brackets beside
 *      it.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { norm, findsClaim, quotedIn } from './claim-match.mjs'

/**
 * The `# Reddens:` line and its indented continuations, as one string.
 *
 * LINE BY LINE RATHER THAN ONE REGEX, for two reasons found by testing it.
 * `check-break-coverage.mjs` used `/^#\s*Reddens:[\s\S]*?(?=^[^#]|^#\s*$)/m`,
 * which needs a following line to stop at — so a header whose Reddens block is
 * the LAST thing in the file extracted nothing at all, silently. Every real
 * patch has `import io` under it, so it never showed; a test of the contract
 * found it in the first minute.
 *
 * And the stop condition is the two-space indent, not "any further comment
 * line". That is the rule the rest of this audit uses — a `#` line with one
 * space of indent is a new paragraph, which is how eleven claims came to be
 * truncated mid-quote — so a looser block here would hand step three sentences
 * the author never claimed.
 */
export const reddensText = (text) => {
  const lines = text.split('\n')
  const i = lines.findIndex((l) => /^#\s*Reddens:/i.test(l))
  if (i === -1) return ''
  const out = [lines[i]]
  for (let j = i + 1; j < lines.length && /^#\s\s+\S/.test(lines[j]); j += 1) out.push(lines[j])
  return out.join('\n')
}

/**
 * @param {object} opts
 * @param {string} opts.suiteDir directory holding `<suite>.mjs`
 * @param {string[]} [opts.candidates] suites step 3 may answer with; defaults
 *   to none, which disables step 3. Callers that have a reason to narrow it —
 *   coverage only counts suites declaring `EXPECTED_CHECKS` — pass their own.
 * @returns {(patchName: string, text: string) => string | null}
 */
export function makeSuiteOf({ suiteDir, candidates = [] }) {
  const has = (n) => existsSync(join(suiteDir, `${n}.mjs`))
  const hayOf = new Map()
  const hayFor = (s) => {
    if (!hayOf.has(s)) hayOf.set(s, norm(readFileSync(join(suiteDir, `${s}.mjs`), 'utf8')))
    return hayOf.get(s)
  }

  // 1. What the header names, walked back to something that exists.
  const named = (text) => {
    const m = text.match(/^#\s*Reddens:\s*([a-z0-9][a-z0-9-]*)/im)
    if (!m) return null
    let n = m[1]
    for (;;) {
      if (has(n)) return n
      const cut = n.lastIndexOf('-')
      if (cut <= 0) return null
      n = n.slice(0, cut)
    }
  }

  // 2. The longest prefix of the filename that is a suite.
  const byFilename = (patchName) => {
    const p = patchName.split('-')
    for (let i = p.length; i > 0; i--) {
      const c = p.slice(0, i).join('-')
      if (has(c)) return c
    }
    return null
  }

  /*
   * 3. The sentence decides, and only when it decides uniquely.
   *
   * NOT FOR A `unit:` CLAIM, and that was a false attribution rather than a
   * theory. `aar-17-views-hardcoded` names `unit: ai-containers.test.ts "does
   * NOT offer a view the space does not enable"`, a sentence that exists in
   * that `*.test.ts` and in no e2e suite at all — and step 3 attributed it to
   * `ai-answer-rendering` anyway, because `findsClaim` falls back to a
   * five-word FRAGMENT and some fragment of the block's second quoted span
   * turns up there. A patch whose evidence is a unit test run is not evidence
   * about an e2e suite, however well a fragment of its sentence matches one.
   */
  const bySentence = (text) => {
    if (!candidates.length) return null
    const block = reddensText(text).replace(/^#\s*Reddens:/i, '').trim()
    if (/^unit\b/i.test(block)) return null
    for (const q of quotedIn(reddensText(text))) {
      const hits = candidates.filter((n) => findsClaim(hayFor(n), q))
      if (hits.length === 1) return hits[0]
    }
    return null
  }

  return (patchName, text) => named(text) || byFilename(patchName) || bySentence(text) || null
}
