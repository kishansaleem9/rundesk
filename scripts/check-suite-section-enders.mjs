#!/usr/bin/env node
/*
 * THE TWO INTERACTIONS THAT END A SECTION INSTEAD OF REPORTING.
 *
 * RULE ONE — A PRESS ON A CONTROL THE CHECK ABOVE IT IS ALLOWED TO FIND ABSENT.
 *
 * The shape, and it cost more than any other single thing in this sweep:
 *
 *     chk(await visible('list-empty-clear-filters'), 'there is a control to clear', …)
 *     await page.getByTestId('list-empty-clear-filters').click()
 *
 * When that check fails — which is the entire purpose of the break patch that
 * makes it fail — the press waits Playwright's default thirty seconds, throws,
 * and the throw ends the section. `list-empty-states-2-same-copy` removes the
 * undo control and reported 14 of 23 checks. `imports-3-deadpreset` leaves Start
 * disabled and reported 7 of 19: twelve checks about what the import wrote,
 * silenced by one click, under a row crediting the patch with the one reddening
 * it claims.
 *
 * WHY THIS ONE GETS A CHECKER WHEN THE READS DID NOT. The same scan over
 * `innerText` and `getAttribute` found nine candidates and SIX were already
 * guarded — by `&&` short-circuiting, which is the idiom these suites use and
 * which a text rule cannot see. Six working call sites reported as defects is a
 * checker nobody would keep. A bare standalone `await X.click()` has no
 * short-circuit to hide behind: all nineteen found this way were real, and the
 * fix is mechanical because catching a press changes no verdict — no check
 * asserts that a click succeeded, they assert the state after it.
 *
 * WHAT COUNTS AS GUARDED: a `timeout:` on the click (it still throws, but in
 * seconds rather than half a minute) or a `.catch(`. Both are in the tree
 * already; `ai-action-categories.mjs` carries `click({ timeout: 20_000 })
 * .catch(() => {})` and that is the line this check points at.
 *
 * RULE TWO — A GATE ON AN ELEMENT SOME CHECK IN THE SAME SUITE IS ABOUT.
 *
 *     await page.waitForSelector('[data-testid="create-search"]', { timeout: 20_000 })
 *     …
 *     chk((await …getByTestId('create-search').getAttribute('placeholder')) === …)
 *
 * `cma-16-no-search-box` renames that testid — which is the check it claims —
 * and the gate threw twenty seconds later, before one check had run. 4 of 24
 * reported. A gate whose element nothing asserts is a legitimate page-load wait
 * and is left alone; there are 61 of those and they are not this. The five that
 * stood in front of their own check are the whole finding, which is the same
 * ratio the press rule had: precise because the pairing is the suite's own.
 *
 * RULE THREE — A BOX READ THAT CAN THROW.
 *
 *     const bandBox = await coverIn(made.image).boundingBox()
 *     chk((bandBox?.height ?? 0) >= 40, 'the band at Medium is a band, not a hairline', …)
 *
 * `boundingBox()` THROWS when its locator matches nothing, because it waits for
 * the element first; it returns null only for an element that exists with no
 * box, which is the case the `?? 0` beside it was written for.
 * `list-card-cover-1-list-read-drops-cover` takes the cover out of the list
 * read and that run ended at 12 of 26.
 *
 * Twenty of these, all real, and unlike the sequence rule below this one is a
 * single call — no window, no formatting. THE CAVEAT IS IN THE MESSAGE, because
 * catching a box read is only safe while the check below reddens on absence:
 * every one of the twenty compares with `>=`, `>` or `===` through `?? 0`, so
 * zero fails. A `< N` comparison would PASS on a null box, and then the catch
 * has to come with a `!!box &&` rather than on its own.
 *
 * RULE FOUR — THE SAME LOCATOR, GUARDED AND THEN BARE.
 *
 *     const pressedTitle = ((await textOf(pressed)) ?? '').split('\n')[0].trim()
 *     await pressed.click()
 *
 * I wrote the first line FOR `aar-18-starters-are-a-fixed-list`, whose patch
 * removes that card, and left the second — so the read was spared and the press
 * spent the thirty seconds instead. The run came back SHORT on the same patch,
 * in the same section, hours later.
 *
 * This is the narrow, checkable core of the sequence shape below: the same
 * IDENTIFIER, used through a guard on one line and bare within the next two. It
 * needs no judgement about what "above" means — the variable ties the two lines
 * together — and it found the other two instances in the tree, both real:
 * `task-mentions` bounding a press and leaving the typing, and
 * `video-regression` reading a chip through a catch in the MESSAGE while the
 * CONDITION read it bare.
 *
 * RULE FIVE — ASSERTED IN THIS SECTION, THEN USED BARE IN IT.
 *
 * Rule one pairs a press with a check in the ten lines above it, and ten lines
 * is why it kept missing these: the check and the press are in the same
 * SECTION, thirty lines apart. `aoc-1-filelist-read-late` stages files with no
 * Attachments section — the check says exactly that — and the press on the X
 * inside a row of that section is twenty lines below it. 6 of 14 checks.
 *
 * The section is the suite's own boundary and it is exactly the scope a throw
 * destroys: everything between one `console.log('\n▶ …')` and the next. So
 * within a section, any testid a check asserts the existence of is a testid
 * every later interaction in that section has to survive the absence of.
 *
 * Twenty instances, and one false-positive class worth naming: a read inside a
 * `waitUntil` predicate is already safe, because `waitUntil` catches its
 * predicate's throws — `comment-plus-menu` has three of those and they are
 * correct as written. Excluded.
 *
 * This is where nine of the last ten measured section-enders came from, which
 * is the argument for gating it rather than waiting for the other eighty sets
 * to find them one at a time.
 *
 * RULE SIX — A READ IN THE MESSAGE, WHERE NO SHORT-CIRCUIT CAN REACH IT.
 *
 *     chk(
 *       fastHint.length > 0 && (await page.getByTestId('ai-model-hint-fast').innerText()).trim() === fastHint,
 *       'carrying that model’s OWN one line, the same one the catalogue serves',
 *       `the card read ${JSON.stringify((await page.getByTestId('ai-model-hint-fast').innerText()).trim())} …`,
 *     )
 *
 * `amc-5-bound-moved` drops the server's visible bound from three to two, so the
 * `fast` row goes behind the disclosure and its card never opens. The run
 * reddened the check this patch claims AND two more, then spent thirty seconds
 * on that read and ended at 13 of 24.
 *
 * WHY THIS ONE GATES WHERE THE BROAD READ SCAN DID NOT, and it is the whole
 * argument: rule one's header rejected a scan over `innerText` and
 * `getAttribute` because six of its nine candidates were already guarded by
 * `&&` short-circuiting, "which is the idiom these suites use and which a text
 * rule cannot see." A MESSAGE ARGUMENT HAS NO CONDITION TO SHORT-CIRCUIT. It is
 * evaluated whether the check passes or fails, so the idiom that made the broad
 * scan useless cannot apply, and the objection dissolves rather than being
 * argued around. The line above is the proof: its condition carries a guard,
 * `fastHint.length > 0 &&`, and the guard does not fire — `fast` is still in the
 * served catalogue — but even a guard that DID fire would have left the message
 * reading the same absent element a second time.
 *
 * And a message read is the one case where bounding is unconditionally right.
 * Rule three's caveat — catching a box read is only safe while the assertion
 * under it reddens on absence — has no counterpart here, because A MESSAGE
 * DECIDES NOTHING. It is diagnostic text. A message that throws does not weaken
 * a verdict, it replaces the verdict with an exception and takes the rest of the
 * section with it. There is no suite that wants that.
 *
 * Seventeen sites, one balanced call each — no window, no formatting, the same
 * property that made rule three gateable. The fix reads once into a variable,
 * bounded and caught, and uses the variable in both places, which also retires
 * the double read: twenty-six `chk`s in this tree read the same locator twice.
 *
 * AND A SEVENTH SHAPE THAT IS NOT A GATE, on purpose.
 *
 * The real lesson of `list-view-controls-42-empty-group-no-add` is that its
 * press had been bounded FOR IT, by name, in a comment — and the run still
 * ended at 45 of 50, on the `fill` underneath. Bounding one step of a sequence
 * and leaving the next alone moves the thirty seconds one line down.
 *
 * I wrote that as a rule — "an interaction under something that is allowed to
 * fail" — and it found thirty real sites across twenty suites, every one of
 * which is now bounded. It is still not a gate, because it cannot be stated
 * without reading FORMATTING: whether a call counts as bounded depends on how
 * many lines it is written across, and each fix makes the next line a new site,
 * so it converges by cascade rather than by being right. Two window sizes gave
 * two different answers about the same tree, and at that point the rule was
 * being tuned against its own output rather than against the defect.
 *
 * The two rules above pair an interaction with a CHECK about the same element,
 * which is the suite's own statement rather than a guess about layout. Those
 * gate. The sequence shape is caught where it has always been caught: every
 * instance shortens a run, and `EXPECTED_CHECKS` being exact turns that into a
 * row that gates.
 *
 * Exit 1 with every site named.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { messageReads, topLevelArgs, THROWS, locatorVars } from './lib/suite-reads.mjs'
import { bail } from './lib/bail.mjs'

/*
 * `SUITE_DIR` EXISTS SO THE FIVE LINE-BASED RULES CAN BE TESTED AT ALL.
 *
 * Rule six's reader came out into a module and got a case file because its
 * steady-state answer is zero and zero is the number this audit has learnt not
 * to take on trust. The same is true of every rule above it — all five report 0
 * on a clean tree, and a regression in any of them would be invisible — but
 * they are line-based loops woven into this file, and pulling five of those out
 * into pure functions is a refactor that could turn a real 0 into a false one
 * while looking like tidying.
 *
 * So `check-suite-enders.mjs` points this at a directory of fixture suites
 * instead, one shape per file, and asserts on what this actually prints. That
 * tests the rules AND the file walking AND the reporting, with no refactor at
 * all — and a mutation of any rule's logic reddens the case that covers it.
 * Nothing in the audit reads this variable; only the case file sets it.
 */
