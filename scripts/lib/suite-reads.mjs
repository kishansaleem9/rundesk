/*
 * RULE SIX'S READER, PULLED OUT SO IT CAN BE BROKEN ON PURPOSE.
 *
 * `check-suite-section-enders.mjs` states the rule and the argument for gating
 * it. This holds the two pieces of it that can be wrong without looking wrong:
 *
 *   · `topLevelArgs` splits a call on its own commas, which means skipping
 *     commas inside nested calls AND inside strings. Both appear constantly in
 *     these suites — `JSON.stringify(x, null, 2)` in a message, `'a, b'` in a
 *     condition — and either kind of blindness shifts an argument's INDEX.
 *
 *   · the index is the whole rule. Argument 0 is the condition and 1 is the
 *     label; everything from 2 on is the message, and the message is the only
 *     place where no `&&` can short-circuit a read. Get the index wrong and the
 *     rule either reports every guarded condition in the tree or reports
 *     nothing at all — and "nothing at all" is the failure that looks like
 *     success.
 *
 * `scripts/check-suite-reads.mjs` breaks each of those and requires the answer
 * to change. Rules one to five are line-based; `scripts/check-suite-enders.mjs`
 * holds their cases and breaks each rule on purpose.
 */
import { checkCalls } from './check-call.mjs'

// The verbs that THROW when the locator matches nothing, because they wait for
// the element before answering. `count` is deliberately absent: it answers 0.
export const THROWS =
  /\.(innerText|textContent|inputValue|isDisabled|isEnabled|isChecked|isEditable|getAttribute|boundingBox)\(/

/*
 * Split a call's inside on its TOP-LEVEL commas.
 *
 * Depth counts every bracket, not only parentheses: a message routinely holds
 * an array or an object literal, and `[a, b]` at depth 0 would otherwise be two
 * arguments. Strings are skipped whole, with `\\` honoured, so an escaped quote
 * inside a template literal does not end it early.
 */
export const topLevelArgs = (inner) => {
  const out = []
  let depth = 0
  let quote = null
  let start = 0
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]
    if (quote) {
      if (c === quote && inner[i - 1] !== '\\') quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    else if ('([{'.includes(c)) depth += 1
    else if (')]}'.includes(c)) depth -= 1
    else if (c === ',' && depth === 0) {
      out.push(inner.slice(start, i))
      start = i + 1
    }
  }
  out.push(inner.slice(start))
  return out
}

/*
 * A LOCATOR HELD IN A VARIABLE IS STILL A LOCATOR.
 *
 * `const section = page.getByTestId('sidebar-dms-section')` and then
 * `section.getAttribute('data-count')` is the same read as writing the factory
 * call inline, and it throws the same way. Rule six matched the LITERAL, so it
 * could not see it: `sidebar-dms-1-no-section` removes that section, the read
 * threw, and the run ended at 10 of 14 with four checks unreported. Rule four
 * pairs a guarded identifier with a bare one and here NEITHER use was guarded,
 * so it had nothing to pair. Two rules, one blind spot each, and the site sat
 * between them.
 *
 * I recorded that as needing a parser. IT DOES NOT. A variable assigned from a
 * locator factory IN THE SAME FILE is a text match, and the scope is the only
 * thing that has to be right: a name assigned from `page.getByTestId(…)` or
 * `page.locator(…)` anywhere in the file is a locator everywhere in it, because
 * these suites are single-scope scripts rather than modules with shadowing.
 *
 * Deliberately NOT tracking re-assignment or shadowing. Both would need scope
 * analysis, and a name reused for a non-locator would produce a false positive
 * — which is the one outcome worse than a missed site, since it makes the rule
 * something to argue with. Measured: 19 message sites across 12 files, and 5
 * more that read a variable only in the CONDITION, where an `&&` can guard them
 * and this rule correctly says nothing.
 */
