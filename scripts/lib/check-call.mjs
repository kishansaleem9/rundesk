/*
 * WHAT A CHECK LOOKS LIKE IN A SUITE: `chk(` or `check(`, whichever the suite
 * named its helper.
 *
 * ONE COPY, BECAUSE THE COPIES HAD DRIFTED. `check-suite-check-branches.mjs`
 * matched both spellings; `check-suite-section-enders.mjs` (five rules) and
 * `lib/suite-reads.mjs` matched `chk(` alone — so the thirteen suites that call
 * their helper `check` (about 700 checks) were never read by the section-ender
 * rules at all, and those rules reported "0 site(s)" over them. The same blind
 * spot had already been found and fixed in `check-break-coverage.mjs`; nobody
 * brought it here.
 *
 * NOT `.check(`: that is Playwright ticking a checkbox. A dot, a word
 * character or `$` in front means a method or a longer name, not a call to the
 * suite's helper.
 */
export const CHECK_LINE = /^\s*(?:chk|check)\(/
export const CHECK_CALL = /(?<![.\w$])(?:chk|check)\s*\(/

/** Every check call in `src`: where it starts, and where its `(` is. */
export function* checkCalls(src) {
  const re = /(?<![.\w$])(?:chk|check)\s*\(/g
  for (let m; (m = re.exec(src)); ) yield { start: m.index, paren: m.index + m[0].length - 1 }
}