const SUITES = process.env.SUITE_DIR ?? new URL('../test/e2e', import.meta.url).pathname
// How far below a check a press is still "the press that check is about". Ten
// lines covers a chk spanning its three arguments plus a comment; beyond that
// the two are about different things and the pairing would be a guess.
const WINDOW = 10

/*
 * TWO WINDOW HELPERS, BOTH WRITTEN BECAUSE THE OLD SPELLING GAVE A WRONG ANSWER
 * IN A DIRECTION I COULD SEE.
 *
 * `stmt` — IS THIS CALL GUARDED? The guard used to be looked for in
 * `lines[i..i+1]`, and the second of those is usually the next STATEMENT rather
 * than the rest of this one. So
 *
 *     await page.getByTestId('quick-create-new-field-name').fill(SCOPED)
 *     await page.getByTestId('quick-create-new-field-scope').selectOption('list', { timeout: 8000 }).catch(…)
 *
 * reported clean: the fill borrowed the guard off the line below it, which
 * guards a different element entirely. A chain that wraps continues on lines
 * beginning with `.` — that is the whole grammar — so the window follows those
 * and stops. A wrapped `.catch()` still counts; a neighbour never does.
 *
 * `insideWaitUntil` — IS THIS READ ALREADY SAFE? `waitUntil` catches its
 * predicate's throws, so a read inside one is fine. "Inside" was a three-line
 * lookback for the WORD, which also spared
 *
 *     chk(await waitUntil(() => …, { timeoutMs: 8_000 }), …)
 *     …
 *     await page.getByTestId('templates-facet-usecase').selectOption('')
 *
 * where the `waitUntil` closed two lines before the press. Containment is a
 * question about parens, so it is asked about parens: find the nearest opener
 * above and see whether it is still open here.
 */
