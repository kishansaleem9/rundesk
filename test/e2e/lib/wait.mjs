/**
 * Waiting, for browser suites.
 *
 * Three CI failures in a row on this branch were test-authoring mistakes of the
 * same family, none reproducible locally:
 *
 *  - "the skeleton clears" written as `waitForTimeout(900)` then measure. That
 *    is not an assertion about the app, it is a bet on how fast the machine is,
 *    and a CI runner wins that bet against a laptop every time.
 *
 *  - a `.check()` on a control whose state comes back from the server, against a
 *    stub that accepted the write and then kept answering with the old value.
 *    The UI wrote, re-read, saw no change and reverted; the assertion failed
 *    while the app behaved correctly. It passed locally only because the
 *    refetch happened to land after the assertion rather than before.
 *
 * The shape shared by both: the test sampled at a moment instead of waiting for
 * a condition. `waitUntil` is the fix for the first, and a stub that applies
 * what it is given is the fix for the second — see the mutable profile in
 * video1-fast-items.mjs.
 */

/**
 * Poll until `predicate()` is truthy, or give up. Returns whether it converged,
 * so the caller still fails when it genuinely never happens — the point is to
 * stop failing when it happens a little later than expected.
 */
export async function waitUntil(predicate, { timeoutMs = 8000, stepMs = 150 } = {}) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      if (await predicate()) return true
    } catch {
      // A navigation mid-poll invalidates the execution context; that is a
      // reason to look again, not to fail.
    }
    if (Date.now() > deadline) return false
    await new Promise((resolve) => setTimeout(resolve, stepMs))
  }
}

/** Read a page's text, tolerating a navigation happening underneath. */
export async function textOf(page) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await page.evaluate(() => document.body?.innerText ?? '')
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
  return ''
}

/**
 * Read one element's text, or come back empty — never throw.
 *
 * THE FOURTH MEMBER OF THE FAMILY described at the top of this file, and it cost
 * two CI runs before it was named. `await page.getByTestId('x').innerText()` on
 * an element that never mounts does not fail fast: Playwright auto-waits its
 * default thirty seconds and then THROWS. The suite dies with `threw: ...`, no
 * check name attached, thirty seconds of a finite CI budget spent, and nothing
 * in the log to debug from — while the same read passes locally because the
 * machine is quicker and the element happens to be there.
 *
 * That is how `teams-destination` failed on one run and `ai-value` on another.
 * Both were reading an element that a slower runner had not drawn yet.
 *
 * So: a SHORT bounded wait, and '' when it does not arrive. The caller then
 * writes a named check against the text, which fails saying WHICH element was
 * missing instead of dying anonymously. Empty string is deliberately not
 * special-cased here — an assertion on '' fails on its own, and it fails with
 * the caller's own words.
 */
export async function readText(locator, { timeoutMs = 8000 } = {}) {
  try {
    return await locator.innerText({ timeout: timeoutMs })
  } catch {
    return ''
  }
}
