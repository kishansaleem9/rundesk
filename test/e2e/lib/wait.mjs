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
 *
 * A QUESTION THAT NEVER ANSWERS IS A NO (`found-30-sep/a-hung-page-outlasts-every-wait`).
 * This awaited the predicate before it looked at the deadline, so a predicate
 * that never settled held the wait for ever: a Playwright call to a page whose
 * renderer had stopped answering. `task-attachments`' baseline went silent for
 * fourteen minutes that way, under a 20 s wait, and ended only at the break
 * runner's 900 s kill as one unexplained failed check. Each look now races the
 * time left, with a grace so a look started just before the deadline still
 * gets its answer, as it did before; a look still pending then counts as no,
 * and the wait gives up. The grace is 15 s because predicates wait inside
 * themselves: the longest waits 8 s (`comment-slash-commands`), and two 5 s
 * waits run back to back in `list-export`. So every predicate in the tree that
 * answers at all still answers, and one that never does costs its deadline
 * plus 15 s instead of the run.
 */
const PENDING = Symbol('pending')
export const LAST_LOOK_GRACE_MS = 15_000
/** `promise`, or PENDING if it has not settled within `ms`. */
export async function settledWithin(promise, ms) {
  let timer
  try {
    return await Promise.race([promise, new Promise((resolve) => { timer = setTimeout(resolve, ms, PENDING) })])
  } finally {
    clearTimeout(timer)
  }
}
export async function waitUntil(predicate, { timeoutMs = 8000, stepMs = 150, lastLookGraceMs = LAST_LOOK_GRACE_MS } = {}) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const left = deadline - Date.now()
      const answer = await settledWithin(Promise.resolve().then(predicate), Math.max(left, lastLookGraceMs))
      if (answer !== PENDING && answer) return true
    } catch {
      // A navigation mid-poll invalidates the execution context; that is a
      // reason to look again, not to fail.
    }
    if (Date.now() > deadline) return false
    await new Promise((resolve) => setTimeout(resolve, stepMs))
  }
}

/** Read a page's text, tolerating a navigation happening underneath. */
export async function textOf(page, { timeoutMs = 5000 } = {}) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      // A page that never answers is read as empty, not waited on for ever.
      const text = await settledWithin(page.evaluate(() => document.body?.innerText ?? ''), timeoutMs)
      return text === PENDING ? '' : text
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
 *
 * AND IT READS WHATEVER IT IS HANDED, hidden or not: a hidden element answers
 * `innerText` with its whole text. A check that the text is SHOWN hands this a
 * locator filtered to visible — `readText(el.filter({ visible: true }))` — so a
 * hidden element reads '' like a missing one; `check-suite-text-reads.mjs`
 * holds every call (`found-29-sep/innertext-reads-hidden-leaves`).
 */
export async function readText(locator, { timeoutMs = 8000 } = {}) {
  try {
    return await locator.innerText({ timeout: timeoutMs })
  } catch {
    return ''
  }
}

/**
 * Wait for a locator to match EXACTLY `expected` elements, and say whether it did.
 *
 * THE FIFTH MEMBER OF THE FAMILY at the top of this file, and the one that has
 * now cost a CI run. `checklists` asserted `(await blocks.count()) === 2`
 * thirty-one milliseconds after confirming the second checklist existed in the
 * database — before the page had refetched. It read 1, failed, and said "1
 * checklist blocks rendered for 2 checklists", which is a sentence about the
 * product being broken when the product was fine.
 *
 * WHAT MADE IT INVISIBLE. The very next check passed, because it typed into
 * `forms.nth(1)` and Playwright's own auto-wait held on until the second form
 * arrived. So the suite simultaneously claimed the second block did not exist
 * and used it. A race that contradicts itself inside one suite is one nobody
 * reads as a race.
 *
 * `count()` is the one Playwright read with NO auto-wait — it answers for the
 * DOM as it is at that instant, by design. Every other locator method waits.
 * That asymmetry is the whole trap: the fix is not a longer timeout somewhere,
 * it is asking the question as a condition instead of as a sample.
 *
 * Returns a boolean like `waitUntil`, so the caller still writes its own named
 * check and still fails when the count genuinely never arrives.
 */
export async function waitForCount(locator, expected, { timeoutMs = 15000, lastLookGraceMs } = {}) {
  return waitUntil(async () => (await locator.count()) === expected, { timeoutMs, lastLookGraceMs })
}