/*
 * `chkText` — HOW FAR DOES THIS `chk(` REACH? It used to be four lines, flat,
 * and four lines is a guess that reaches PAST the call whenever the call is
 * shorter. `check-suite-enders.mjs` caught it with a two-line fixture:
 *
 *     chk(await page.getByTestId('row').count() === 1, 'a row is drawn', 'no row')
 *     console.log('\n▶ another')
 *     await page.getByTestId('something-else').click()
 *
 * The one-line check dragged in the two lines below it, so `something-else`
 * joined the set of testids "this check asserts" — a testid that appears in no
 * check at all — and the press on it was reported against a pairing that does
 * not exist. The same over-reach let a `chk` pull an element out of the NEXT
 * SECTION, which is precisely the boundary rule five exists to respect.
 *
 * A call ends where its parens balance, so that is what is asked. Capped at
 * twelve lines: the longest `chk` in the tree runs to nine, and an unbalanced
 * one (a template literal with a stray bracket) must not walk the whole file.
 */
const chkText = (lines, i) => {
  let depth = 0
  const out = []
  for (let j = i; j < Math.min(i + 12, lines.length); j++) {
    out.push(lines[j])
    for (const ch of lines[j]) depth += ch === '(' ? 1 : ch === ')' ? -1 : 0
    if (depth <= 0) break
  }
  return out.join(' ')
}
// Rule nine reads a whole ASSIGNMENT, which wraps across lines the same way a
// call does, so it shares `stmt`'s grammar: continuations begin with `.`.
const stmt9 = (lines, i) => stmt(lines, i)
const stmt = (lines, i) => {
  let out = lines[i]
  for (let j = i + 1; j < lines.length && /^\s*\./.test(lines[j]); j++) out += ` ${lines[j]}`
  return out
}
const insideWaitUntil = (lines, i) => {
  for (let s = i; s >= Math.max(0, i - 8); s--) {
    const at = lines[s].lastIndexOf('waitUntil(')
    if (at < 0) continue
    let depth = 0
    for (const ch of [lines[s].slice(at), ...lines.slice(s + 1, i + 1)].join('\n'))
      depth += ch === '(' ? 1 : ch === ')' ? -1 : 0
    return depth > 0
  }
  return false
}

