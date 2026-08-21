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
