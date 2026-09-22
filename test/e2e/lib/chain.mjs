/**
 * A chain of checks that reports the same number whichever way it goes.
 *
 * WHY THIS EXISTS. Every suite in `test/e2e` compares its check count against
 * its own `EXPECTED_CHECKS`, and most of them do it with `!==`. So an `if`
 * whose body calls `check()` and which has no `else` makes the run's LENGTH
 * conditional — and a real regression inside one of those branches then
 * reports
 *
 *     84 passed, 4 failed
 *     ✗ 88 of 92 checks ran — this run stopped early
 *
 * with the failures it found sitting underneath a headline that says the
 * HARNESS is broken. A person reading that reaches for the harness.
 * `scripts/check-suite-check-branches.mjs` counts the shape; this is the fix.
 *
 * ONE COPY, BECAUSE IT WAS TWO WITHIN AN HOUR. `panel-collapse` and
 * `syncup-live` each grew their own `chain()` the same afternoon, and a named
 * helper duplicated across two files is the defect this audit calls the
 * duplicated list — two copies that are individually plausible and drift. The
 * closure over `check` is why it takes it as an argument rather than importing
 * one: each suite counts its own passes and failures.
 *
 *     const chain = makeChain(check)          // once, beside the helper
 *     const c = chain('the control is there', 'and pressing it works')
 *     c.step(haveControl, 'no control in the footer')
 *     if (!haveControl) c.rest('skipped: there was nothing to press')
 *     else c.step(await pressed(), 'it did nothing')
 *
 * `step` reports the next label in the list. `rest` reports everything left as
 * FAILED with the reason the chain stopped — not as absent, and not as passed.
 * A check that did not run is a check nobody knows the answer to, and the
 * honest way to say that is to fail it with a sentence explaining why.
 *
 * `skipRest` is the exception and it is narrow: a gate on the MACHINE or the
 * DEPLOYMENT rather than on the product — no routable audio output, no object
 * storage configured, an entitlement the tenant does not have. Those are
 * genuinely unknown rather than broken, and a suite that failed on them would
 * be red on every runner without a soundcard. It needs a `skip` function that
 * COUNTS, so the run total stays the same number on every machine; without one
 * `skipRest` is not available, because a skip that is not counted is exactly
 * the short run this module exists to stop.
 *
 * A SKIP REACHABLE BY A PRODUCT REGRESSION IS A CHECK THAT CANNOT FAIL. If the
 * browser has outputs and the app offers no picker, that is a failure. Only the
 * outer, environmental question skips.
 */

/**
 * @param {(ok: boolean, label: string, detail?: string) => void} check
 * @param {(label: string, why: string) => void} [skip] counted skip; required for `skipRest`
 */
export function makeChain(check, skip) {
  return (...labels) => {
    let at = 0
    return {
      /**
       * Report the next check in the chain. `label` overrides for a template
       * literal.
       *
       * IT THROWS PAST THE END, AND IT DID NOT WHEN THIS WAS WRITTEN. With
       * more `step` calls than labels, `labels[at]` is `undefined` and the
       * check went out with NO SENTENCE — printing `PASS undefined` and
       * counting towards the total, so a chain used past its length silently
       * inflates the count with a nameless check. That is the defect this
       * whole module exists to prevent, in the module itself; it was found by
       * calling `step` three times on a chain of two.
       *
       * A suite wraps its body, so the throw arrives as a failure carrying
       * this message — which is worth incomparably more than a nameless pass.
       */
      step: (cond, detail = '', label) => {
        // Regardless of the override. A label replaces the sentence AT a valid
        // index; it does not add one, because `rest` and the suite's own
        // `EXPECTED_CHECKS` both depend on the declared length being the
        // chain's real length.
        if (at >= labels.length) {
          throw new Error(
            `chain(${labels.length} labels) got step #${at + 1} — the chain is out of ` +
              `sentences, so this check would report as \`undefined\` and inflate the count. ` +
              `Labels: ${JSON.stringify(labels)}`,
          )
        }
        const l = label ?? labels[at]
        at += 1
        check(cond, l, detail)
      },
      /** Report every remaining check as FAILED, with the reason the chain stopped. */
      rest: (why) => {
        while (at < labels.length) {
          check(false, labels[at], why)
          at += 1
        }
      },
      /** Report every remaining check as SKIPPED — machine or deployment gates only. */
      skipRest: (why) => {
        if (!skip) {
          throw new Error(
            'makeChain was given no skip function, so skipRest would not be counted — ' +
              'an uncounted skip is the short run this module exists to prevent',
          )
        }
        while (at < labels.length) {
          skip(labels[at], why)
          at += 1
        }
      },
    }
  }
}