const rows = []
for (const file of readdirSync(SUITES).filter((f) => f.endsWith('.mjs')).sort()) {
  const lines = readFileSync(join(SUITES, file), 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*chk\(/.test(lines[i])) continue
    // The condition, which may run over the next few lines before the message.
    const cond = chkText(lines, i)
    // Only checks that ask whether something EXISTS. A check about a value can
    // fail with the element perfectly present, and a press after it is fine.
    if (!/\.count\(\)|isVisible|visible\(|waitUntil/.test(cond)) continue
    const ids = [
      ...cond.matchAll(/getByTestId\(['`]([^'`]+)['`]\)|\bvisible\(['`]([^'`]+)['`]\)|\[data-testid="([^"]+)"\]/g),
    ].map((m) => m[1] ?? m[2] ?? m[3])
    if (!ids.length) continue
    for (let j = i + 1; j < Math.min(i + 1 + WINDOW, lines.length); j++) {
      const line = lines[j]
      if (/catch|timeout/.test(line)) continue
      for (const id of new Set(ids)) {
        const quoted = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        /*
         * `.click(` RATHER THAN `.click()`, and the change is safe because it
         * was measured. This read `\\.click\\(\\)` — a press with NO argument at
         * all — and the guard four lines up already skips any line carrying a
         * `timeout:` or a `.catch(`. So the narrower regex only ever excluded
         * presses with an options object that holds NEITHER: seventeen of those
         * exist in the tree (`click({ force: true })`, `selectOption({ label })`
         * and the like) and every one waits Playwright's full default thirty
         * seconds and throws, exactly as a bare press does.
         *
         * Broadened, the checker still reports 0 sites on this tree — none of
         * the seventeen sits under an existence check naming the same testid —
         * so this closes a blind spot at a cost of nothing rather than
         * introducing a report to argue with. `check-suite-enders.mjs` pins
         * both halves: an options object with no timeout IS a site, and one
         * with a timeout is not.
         */
        if (!new RegExp(`(?:getByTestId\\(['\`]${quoted}['\`]\\)|\\[data-testid="${quoted}"\\])[^\\n]*\\.click\\(`).test(line)) continue
        rows.push({ file, line: j + 1, id, text: line.trim() })
      }
    }
  }
}

// RULE TWO. Every testid any `chk` in the suite is about, against every
// `waitForSelector` on one of them that cannot fail without throwing.
let gates = 0
for (const file of readdirSync(SUITES).filter((f) => f.endsWith('.mjs')).sort()) {
  const lines = readFileSync(join(SUITES, file), 'utf8').split('\n')
  const checked = new Set()
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*chk\(/.test(lines[i])) continue
    for (const m of lines
      .slice(i, i + 5)
      .join(' ')
      .matchAll(/getByTestId\(['`]([^'`]+)['`]\)|\bvisible\(['`]([^'`]+)['`]\)|\[data-testid="([^"]+)"\]/g))
      checked.add(m[1] ?? m[2] ?? m[3])
  }
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/waitForSelector\(\s*['`]\[data-testid="([^"]+)"\]/)
    /*
     * THE CATCH IS LOOKED FOR OVER THREE LINES, as rule three does, because the
     * tree writes these chains wrapped:
     *
     *     const attachThere = await page
     *       .waitForSelector('[data-testid="quick-create-attach"]', { … })
     *       .then(() => true)
     *       .catch(() => false)
     *
     * Testing `lines[i]` alone reported `attach-on-create.mjs:193` — a site
     * whose own header records it as the gate `aoc-4` proved, and which was
     * fixed for exactly that. A rule that reports the fix as the defect is
     * worse than no rule, and it surfaced the moment rule two was taught the
     * `[data-testid="…"]` spelling and started reaching lines it never had.
     */
    if (!m || /catch/.test(lines.slice(i, i + 3).join(' '))) continue
    if (!checked.has(m[1])) continue // a page-load gate on something nothing asserts
    gates += 1
    rows.push({ file, line: i + 1, id: m[1], text: lines[i].trim(), gate: true })
  }
}

// RULE THREE. An unguarded `boundingBox()` — no timeout, no catch.
let boxes = 0
for (const file of readdirSync(SUITES).filter((f) => f.endsWith('.mjs')).sort()) {
  const lines = readFileSync(join(SUITES, file), 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!/\.boundingBox\(\s*\)/.test(lines[i])) continue
    if (/catch/.test(lines.slice(i, i + 3).join(' '))) continue
    boxes += 1
    rows.push({ file, line: i + 1, id: 'boundingBox', text: lines[i].trim(), box: true })
  }
}

// RULE FIVE. Asserted in this section, then used bare in it.
const ANY = /\.(click|fill|type|selectOption|check|uncheck|setInputFiles|innerText|getAttribute|inputValue|isChecked|boundingBox|textContent)\(/
let sections = 0
for (const file of readdirSync(SUITES).filter((f) => f.endsWith('.mjs')).sort()) {
  const lines = readFileSync(join(SUITES, file), 'utf8').split('\n')
  let asserted = new Set()
  for (let i = 0; i < lines.length; i++) {
    if (/console\.log\(['"`]\\n/.test(lines[i])) {
      asserted = new Set()
      continue
    }
    if (/^\s*chk\(/.test(lines[i])) {
      const cond = chkText(lines, i)
      if (/\.count\(\)|isVisible|\bvisible\(|waitUntil|appears\(/.test(cond)) {
        for (const m of cond.matchAll(
          /getByTestId\(['`]([^'`]+)['`]\)|\bvisible\(['`]([^'`]+)['`]\)|\[data-testid="([^"]+)"\]/g,
        ))
          asserted.add(m[1] ?? m[2] ?? m[3])
      }
      continue
    }
    if (!ANY.test(lines[i]) || /catch|timeout/.test(stmt(lines, i))) continue
    // A `waitUntil` predicate catches its own throws.
    if (insideWaitUntil(lines, i)) continue
    for (const id of asserted) {
      if (!id) continue
      const q = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (!new RegExp(`(?:getByTestId\\(['\`]${q}['\`]\\)|\\[data-testid="${q}"\\])`).test(lines[i])) continue
      sections += 1
      rows.push({ file, line: i + 1, id, text: lines[i].trim(), section: true })
      break
    }
  }
}

/*
 * RULE EIGHT. ASSERTED ANYWHERE IN THIS FILE, THEN USED BARE.
 *
 * Rule five's scope is the SECTION, and the section is the scope a throw
 * destroys — which is the right boundary for the damage and the wrong one for
 * the knowledge. A break patch does not remove an element for one section: it
 * removes it from the product. So a testid any check in the file asserts the
 * existence of is a testid every interaction in the file has to survive the
 * absence of, and the section scope was an under-approximation that happened to
 * be safe rather than a statement about the defect.
 *
 * Widening it found fifteen more, in ten suites rule five reported clean, and
 * it is the same pairing rule — the suite's own statement about its own
 * element, no judgement about layout, no window to tune. That is the property
 * that let rules one and five gate and kept the sequence shape out.
 *
 * THREE OF THE FIFTEEN COULD NOT BE FIXED MECHANICALLY, and they are the
 * reason the message below says what it says. Where the check under a press
 * passes on ABSENCE — "Cancel closed the row", "no invite row was offered",
 * "the Save chip went down" — catching the press supplies exactly the absence
 * the check reads as success. The fix manufactures a confident zero unless the
 * precondition is measured first and carried into the condition. Rule three's
 * header says the same thing about a null box and a `< N` comparison; this is
 * that caveat again, one defect class over.
 *
 * Counted separately from rule five so the two scopes stay distinguishable: a
 * regression that collapses the file scope back to the section scope moves this
 * number, and `check-suite-enders.mjs` pins it.
 */
let files = 0
for (const file of readdirSync(SUITES).filter((f) => f.endsWith('.mjs')).sort()) {
  const lines = readFileSync(join(SUITES, file), 'utf8').split('\n')
  const asserted = new Set()
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*chk\(/.test(lines[i])) continue
    const cond = chkText(lines, i)
    if (!/\.count\(\)|isVisible|\bvisible\(|waitUntil|appears\(/.test(cond)) continue
    for (const m of cond.matchAll(
      /getByTestId\(['`]([^'`]+)['`]\)|\bvisible\(['`]([^'`]+)['`]\)|\[data-testid="([^"]+)"\]/g,
    ))
      asserted.add(m[1] ?? m[2] ?? m[3])
  }
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*chk\(/.test(lines[i])) continue
    if (!ANY.test(lines[i]) || /catch|timeout/.test(stmt(lines, i))) continue
    if (insideWaitUntil(lines, i)) continue
    for (const id of asserted) {
      if (!id) continue
      const q = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (!new RegExp(`(?:getByTestId\\(['\`]${q}['\`]\\)|\\[data-testid="${q}"\\])`).test(lines[i])) continue
      // Rule five already holds this one, at the narrower scope. One site, one
      // row: the distinct count below would fold them anyway, but the per-rule
      // numbers are meant to say which scope found it FIRST.
      if (rows.some((r) => r.file === file && r.line === i + 1 && r.section)) break
      files += 1
      rows.push({ file, line: i + 1, id, text: lines[i].trim(), wholeFile: true })
      break
    }
  }
}

/*
 * RULE NINE. A THROWING READ IN A STANDALONE ASSIGNMENT.
 *
 * FOUND BY A BREAK RUN, NOT BY A RULE, which is the whole reason it exists.
 * `af-3-no-failure-recorded` stops a failure being recorded, so no row carries
 * `data-status="failed"`, so this matched nothing:
 *
 *     const badgeTitle = await page
 *       .locator('[data-testid="ai-activity-row-status"][data-status="failed"]')
 *       .first()
 *       .getAttribute('title')
 *
 * Thirty seconds, a throw, `ran 29 checks, expected 34`. Five checks silenced
 * by the patch that was measuring them — and the EIGHT rules above all miss it.
 * Not in a chk message (six), not at the head of a condition (seven), and no
 * check in that file asserts the testid exists, so neither pairing rule has
 * anything to pair it with.
 *
 * WHY THIS GATES WHERE THE BROAD READ SCAN DID NOT, which is rule six's
 * argument one step further. Rule one refused a scan over reads because six of
 * its nine candidates were guarded by `&&` short-circuiting, "the idiom these
 * suites use and which a text rule cannot see". A STANDALONE ASSIGNMENT HAS NO
 * CONDITION AT ALL. There is nothing in front of it to short-circuit, exactly
 * as there is nothing in front of a message, so the objection cannot apply.
 *
 * FOUR EXCLUSIONS, each measured rather than assumed, taking 55 candidates to
 * 21 real ones:
 *
 *   · `locator('body')` — body always exists, so the read cannot wait or
 *     throw. Twenty-odd of the candidates were `body.innerText()`.
 *   · a TERNARY in front of the read — `asked ? await read() : ''` is the
 *     short-circuit rule one declined to gate, and it still declines.
 *     `ai-answer-rendering` guards its read with a `waitUntil` on the count.
 *   · `evaluateAll` — it runs over the matched SET and answers [] when empty.
 *     It does not auto-wait, so it cannot throw on absence.
 *   · inside a `waitUntil` predicate, which catches its own throws. Asked by
 *     CONTAINMENT, as rules five and eight ask it.
 *
 * All 21 are fixed, and the null semantics were read one at a time rather than
 * bounded en masse: four chained `.trim()` or `.replace()` onto the result
 * (a caught null throws — `?? ''` goes in front), one compared through
 * `Number()`, where `Number(null)` is ZERO and the check would have passed on
 * a missing tile whenever the server said 0, and three assert a NEGATIVE that
 * a caught null satisfies vacuously, so each now requires its element to BE
 * there.
 */
let assigns = 0
for (const file of readdirSync(SUITES).filter((f) => f.endsWith('.mjs')).sort()) {
  const lines = readFileSync(join(SUITES, file), 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*(const|let)\s+[A-Za-z_$][\w$]*\s*=\s*/.test(lines[i])) continue
    const stmt = stmt9(lines, i)
    if (!THROWS.test(stmt)) continue
    if (/\.catch\(|timeout:/.test(stmt)) continue
    if (/locator\(\s*['"`]body['"`]\s*\)/.test(stmt)) continue
    if (/\?\s*[('"`\w]*\s*(await\s+)?[\w.]*page/.test(stmt)) continue
    if (/\.evaluateAll\(/.test(stmt)) continue
    if (!/getByTestId\(|data-testid/.test(stmt)) continue
    if (insideWaitUntil(lines, i)) continue
    assigns += 1
    rows.push({ file, line: i + 1, id: stmt.match(THROWS)[1], text: stmt.trim().replace(/\s+/g, ' '), assign: true })
  }
}

// RULE FOUR. The same locator variable: through a guard, then bare.
const ANYVERB = /\.(click|fill|type|selectOption|check|uncheck|setInputFiles|innerText|getAttribute|inputValue|boundingBox)\(/
let sames = 0
for (const file of readdirSync(SUITES).filter((f) => f.endsWith('.mjs')).sort()) {
  const lines = readFileSync(join(SUITES, file), 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const guarded = [
      ...lines[i].matchAll(/\b(?:textOf|attrOf|boxOf)\(\s*([a-z][A-Za-z0-9_]*)\b/g),
      ...(/catch|timeout/.test(lines[i])
        ? lines[i].matchAll(/\b([a-z][A-Za-z0-9_]*)\s*\.(?:click|fill|innerText|getAttribute|boundingBox)\(/g)
        : []),
    ].map((m) => m[1])
    if (!guarded.length) continue
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      if (/catch|timeout/.test(lines[j])) continue
      for (const v of new Set(guarded)) {
        if (!new RegExp(`\\b${v}\\s*\\.`).test(lines[j]) || !ANYVERB.test(lines[j])) continue
        sames += 1
        rows.push({ file, line: j + 1, id: v, text: lines[j].trim(), same: true })
      }
    }
  }
}

/*
 * RULE SEVEN. A THROWING READ AT THE HEAD OF A CONDITION.
 *
 * Rule one's header rejected a broad scan over reads in conditions, and the
 * reason was exact: six of its nine candidates were guarded by `&&`
 * short-circuiting, "which is the idiom these suites use and which a text rule
 * cannot see". That objection is about reads with something IN FRONT of them.
 *
 * A read that is the FIRST operand of a condition has nothing in front of it.
 * No `&&` can spare it, for the same reason none can spare a message — and
 * unlike a message, this one also decides the verdict, so it cannot simply be
 * caught: the value it produces has to fail the check. Fourteen of these, and
 * two were surfaced by agents fixing rule six's sites next door, which is how
 * the shape came up at all.
 *
 * NOT the same as rule six. That one is about text nobody reads unless the
 * check fails; this is about the check itself. They are gated together because
 * the failure is identical — thirty seconds and a dead section — but the fix
 * differs: a message takes `.catch(() => null)` and prints it, a condition
 * takes `.catch(() => null)` and must then REJECT null rather than compare it.
 */
const leadReads = []
for (const file of readdirSync(SUITES).filter((f) => f.endsWith('.mjs')).sort()) {
  const src = readFileSync(join(SUITES, file), 'utf8')
  const vars = [...locatorVars(src)]
  for (let i = src.indexOf('chk('); i !== -1; i = src.indexOf('chk(', i + 1)) {
    let d = 0
    let end = i + 3
    for (; end < src.length; end++) {
      if (src[end] === '(') d += 1
      else if (src[end] === ')') {
        d -= 1
        if (d === 0) break
      }
    }
    if (d !== 0) continue
    const cond = topLevelArgs(src.slice(i + 4, end))[0] ?? ''
    if (!THROWS.test(cond)) continue
    if (/\.catch\(|timeout:/.test(cond)) continue
    // A `waitUntil` predicate catches its own throws.
    if (/waitUntil\(/.test(cond)) continue
    const m = cond.match(THROWS)
    const before = cond.slice(0, m.index)
    // Anything that could short-circuit means this is the shape rule one's
    // header declined to gate, and it stays declined.
    if (/&&|\|\||\?/.test(before)) continue
    const onLocator =
      /getByTestId\(|data-testid/.test(cond.slice(0, m.index + 40)) ||
      vars.some((v) => new RegExp(`\\b${v}\\s*\\.[\\w().'"\\[\\]-]*$`).test(before.trimEnd()))
    if (!onLocator) continue
    leadReads.push({
      file,
      line: src.slice(0, i).split('\n').length,
      id: m[1],
      text: cond.trim().replace(/\s+/g, ' ').slice(0, 100),
      lead: true,
    })
  }
}
for (const r of leadReads) rows.push(r)

// RULE SIX. A throwing read on a testid locator inside a `chk` MESSAGE. The
// reader lives in `lib/suite-reads.mjs` so `check-suite-reads.mjs` can break
// its two fragile parts — the comma splitter and the argument index — and
// require the answer to change.
let messages = 0
for (const file of readdirSync(SUITES).filter((f) => f.endsWith('.mjs')).sort()) {
  for (const hit of messageReads(readFileSync(join(SUITES, file), 'utf8'))) {
    messages += 1
    rows.push({ file, line: hit.line, id: hit.verb, text: hit.text, message: true })
  }
}

for (const r of rows) {
  console.log(
    `  ${r.file}:${r.line}  ${r.id}${r.gate ? '  (gate)' : ''}${r.box ? '  (box)' : ''}` +
      `${r.same ? '  (same locator, guarded above)' : ''}${r.section ? '  (asserted in this section)' : ''}` +
      `${r.wholeFile ? '  (asserted elsewhere in this file — a patch removes it everywhere)' : ''}` +
      `${r.message ? '  (read in a chk message — nothing short-circuits it)' : ''}` +
      `${r.lead ? '  (read at the HEAD of a condition — nothing short-circuits it either)' : ''}` +
      `${r.assign ? '  (a standalone assignment — there is no condition to short-circuit)' : ''}`,
  )
  console.log(`      ${r.text.slice(0, 120)}`)
}
/*
 * THE DISTINCT COUNT, BECAUSE THE PER-RULE COUNTS OVERLAP AND USED NOT TO SAY SO.
 *
 * `check-suite-enders.mjs` found this with its first case: rule one and rule
 * five both fire on
 *
 *     chk(await visible('thing'), 'there is a control to press', …)
 *     await page.getByTestId('thing').click()
 *
 * and they are right to. Rule five is rule one without the ten-line window, so
 * every press rule one catches is also something the section asserts. Two rows,
 * one physical site — and the summary reported "1 press … 1 use of something
 * this section asserts", which reads as two places to go and fix.
 *
 * Both labels are worth keeping: they say which argument makes the site a site,
 * and a reader fixing it wants that. So the labels stay and the SITE count goes
 * in front of them. "Nineteen presses and twenty sections" was never 39 places.
 */
const distinct = new Set(rows.map((r) => `${r.file}:${r.line}`)).size
console.log(
  `[section-enders] ${distinct} site(s) across ${new Set(rows.map((r) => r.file)).size} suite(s), ` +
    `flagged as: ${rows.length - gates - boxes - sames - sections - files - messages - leadReads.length - assigns} ` +
    `press(es) on a control the check above them may find absent, ${gates} gate(s) in front of a ` +
    `check about the same element, ${boxes} box read(s) that throw when nothing matches, ${sames} ` +
    `use(s) of a locator guarded one line up, ${sections} use(s) of something this section asserts ` +
    `exists, ${files} use(s) of something asserted elsewhere in the same file, and ` +
    `${messages} read(s) in a chk message, ${leadReads.length} at the head of a condition, and ` +
    `${assigns} in a standalone assignment ` +
    '— a site can be more than one of these',
)
if (rows.length) {
  console.error(
    '\n[section-enders] Bound and catch each one — `.click({ timeout: 10_000 }).catch(() => {})` for a\n' +
      'press, `.catch(() => {})` for a gate or a box read — so the checks below report what happened\n' +
      'instead of being replaced by a thirty-second exception. For a box read, check that the\n' +
      'assertion under it REDDENS on a null box: `>= N` does, `< N` does not, and that one needs a\n' +
      '`!!box &&` beside the catch.',
  )
  bail(1)
}