const LOCATOR_VAR =
  /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?[\w.]*\bpage\d*\s*\.\s*(?:getByTestId|locator|getByRole|getByText|getByLabel|getByPlaceholder)\(/g

export const locatorVars = (src) => new Set([...src.matchAll(LOCATOR_VAR)].map((m) => m[1]))

/*
 * AND THE ONES THAT NAME A SINGLE TESTID, RESOLVED — so the line rules, which
 * match a testid written on the line, see a press through a variable too.
 *
 * `const opener = page.getByTestId('thread-open')`, a check on
 * `opener.isVisible()`, then a bare `await opener.click()`: rules one, five and
 * eight matched `getByTestId('…')` on the press line and never saw it — twelve
 * real sites sat in that gap. Only a variable assigned straight from ONE testid
 * is resolved (optionally `.first()`, `.last()` or `.nth(n)`, and nothing
 * chained after): anything wider is not "that element", and guessing would put
 * a false site in a rule people have to trust.
 */
const TESTID_VAR =
  /^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?[\w.]*\bpage\d*\s*\.\s*(?:getByTestId\(\s*['"`]([^'"`]+)['"`]\s*\)|locator\(\s*['"`]\[data-testid="([^"]+)"\]['"`]\s*\))(?:\s*\.\s*(?:first|last)\(\)|\s*\.\s*nth\(\d+\))?\s*$/gm

export const locatorTestIds = (src) => new Map([...src.matchAll(TESTID_VAR)].map((m) => [m[1], m[2] ?? m[3]]))

/** `src`'s lines with every single-testid locator variable written out in place. */
export const withLocatorsResolved = (src) => {
  const ids = locatorTestIds(src)
  const lines = src.split('\n')
  if (!ids.size) return lines
  // No declaration can be rewritten: TESTID_VAR ends at the locator, so a
  // resolvable declaration's own line never holds `<name>.`.
  return lines.map((line) => {
    // A comment that mentions `note.getAttribute(…)` is prose, not a read.
    if (/^\s*(?:\*|\/\/)/.test(line)) return line
    let out = line
    for (const [v, id] of ids) {
      out = out.replace(new RegExp(`(?<![\\w$.])${v.replace(/\$/g, '\\$')}\\s*\\.`, 'g'), `page.getByTestId('${id}').`)
    }
    return out
  })
}

/*
 * Every `chk` in `src` whose MESSAGE reads a locator with a verb that throws,
 * and whose message has no `.catch` of its own — whether the locator is written
 * inline as a testid or held in a variable assigned from a locator factory.
 *
 * Returns `{ line, verb, text }` per site, one per `chk` — a message that reads
 * two absent elements still only ends the section once, and naming the first is
 * enough to find it.
 */
export const messageReads = (src) => {
  const out = []
  const vars = locatorVars(src)
  const readsAVar = (arg) =>
    [...vars].some((v) =>
      new RegExp(
        `\\b${v.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*\\.(?:[\\w]+\\([^()]*\\)\\s*\\.)*?` +
          '(?:innerText|textContent|inputValue|isDisabled|isEnabled|isChecked|isEditable|getAttribute|boundingBox)\\(',
      ).test(arg),
    )
  for (const { start: i, paren } of checkCalls(src)) {
    let depth = 0
    let end = paren
    for (; end < src.length; end++) {
      if (src[end] === '(') depth += 1
      else if (src[end] === ')') {
        depth -= 1
        if (depth === 0) break
      }
    }
    // An unbalanced tail — a truncated file, or `chk(` inside a string. There
    // is nothing to say about it, and guessing where it ends would invent an
    // argument list.
    if (depth !== 0) continue
    /*
     * BOTH MESSAGE ARGUMENTS, NOT ONLY THE FAILURE ONE.
     *
     * This read `.slice(2)` — the `bad` argument and anything after it — on the
     * reasoning that the failure message is where the diagnostic reads live.
     * That is where they live, and it is not where the DANGER lives:
     * `chk(cond, good, bad)` is an ordinary call, so all three arguments are
     * evaluated before `chk` runs. A throwing read in `good` throws exactly as
     * surely as one in `bad`, and the whole argument for gating rule six is
     * that a message has no condition to short-circuit it.
     *
     * Measured before widening: the tree holds ZERO unguarded throwing reads in
     * a second argument today, so this closes a blind spot at a cost of nothing
     * rather than introducing a report to argue with — the same trade rule one
     * made when it broadened from `.click()` to `.click(`.
     */
    for (const arg of topLevelArgs(src.slice(paren + 1, end)).slice(1)) {
      if (!THROWS.test(arg)) continue
      // Written inline as a testid, OR held in a variable assigned from a
      // locator factory in this file. Same read, same throw.
      if (!/getByTestId\(|data-testid/.test(arg) && !readsAVar(arg)) continue
      if (/\.catch\(/.test(arg)) continue
      out.push({
        line: src.slice(0, i).split('\n').length,
        verb: arg.match(THROWS)[1],
        text: arg.trim().replace(/\s+/g, ' '),
      })
      break
    }
  }
  return out
}

/*
 * THE LINES THAT CONTINUE A CHECK'S ARGUMENTS — the second and later lines of
 * a multi-line `chk(…)`. A read there is part of the check's condition or its
 * message, which rules six and seven own; the statement rules (one, five,
 * eight) read `&& (await header.getAttribute(…))` on its own line as a bare
 * use of something asserted, when a `count()` two lines up short-circuits it.
 */
export const checkSpanLines = (lines) => {
  const src = lines.join('\n')
  const inside = new Set()
  for (const { start, paren } of checkCalls(src)) {
    let depth = 0
    let end = paren
    for (; end < src.length; end++) {
      if (src[end] === '(') depth += 1
      else if (src[end] === ')') {
        depth -= 1
        if (depth === 0) break
      }
    }
    if (depth !== 0) continue
    const first = src.slice(0, start).split('\n').length - 1
    const last = src.slice(0, end).split('\n').length - 1
    for (let l = first + 1; l <= last; l++) inside.add(l)
  }
  return inside
}
