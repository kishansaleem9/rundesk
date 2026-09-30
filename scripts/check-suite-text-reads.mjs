#!/usr/bin/env node
/*
 * A CHECK THAT SAYS TEXT IS SHOWN READS WHAT IS DRAWN: NEVER `textContent`,
 * AND `innerText` ONLY OF AN ELEMENT KNOWN TO BE DRAWN
 * (the ledger's `found-23-sep/checks-read-textContent-not-what-is-shown`
 * and, one step on, `found-29-sep/innertext-reads-hidden-leaves`).
 *
 * `textContent` is every character in an element, drawn or not: text inside
 * `hidden`, `display: none` or a closed `<details>` reads exactly as if it
 * were on the screen. `hr-9` wraps Home's reminders empty state in
 * `<div hidden>` — a blank panel to anybody looking — and `home-reminders`
 * stayed green, because its check read "No reminders waiting" out of the
 * hidden div.
 *
 * MEASURED FIRST, 29 September, comments stripped: 69 `textContent` /
 * `allTextContents` reads in 28 suites. (The ledger's `grep -l
 * 'textContent('` saw 17 files: most of these are property reads in page code
 * and `allTextContents()` calls.) 55 fed a check that text IS SHOWN — in the
 * condition itself, or through a helper, a variable or the `waitUntil` in
 * front of it. One more, `task-menu`'s printed id, is read out of a copy that
 * is hidden on screen by design. 13 asserted no showing at all: 7 in a
 * check's message, 1 in a variable only a message uses, 4 reading a row's
 * text to FIND the row, 1 asserting ABSENCE — where reading hidden text too is
 * the stricter read, not the weaker one.
 *
 * AND `innerText` ALONE IS NOT THE FIX, which had to be measured rather than
 * assumed. In the lanes' Chromium:
 *
 *     <section id=panel>Reminders<div hidden><p id=msg>No reminders</p></div></section>
 *
 *     panel.textContent  "RemindersNo reminders"   panel.innerText  "Reminders"
 *     msg.textContent    "No reminders"            msg.innerText    "No reminders"
 *
 * `innerText` leaves out hidden text INSIDE an element that is drawn — the
 * hr-9 shape, because `home-reminders` reads the panel — but an element that
 * is not drawn has no rendering to consult, and the spec answers with its
 * whole text. Most of the 55 read the element itself (a count, a label, a
 * chip), and `allInnerTexts()` over a list returns a hidden row's text too.
 * What closes it is a visibility check ON THE ELEMENT READ —
 * `.filter({ visible: true })` on its locator, `checkVisibility()` in page
 * code — and then `innerText` for anything hidden inside it.
 *
 * SO `innerText` READS ARE HELD TO THE SAME RULE
 * (`found-29-sep/innertext-reads-hidden-leaves`). Measured 29 September at
 * `15e2681`, comments stripped: 266 `innerText` / `allInnerTexts` /
 * `.innerText` reads in 90 suites (the ledger had 252 in 86, on an older tree), and 130
 * more through `readText(locator)` — `lib/wait.mjs`'s `locator.innerText()`,
 * bounded and caught, which no grep for `innerText` sees: 396 in 115 suites.
 * 121 already had an out (86 guarded on the read, 31 in a message, 3 in a
 * message-only variable, 1 marked). 42 read what is drawn by the two outs
 * below: 32 the page's own body, 10 after the same element's visibility was
 * asked. 197 decided a check that text is SHOWN with nothing on the read — a
 * count, a chip, a toast, a label, a row, a panel; 6 of them `<option>`s, whose
 * guard goes on the `<select>` because Playwright counts no option as visible.
 * 10 asserted an ABSENCE, 1 was page code already guarded by its own box, and
 * 25 sat in five suites other work was changing (LEFT_FOR_LATER, below).
 *
 * Three facts from the lanes' Chromium decide the extra outs: a hidden leaf
 * (`hidden`, `display: none`) answers innerText in full, `visibility: hidden`
 * and a closed `<details>` answer empty, and the body — drawn by definition —
 * answers with only what is drawn. So an innerText read (only innerText:
 * `textContent` of a drawn element still reads what is hidden inside it) also
 * passes where
 *
 *   · the element read is the page's own BODY (`locator('body')`,
 *     `document.body`), or
 *   · the same element's visibility is ASKED FIRST and gates the read:
 *     `drawn ? (await el.innerText()) : ''` with `drawn` declared from
 *     `el.isVisible()` or a `waitFor` that waits for it shown, or
 *     `(await el.isVisible()) && …` ahead of the read in one statement. Same
 *     element, before the read, as a ternary's test or the left of an `&&`.
 *
 * THE RULE. Every read of an element's text in a suite — `textContent`,
 * `allTextContents`, `innerText`, `allInnerTexts`, or `readText(locator)` — is
 * one of:
 *
 *   · in a check's MESSAGE — the second argument onward of `chk(`, `check(`
 *     or a chain's `.step(` — or in a variable that only messages use. A
 *     message decides nothing;
 *   · VISIBILITY-GUARDED on the read itself: `.filter({ visible: true })`,
 *     `:visible` or `visible=true` on the locator it reads (followed to the
 *     locator's declaration when it is held in a variable; for `readText`, the
 *     locator handed to it), or `checkVisibility()` in the page code that reads
 *     it — on the element read, not only on an ancestor it is found in, since a
 *     hidden leaf inside a drawn panel is read in full (`<option>`s excepted:
 *     their select is the only guard they can have) — and, for innerText
 *     alone, the body or the same element asked first;
 *   · EXEMPT, by `// text-read: <reason>` at the end of its own line, the
 *     reason one of `absence`, `key`, `detail`, `not-rendered`.
 *
 * WHY EVERY READ, NOT ONLY "A READ IN A CONDITION": most of the 55 were not
 * in the condition. They were in a helper (`labels()`, `stat(id)`,
 * `rowNames(page)`), a variable read lines earlier, or the `waitUntil` that
 * decides when the condition is read — and following a value from a helper
 * through a call into a condition is a parser's job, not a regex's. So the
 * question is asked the other way round: a read passes where it provably
 * decides nothing, where it provably reads what is drawn, or where somebody
 * wrote down why. Seventeen markers on this tree: `absence` twelve times and
 * `key` five. There were six before the innerText half, one of them
 * `not-rendered` on `task-menu`'s print copy, which is now read under print media.
 *
 * A MARKER GOES ON THE READ'S OWN LINE, AND NEVER INSIDE A CHECK'S ARGUMENTS.
 * The other gates split a check's arguments on text (`topLevelArgs`, in
 * `lib/suite-reads.mjs`), and that splitter does not know a comment: a marker
 * written inside a condition while this file was being written had an
 * apostrophe in it, which opened a "string" there and moved every argument
 * after it. A read that needs a marker inside a check is hoisted into a
 * variable first. A marker with an unknown reason, or one that exempts
 * nothing on its line, is a failure as well — exemptions are meant to stay few.
 *
 * READ AS JAVASCRIPT, NOT AS LINES: comments, strings, regex literals and
 * template text are blanked before anything is matched, so `textContent` in a
 * sentence or a comment is not a read and a `)` in a string does not close a
 * call. A suite that does not lex to a clean end is reported, not guessed at.
 *
 * A GATE THAT READ NOTHING ANSWERS ok AS SURELY AS ONE THAT READ EVERYTHING:
 * fewer than 100 suites read is a failure (1 under `SUITE_DIR`).
 *
 * `--mutate` plants suites in a temp directory — the hr-9 read among them —
 * requires every violating shape to be caught and every fixed form to pass,
 * then breaks this file one rule at a time and requires a planted case to
 * notice (`lib/mutate.mjs`). A planted run reads LEFT_FOR_LATER from
 * `TEXT_READS_LEFT` instead, so its cases do not depend on today's list.
 *
 *   node scripts/check-suite-text-reads.mjs [--mutate]
 */
import { readdirSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { proveMutationsBite } from './lib/mutate.mjs'

const SELF = fileURLToPath(import.meta.url)
const SUITES = process.env.SUITE_DIR ?? join(dirname(SELF), '..', 'test', 'e2e')
const MIN_SUITES = process.env.SUITE_DIR ? 1 : 100
const REASONS = ['absence', 'key', 'detail', 'not-rendered']
const GUARD = /\.filter\(\s*\{\s*visible\s*:\s*true\s*\}\s*\)|:visible\b|\bvisible=true\b|\bcheckVisibility\s*\(/
/*
 * THE GUARD HAS TO BE ON THE ELEMENT READ. A filter on an ANCESTOR —
 * `panel.filter({ visible: true }).getByTestId('count')` — leaves a hidden
 * count inside a drawn panel read in full, which is this ledger's leaf
 * (`found-29-sep/innertext-reads-hidden-leaves`). So after the last guard the
 * chain may narrow (`first()`, `nth()`, `filter({ hasText })`) but not step to
 * a descendant. One exception, `<option>`s: Playwright counts no option as
 * visible, so the select they are read from is the only guard they can have.
 */
const STEP = /\.\s*(?:locator|getBy[A-Za-z]+|querySelector(?:All)?)\s*\(/
const OPTION = /\.\s*locator\(\s*(['"`])option\1\s*\)/g
const onElement = (text) => {
  const guards = [...text.matchAll(new RegExp(GUARD.source, 'g'))]
  const last = guards[guards.length - 1]
  return !!last && !STEP.test(text.slice(last.index + last[0].length).replace(OPTION, ''))
}
const READ = /\.(textContent|allTextContents|innerText|allInnerTexts)\b/g
// `readText(locator)` in `test/e2e/lib/wait.mjs` is `locator.innerText()`, bounded and caught.
const READ_TEXT = /(?<![\w$.])readText\s*\(/g
const INNER = new Set(['innerText', 'allInnerTexts', 'readText'])
// The page's own body, the one element drawn by definition (normalised: no spaces around punctuation).
const PAGE = /^(?:[A-Za-z_$][\w$]*\.locator\((['"`])(?:body|html)\1\)(?:\.first\(\))?|document\.(?:body|documentElement)\??)$/
/*
 * LEFT FOR LATER: suites other work was changing when the innerText half was
 * closed, each held at its count of innerText reads with no out — more is a
 * new read needing one, and fewer asks for the number to come down, so a
 * conversion cannot be undone quietly (`found-29-sep/innertext-reads-hidden-leaves`).
 * Five suites were held here on 29 September. ui-sweep's ten were converted
 * with its fixed waits (`found-29-sep/ui-sweep-reads-after-fixed-waits`), and
 * the other four's with the priorities work that had been changing them
 * (`found-29-sep/innertext-reads-left-for-later`). None is held now.
 */
const LEFT_FOR_LATER = {}
const LEFT = process.env.SUITE_DIR ? JSON.parse(process.env.TEXT_READS_LEFT ?? '{}') : LEFT_FOR_LATER
const EVALUATES = /^(?:evaluate|evaluateAll|evaluateHandle|\$eval|\$\$eval|waitForFunction)$/
const CHECKS = /(?<![.\w$])(?:chk|check)\s*\(|\.step\s*\(/g
const MARKER = /\/\/\s*text-read:\s*([\w-]*)/g
const KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'await', 'yield'])

/*
 * Two views of `src`, each exactly as long, so an index means the same place
 * in both: `code`, with comments, string and regex contents and template text
 * blanked (a bracket or a comma there is text, not syntax), and `bare`, with
 * only the comments blanked (a `:visible` in a selector string is a guard).
 * `clean` says whether the walk ended outside every string and comment.
 */
export function lex(src) {
  const code = src.split('')
  const bare = src.split('')
  // Newlines survive in comments and strings, so a line is still a line; in
  // template text they go too, so a wrapped sentence does not end a statement.
  const blank = (arr, i, keepNewline = true) => {
    if (i < arr.length && !(keepNewline && arr[i] === '\n')) arr[i] = ' '
  }
  const frames = [] // brace depth inside each open `${`
  let mode = 'code'
  let quote = ''
  let inClass = false
  let prev = ''
  let word = ''
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    const n = src[i + 1]
    if (mode === 'code') {
      if (c === '/' && (n === '/' || n === '*')) {
        mode = n === '/' ? 'line' : 'block'
        blank(code, i), blank(bare, i), blank(code, i + 1), blank(bare, i + 1)
        i += 1
        continue
      }
      if (/\s/.test(c)) continue
      if (c === "'" || c === '"') {
        mode = 'string'
        quote = c
        continue
      }
      if (c === '`') {
        mode = 'template'
        continue
      }
      // A `/` after a value divides; anywhere else it opens a regex literal.
      if (c === '/' && (prev === '' || (/[\w$]/.test(prev) ? KEYWORDS.has(word) : !/[)\]'"`]/.test(prev)))) {
        mode = 'regex'
        inClass = false
        continue
      }
      if (c === '{' && frames.length) frames[frames.length - 1] += 1
      if (c === '}' && frames.length) {
        if (frames[frames.length - 1] === 0) {
          frames.pop()
          mode = 'template'
          continue
        }
        frames[frames.length - 1] -= 1
      }
      word = /[\w$]/.test(c) ? (/[\w$]/.test(src[i - 1] ?? '') ? word + c : c) : ''
      prev = c
    } else if (mode === 'line') {
      if (c === '\n') mode = 'code'
      else blank(code, i), blank(bare, i)
    } else if (mode === 'block') {
      blank(code, i), blank(bare, i)
      if (c === '*' && n === '/') {
        blank(code, i + 1), blank(bare, i + 1)
        i += 1
        mode = 'code'
      }
    } else if (mode === 'string') {
      if (c === '\\') {
        blank(code, i), blank(code, i + 1)
        i += 1
      } else if (c === quote || c === '\n') {
        mode = 'code'
        if (c === quote) prev = c
        word = ''
      } else blank(code, i)
    } else if (mode === 'template') {
      if (c === '\\') {
        blank(code, i, false), blank(code, i + 1, false)
        i += 1
      } else if (c === '`') {
        mode = 'code'
        prev = c
        word = ''
      } else if (c === '$' && n === '{') {
        frames.push(0)
        mode = 'code'
        prev = '{'
        word = ''
        i += 1
      } else blank(code, i, false)
    } else if (mode === 'regex') {
      if (c === '\\') {
        blank(code, i), blank(code, i + 1)
        i += 1
      } else if (c === '\n') mode = 'code'
      else if (inClass) {
        if (c === ']') inClass = false
        blank(code, i)
      } else if (c === '[') {
        inClass = true
        blank(code, i)
      } else if (c === '/') {
        mode = 'code'
        prev = ')' // a regex literal is a value: a `/` after it divides
        word = ''
      } else blank(code, i)
    }
  }
  return { code: code.join(''), bare: bare.join(''), clean: mode === 'code' && frames.length === 0 }
}

const CLOSE = { '(': ')', '[': ']', '{': '}' }
const OPEN = { ')': '(', ']': '[', '}': '{' }
const matchForward = (code, o) => {
  let d = 0
  for (let k = o; k < code.length; k++) {
    if (code[k] === code[o]) d += 1
    else if (code[k] === CLOSE[code[o]] && --d === 0) return k
  }
  return -1
}
const matchBack = (code, j) => {
  let d = 0
  for (let k = j; k >= 0; k--) {
    if (code[k] === code[j]) d += 1
    else if (code[k] === OPEN[code[j]] && --d === 0) return k
  }
  return -1
}
const argSpans = (code, open, close) => {
  const spans = []
  let d = 0
  let start = open + 1
  for (let k = open + 1; k < close; k++) {
    if ('([{'.includes(code[k])) d += 1
    else if (')]}'.includes(code[k])) d -= 1
    else if (code[k] === ',' && d === 0) {
      spans.push([start, k])
      start = k + 1
    }
  }
  spans.push([start, close])
  return spans
}

/** An expression with the spaces around its punctuation dropped, so a chain wrapped over lines reads as one. */
const norm = (s) => s.trim().replace(/\s+/g, ' ').replace(/\s*([.()[\]{},?:])\s*/g, '$1')
/** That text as a pattern matching it however it is spaced. */
const flex = (s) =>
  s
    .split(/([.()[\]{},?:])/)
    .map((p, i) => (i % 2 ? `\\s*\\${p}\\s*` : p.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&').replace(/ /g, '\\s+')))
    .join('')

/*
 * Where a statement that starts at `from` ends: `;`, a closing bracket it did
 * not open, or a newline nothing carries on over — a line ending in an
 * operator, or a next line starting with `.`, `?`, `:`, `&&`, `||` or `,`,
 * which is how every wrapped chain and ternary in these suites is written.
 */
const statementEnd = (code, from) => {
  let d = 0
  let last = ''
  for (let k = from; k < code.length; k++) {
    const c = code[k]
    if (c === '\n' && d === 0) {
      let j = k + 1
      while (j < code.length && /\s/.test(code[j])) j++
      if (!/[=(\[{,?:&|+\-*/.<>!]/.test(last) && !/[.?:&|+*,=]/.test(code[j] ?? '')) return k
      continue
    }
    if (/\s/.test(c)) continue
    if ('([{'.includes(c)) d += 1
    else if (')]}'.includes(c)) {
      if (d === 0) return k
      d -= 1
    } else if (c === ';' && d === 0) return k
    last = c
  }
  return code.length
}

/*
 * Where the member chain that the `.` at `dot` continues begins — for the `.`
 * of `.textContent(`, the start of `page.getByTestId('x').filter({ visible:
 * true })` before it — across lines, calls, indexes and optional chaining.
 */
const chainStart = (code, dot) => {
  let i = dot
  for (;;) {
    let j = i - 1
    if (code[j] === '?') j -= 1
    while (j >= 0 && /\s/.test(code[j])) j--
    while (j >= 0 && (code[j] === ')' || code[j] === ']')) {
      const o = matchBack(code, j)
      if (o < 0) return 0
      j = o - 1
      if (code[j] === '.' && code[j - 1] === '?') j -= 2
      if (!/[\w$)\]]/.test(code[j] ?? '')) return o // `(await x).…` — the group starts the chain
    }
    let k = j
    while (k >= 0 && /[\w$]/.test(code[k])) k--
    let q = k
    while (q >= 0 && /\s/.test(code[q])) q--
    if (code[q] === '?' && code[q + 1] === '.') q += 1
    if (code[q] === '.' && code[q - 1] !== '.') {
      i = q
      continue
    }
    return k + 1
  }
}

/** Every read in one suite, what each one is, and every marker. */
export function readsIn(src) {
  const { code, bare, clean } = lex(src)
  const lineOf = (i) => src.slice(0, i).split('\n').length
  const calls = []
  for (const m of code.matchAll(CHECKS)) {
    const open = m.index + m[0].length - 1
    const close = matchForward(code, open)
    if (close > 0) calls.push({ open, close, args: argSpans(code, open, close) })
  }
  // Which argument of the innermost check call around `p` holds it — null
  // outside every check.
  const inCheck = (p) => {
    const call = calls.filter((c) => c.open < p && p < c.close).sort((a, b) => b.open - a.open)[0]
    return call ? call.args.findIndex(([a, b]) => p >= a && p <= b) : null
  }
  const decls = [...code.matchAll(/(?<![\w$.])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=(?![=>])/g)].map((m) => ({
    name: m[1],
    at: m.index,
    from: m.index + m[0].length,
    to: statementEnd(code, m.index + m[0].length),
  }))
  const declOf = (name, before) =>
    decls.filter((d) => d.name === name && d.at < before).sort((a, b) => b.at - a.at)[0] ??
    decls.find((d) => d.name === name)
  const isFunction = (d) =>
    /^\s*(?:async\b\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|^\s*(?:async\s+)?function\b/.test(code.slice(d.from, d.to))
  // A value only messages use: every other mention of its name is in a check's message.
  const onlyMessages = (d) => {
    const uses = [...code.matchAll(new RegExp(`(?<![\\w$.])${d.name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g'))]
      .map((m) => m.index)
      .filter((u) => u < d.at || u >= d.to)
    return uses.every((u) => (inCheck(u) ?? 0) >= 1)
  }
  // Where a guard can be written: the chain the read belongs to, and — when
  // that chain starts at a variable declared in this file — its declaration,
  // put first, so the text reads in the order the locator is built.
  const guardText = (start, end) => {
    let text = bare.slice(start, end)
    const root = code.slice(start, end).match(/^\s*([A-Za-z_$][\w$]*)/)?.[1]
    const d = root && declOf(root, start)
    if (d && !(d.from <= start && start < d.to)) text = `${bare.slice(d.from, d.to)} ${text}`
    return text
  }

  /*
   * THE SAME ELEMENT'S VISIBILITY, ASKED FIRST, DECIDING WHETHER ITS TEXT
   * COUNTS — innerText only. A shown element's `innerText` leaves out what is
   * hidden inside it, so a read is sound once the element read is known drawn:
   * `drawn ? (await el.innerText()) : ''` with `drawn` declared as
   * `el.isVisible()` (or a `waitFor` that waits for it shown), or
   * `(await el.isVisible()) && …` ahead of the read in one statement. The
   * question has to be about the SAME element, come BEFORE the read, and its
   * answer has to gate the read — a ternary's test or the left of an `&&`.
   */
  const regionStart = (p) => {
    const d = decls.filter((x) => x.from <= p && p < x.to).sort((a, b) => b.from - a.from)[0]
    if (d) return d.from
    const call = calls.filter((c) => c.args[0][0] <= p && p <= c.args[0][1]).sort((a, b) => b.open - a.open)[0]
    return call ? call.args[0][0] : src.lastIndexOf('\n', p) + 1
  }
  const shownState = (method, open, close) =>
    method === 'isVisible' || !/\bstate\s*:\s*(['"`])(?!visible\1)/.test(bare.slice(open, close))
  const gates = (k, to) => {
    for (;;) {
      while (k < to && /\s/.test(code[k])) k++
      const chained = /^\.\s*(?:catch|then)\s*\(/.exec(code.slice(k, k + 24))
      if (chained) k = matchForward(code, k + chained[0].length - 1) + 1
      else if (code[k] === ')') k += 1
      else break
    }
    return /^(?:\?(?![.?])|&&)/.test(code.slice(k, k + 2))
  }
  const asked = (recv, from, to) => {
    const ask = new RegExp(`(?<![\\w$.])${flex(norm(recv))}\\s*\\.\\s*(isVisible|waitFor)\\s*\\(`, 'g')
    for (const q of bare.slice(from, to).matchAll(ask)) {
      const open = from + q.index + q[0].length - 1
      const close = matchForward(code, open)
      if (close > 0 && shownState(q[1], open, close) && gates(close + 1, to)) return true
    }
    for (const t of code.slice(from, to).matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)(?=\s*(?:\?(?![.?])|&&))/g)) {
      const d = declOf(t[1], to)
      if (!d || d.at >= to || isFunction(d)) continue
      for (const q of bare.slice(d.from, d.to).matchAll(ask)) {
        const open = d.from + q.index + q[0].length - 1
        if (shownState(q[1], open, matchForward(code, open))) return true
      }
    }
    return false
  }

  const found = [
    ...[...code.matchAll(READ)].map((m) => ({ dot: m.index, name: m[1], end: m.index + m[0].length })),
    ...[...code.matchAll(READ_TEXT)].map((m) => ({ dot: m.index, name: 'readText', end: m.index + m[0].length })),
  ].sort((a, b) => a.dot - b.dot)
  const reads = []
  for (const { dot, name, end } of found) {
    const after = name === 'readText' ? '(' : code.slice(end).match(/^\s*(\(|=(?!=))?/)[1]
    if (after === '=') continue // a write: `el.textContent = …`
    const inner = INNER.has(name)
    const read = { line: lineOf(dot), inner, verb: name === 'readText' ? 'readText()' : after === '(' ? `${name}()` : `.${name}` }
    const k = inCheck(dot)
    if (k !== null && k >= 1) read.kind = 'message'
    else if (k === null) {
      const d = decls.filter((x) => x.from <= dot && dot < x.to).sort((a, b) => b.from - a.from)[0]
      if (d && !isFunction(d) && onlyMessages(d)) read.kind = 'message-only'
    }
    if (!read.kind) {
      let text = ''
      // The element read: the chain in front of the read, or `readText`'s first argument.
      let recv = bare.slice(chainStart(code, dot), dot)
      if (name === 'readText') {
        const open = code.indexOf('(', dot)
        const [a, b] = argSpans(code, open, matchForward(code, open))[0]
        text = guardText(a, b)
        recv = bare.slice(a, b)
      } else if (after === '(') {
        text = guardText(chainStart(code, dot), matchForward(code, code.indexOf('(', dot)) + 1)
      } else {
        // In page code: the evaluate-family call around it, receiver and callback both.
        let depth = 0
        for (let o = dot - 1; o >= 0 && !text; o--) {
          if (code[o] === ')') depth += 1
          else if (code[o] === '(' && depth > 0) depth -= 1
          else if (code[o] === '(') {
            const callee = code.slice(Math.max(0, o - 40), o).match(/([A-Za-z_$][\w$]*)\s*$/)?.[1] ?? ''
            if (!EVALUATES.test(callee)) continue
            const member = code.slice(Math.max(0, o - 60), o).match(/\.\s*[A-Za-z_$][\w$]*\s*$/)
            const start = member ? chainStart(code, Math.max(0, o - 60) + member.index) : o - callee.length
            text = guardText(start, matchForward(code, o) + 1)
          }
        }
        if (!text) text = bare.slice(src.lastIndexOf('\n', dot) + 1, src.indexOf('\n', dot) >>> 0)
      }
      if (onElement(text)) read.kind = 'guarded'
      else if (inner && recv.trim()) {
        // innerText only: `textContent` of a drawn element still reads what is hidden inside it.
        if (PAGE.test(norm(recv))) read.kind = 'page'
        else if (asked(recv, regionStart(dot), dot)) read.kind = 'asked'
      }
    }
    reads.push(read)
  }

  const markers = []
  for (const m of src.matchAll(MARKER)) {
    if (bare[m.index] !== ' ') continue // `// text-read:` inside a string is not a comment
    markers.push({ line: lineOf(m.index), reason: m[1], inCheck: inCheck(m.index) !== null })
  }
  return { reads, markers, clean }
}

/** The gate over one directory: every problem, and a tally of what was read. */
export function scan(dir) {
  const problems = []
  const tally = {
    reads: 0, suites: 0, textContent: 0, innerText: 0, readText: 0,
    message: 0, 'message-only': 0, guarded: 0, asked: 0, page: 0, exempt: {}, left: {},
  }
  let files = []
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort()
  } catch {
    files = []
  }
  if (files.length < MIN_SUITES) {
    problems.push(
      `only ${files.length} suite(s) read under ${dir}, below the floor of ${MIN_SUITES} — a scan that reads ` +
        'nothing passes, so the zero needs a denominator',
    )
  }
  for (const file of files) {
    const { reads, markers, clean } = readsIn(readFileSync(join(dir, file), 'utf8'))
    if (!clean) {
      problems.push(`${file}  could not be read as JavaScript — it ends inside a string, comment or template, so any answer about it would be a guess`)
      continue
    }
    if (reads.length) tally.suites += 1
    tally.reads += reads.length
    for (const r of reads) tally[r.verb === 'readText()' ? 'readText' : r.inner ? 'innerText' : 'textContent'] += 1
    const byLine = new Map(markers.map((mk) => [mk.line, mk]))
    const unread = []
    for (const r of reads) {
      if (r.kind) {
        tally[r.kind] += 1
        continue
      }
      const mk = byLine.get(r.line)
      if (mk && REASONS.includes(mk.reason) && !mk.inCheck) {
        tally.exempt[mk.reason] = (tally.exempt[mk.reason] ?? 0) + 1
        mk.used = true
      } else if (!mk && r.inner && file in LEFT) {
        unread.push(r.line)
      } else if (!mk && r.inner) {
        problems.push(`${file}:${r.line}  ${r.verb} — a hidden element answers innerText with its whole text, and nothing on the read says it is drawn`)
      } else if (!mk) {
        problems.push(`${file}:${r.line}  ${r.verb} — reads hidden text as if it were shown, and nothing on the read says otherwise`)
      }
      // A marker that is there and cannot exempt is reported once, on its own line, below.
    }
    if (file in LEFT) {
      const want = LEFT[file]
      if (unread.length > want) {
        problems.push(
          `${file}  ${unread.length} innerText read(s) with no out (lines ${unread.join(', ')}), where ${want} were left ` +
            'for later — a new read needs a guard, a message or a marker',
        )
      } else if (unread.length < want) {
        problems.push(
          `${file}  ${unread.length} innerText read(s) with no out, where LEFT_FOR_LATER says ${want} — bring it down to ` +
            `${unread.length}, so a conversion cannot be undone quietly`,
        )
      } else if (want) tally.left[file] = want
    }
    for (const mk of markers) {
      if (mk.inCheck) {
        problems.push(
          `${file}:${mk.line}  // text-read: ${mk.reason} — inside a check's arguments, where the other gates split on text ` +
            'and a comment moves the split; hoist the read into a variable and mark that line',
        )
      } else if (!REASONS.includes(mk.reason)) {
        problems.push(`${file}:${mk.line}  // text-read: ${mk.reason} — not a reason this gate knows (${REASONS.join(', ')})`)
      } else if (!mk.used) {
        problems.push(`${file}:${mk.line}  // text-read: ${mk.reason} — exempts nothing: no read on this line needs it`)
      }
    }
  }
  return { problems, tally, suites: files.length }
}

function report({ problems, tally, suites }) {
  if (problems.length) {
    for (const p of problems) console.log(`✗ ${p}`)
    console.error(
      `\n[text-reads] ${problems.length} problem(s). A check that says text is SHOWN has to read what is drawn:\n` +
        'put the visibility check on the element read — `.filter({ visible: true })` on its locator (or on the\n' +
        'locator handed to `readText`), `checkVisibility()` in page code, or the same element\'s `isVisible()`\n' +
        'asked first with its answer gating the read — and read `innerText` for anything hidden inside it.\n' +
        '`innerText` alone is not enough: an element that is itself hidden gives back its whole text, and only\n' +
        'the page\'s own body is drawn by definition. Keep `textContent` behind the filter where `innerText`\n' +
        'would change the words (`uppercase` labels, `<option>`s).\n' +
        'A read that asserts nothing about showing ends its line with `// text-read: <reason>`, one of\n' +
        `${REASONS.join(', ')} — outside any check's arguments.`,
    )
    process.exitCode = 1
    return false
  }
  const exempt = Object.entries(tally.exempt).sort()
  const left = Object.entries(tally.left).sort()
  console.log(
    `[text-reads] ok — ${tally.reads} read(s) of an element's text in ${tally.suites} of ${suites} suite(s) ` +
      `(${tally.textContent} textContent, ${tally.innerText} innerText, ${tally.readText} through readText), none resting a ` +
      `check that text is shown on text that may be hidden: ${tally.message} in a check's message, ` +
      `${tally['message-only']} in a variable only messages use, ${tally.guarded} behind a visibility guard, ` +
      `${tally.asked} after the same element's visibility is asked, ${tally.page} of the page's own body, ` +
      `${exempt.reduce((n, [, v]) => n + v, 0)} exempt${exempt.length ? ` (${exempt.map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}` +
      (left.length
        ? `; ${left.reduce((n, [, v]) => n + v, 0)} innerText read(s) left for later in ${left.length} suite(s) other work ` +
          `was changing (${left.map(([k, v]) => `${k} ${v}`).join(', ')})`
        : ''),
  )
  return true
}

/*
 * THE PLANTED SUITES. Each gets a directory of its own, and the gate — this
 * file, or under `--mutate` a broken copy of it — runs over it as a child,
 * exactly as it runs over `test/e2e`.
 */
const HR9 = [
  "const panel = page.getByTestId('home-section-reminders')",
  "const empty = await page.getByTestId('home-reminders-empty').textContent({ timeout: 5000 }).catch(() => null)",
  "chk(/no reminders/i.test(empty ?? ''), 'and with none left, the panel says there are none', `it read ${empty}`)",
].join('\n')
// Two innerText reads with no out, for the left-for-later cases.
const LEFT_TWO = "const a = await page.getByTestId('a').innerText()\nconst b = await readText(page.getByTestId('b'))\nchk(a === '1' && b === '2', 'both')"
const CASES = [
  ['caught', 'the hr-9 read: a hidden empty state read with textContent', { 'home-reminders.mjs': HR9 }, /✗ home-reminders\.mjs:2 {2}textContent\(\)/],
  ['passes', 'the same suite fixed: filtered to visible, read with innerText', { 'home-reminders.mjs': HR9.replace('.textContent({', '.filter({ visible: true }).innerText({') }],
  ['passes', 'or kept as textContent behind the filter, where innerText would change the words', { 'menu.mjs': HR9.replace('.textContent({', '.filter({ visible: true }).textContent({') }],
  ['caught', 'a read at the head of a condition', { 'c.mjs': "chk((await page.getByTestId('t').textContent()) === 'Create', 'headed Create')" }, /✗ c\.mjs:1 {2}textContent\(\)/],
  ['caught', 'a list read inside a helper the condition calls', { 'c.mjs': "const labels = () => page.getByTestId('l').allTextContents()\nchk((await labels()).includes('a'), 'a is listed')" }, /✗ c\.mjs:1 {2}allTextContents\(\)/],
  ['caught', 'a property read in page code', { 'c.mjs': "const w = await page.locator('[data-testid^=\"w-\"]').evaluateAll((els) => els.map((e) => e.textContent))\nchk(w.length === 3, 'three words')" }, /✗ c\.mjs:1 {2}\.textContent/],
  ['caught', 'a variable a message uses AND the condition', { 'c.mjs': "const t = await page.getByTestId('x').textContent()\nchk(t === 'a', 'it says a', `it said ${t}`)" }, /✗ c\.mjs:1 /],
  ['caught', 'a guard on another statement, not on the read', { 'c.mjs': "const shown = page.getByTestId('x').filter({ visible: true })\nconst t = await page.getByTestId('x').textContent()\nchk(t === 'a', 'it says a')" }, /✗ c\.mjs:2 /],
  ['caught', 'a marker with a reason nobody defined', { 'c.mjs': "const t = await page.getByTestId('x').textContent() // text-read: because\nchk(t === 'a', 'it says a')" }, /not a reason this gate knows/],
  ['caught', 'a marker that exempts nothing', { 'c.mjs': "const t = await page.getByTestId('x').filter({ visible: true }).innerText() // text-read: key\nchk(t === 'a', 'it says a')" }, /exempts nothing/],
  ['caught', "a marker inside a check's arguments", { 'c.mjs': "chk(\n  (await page.getByTestId('x').textContent()) === 'a', // text-read: key\n  'it says a',\n)" }, /inside a check's arguments/],
  ['caught', 'a directory with no suites in it', { 'README.md': 'nothing' }, /below the floor/],
  ['passes', 'a read in a check message', { 'c.mjs': "chk(await visible('x'), 'x is there', `it read ${await page.getByTestId('x').textContent().catch(() => null)}`)" }],
  ['passes', 'a variable only a message uses', { 'c.mjs': "const now = await page.getByTestId('x').textContent().catch(() => null)\nchk(ok, 'the chip moved', `the chip read ${now}`)" }],
  ['passes', 'page code that checks visibility first', { 'c.mjs': "const w = await page.locator('li').evaluateAll((els) => els.filter((e) => e.checkVisibility()).map((e) => e.textContent))\nchk(w.length === 3, 'three')" }],
  ['passes', 'a guard on a locator held in a variable', { 'c.mjs': "const note = page.getByTestId('n').filter({ visible: true })\nchk((await note.textContent()) === 'a', 'it says a')" }],
  ['passes', 'a read marked with a reason', { 'c.mjs': "const k = await page.getByTestId('x').textContent() // text-read: key — finds the row\nchk(rows.includes(k), 'the row is there')" }],
  // Each where a real read would be caught: in a condition, or a statement of its own.
  ['passes', 'textContent in a comment, a string and a regex, and a write', {
    'c.mjs': [
      '// el.textContent() in a comment is not a read',
      "chk(label !== 'el.textContent()' && /.textContent[(]/.test(src), 'nothing here reads a page')",
      "await page.evaluate(() => { document.body.textContent = '' })",
    ].join('\n'),
  }],

  // ── innerText, which leaves out what is hidden INSIDE a drawn element and
  // answers a hidden element with its whole text (`found-29-sep/innertext-reads-hidden-leaves`).
  ['caught', 'a leaf read with innerText, which a hidden leaf answers in full', { 'c.mjs': "chk((await page.getByTestId('count').innerText()) === '3', 'three open')" }, /✗ c\.mjs:1 {2}innerText\(\)/],
  ['caught', 'allInnerTexts over a list, in a helper the condition calls', { 'c.mjs': "const labels = () => page.getByTestId('l').allInnerTexts()\nchk((await labels()).includes('a'), 'a is listed')" }, /✗ c\.mjs:1 {2}allInnerTexts\(\)/],
  ['caught', 'an innerText property read in page code', { 'c.mjs': "const w = await page.locator('li').evaluateAll((els) => els.map((e) => e.innerText))\nchk(w.length === 3, 'three')" }, /✗ c\.mjs:1 {2}\.innerText/],
  ['caught', 'a leaf read through readText, which is innerText by another name', { 'c.mjs': "const t = await readText(page.getByTestId('chip'))\nchk(t === 'a', 'the chip says a')" }, /✗ c\.mjs:1 {2}readText\(\)/],
  ['caught', 'a guard on an ancestor, not on the leaf read', { 'c.mjs': "chk((await page.getByTestId('panel').filter({ visible: true }).getByTestId('count').innerText()) === '3', 'three open')" }, /✗ c\.mjs:1 {2}innerText\(\)/],
  ['caught', 'an ancestor guarded where it is declared, and a leaf read from it', { 'c.mjs': "const panel = page.getByTestId('panel').filter({ visible: true })\nchk((await panel.getByTestId('count').innerText()) === '3', 'three open')" }, /✗ c\.mjs:2 {2}innerText\(\)/],
  ['caught', 'page code reading a child of the element it checked', { 'c.mjs': "const t = await page.locator('li').filter({ visible: true }).evaluateAll((els) => els.map((e) => e.querySelector('b').innerText))\nchk(t.length === 1, 'one')" }, /✗ c\.mjs:1 {2}\.innerText/],
  ['passes', 'options of a drawn select, the one guard an option can have', { 'c.mjs': "const opts = await page.locator('select').filter({ visible: true }).locator('option').allInnerTexts()\nchk(opts.includes('a'), 'a is offered')" }],
  ['passes', 'readText handed a locator filtered to visible', { 'c.mjs': "const t = await readText(page.getByTestId('chip').filter({ visible: true }))\nchk(t === 'a', 'the chip says a')" }],
  ['passes', 'the page’s own body, read with innerText', { 'c.mjs': "const body = await page.locator('body').innerText()\nconst doc = await page.evaluate(() => document.body?.innerText ?? '')\nchk(body.includes('a') && doc.includes('a'), 'a is on the page')" }],
  ['caught', 'a container that is not the body, which can be hidden whole', { 'c.mjs': "const t = await page.locator('main').innerText()\nchk(t.includes('a'), 'a is on the page')" }, /✗ c\.mjs:1 {2}innerText\(\)/],
  ['caught', 'the body read with textContent, which reads what is hidden in it', { 'c.mjs': "const t = await page.locator('body').textContent()\nchk(t.includes('a'), 'a is on the page')" }, /✗ c\.mjs:1 {2}textContent\(\)/],
  ['passes', 'the same element’s visibility asked first, its answer gating the read', {
    'c.mjs': [
      "const pick = page.getByTestId('pick')",
      'const drawn = await waitUntil(() => pick.isVisible().catch(() => false))',
      "const text = drawn ? (await pick.innerText()).trim() : ''",
      "const sheet = page.getByTestId('sheet').first()",
      'const open = await sheet.waitFor({ timeout: 8000 }).then(() => true).catch(() => false)',
      "const said = open ? await sheet.innerText().catch(() => '') : ''",
      "chk((await page.getByTestId('x').isVisible()) && (await page.getByTestId('x').innerText()) === 'a', 'x says a')",
      "const toast = page.locator('[data-sonner-toast]')",
      "const toasted = await toast.first().waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false)",
      "const told = toasted ? await readText(toast.first()) : ''",
      "chk(drawn && text === 'a' && said === 'b' && told === 'c', 'it says a, b and c')",
    ].join('\n'),
  }],
  ['caught', 'visibility asked of another element', { 'c.mjs': "const shown = await page.getByTestId('panel').isVisible()\nconst t = shown ? await page.getByTestId('count').innerText() : ''\nchk(t === '3', 'three')" }, /✗ c\.mjs:2 {2}innerText\(\)/],
  ['caught', 'visibility asked after the read', { 'c.mjs': "const el = page.getByTestId('x')\nconst t = await el.innerText()\nconst drawn = await el.isVisible()\nchk(drawn && t === 'a', 'a')" }, /✗ c\.mjs:2 {2}innerText\(\)/],
  ['caught', 'a wait for the element attached, not shown', { 'c.mjs': "const el = page.getByTestId('x')\nconst there = await el.waitFor({ state: 'attached' }).then(() => true, () => false)\nconst t = there ? await el.innerText() : ''\nchk(t === 'a', 'a')" }, /✗ c\.mjs:3 {2}innerText\(\)/],
  ['caught', 'visibility asked and not gating the read', { 'c.mjs': "const el = page.getByTestId('x')\nconst both = [await el.isVisible(), await el.innerText()]\nchk(both[0] && both[1] === 'a', 'a')" }, /✗ c\.mjs:2 {2}innerText\(\)/],
  ['caught', 'textContent after the same element’s isVisible, which still reads what is hidden inside it', { 'c.mjs': "const el = page.getByTestId('x')\nconst t = (await el.isVisible()) ? await el.textContent() : ''\nchk(t === 'a', 'a')" }, /✗ c\.mjs:2 {2}textContent\(\)/],
  ['passes', 'navigator.clipboard.readText, which reads no element', { 'c.mjs': "const copied = await page.evaluate(() => navigator.clipboard.readText())\nchk(copied === 'a', 'copied a')" }],
  ['passes', 'an innerText read marked absence', { 'c.mjs': "const t = await page.getByTestId('x').innerText() // text-read: absence — nothing may say y, hidden or not\nchk(!t.includes('y'), 'y is not there')" }],
  ['passes', 'a suite left for later, holding the reads it was left with', { 'left.mjs': LEFT_TWO }, undefined, { TEXT_READS_LEFT: '{"left.mjs":2}' }],
  ['caught', 'and one more read there is reported', { 'left.mjs': `${LEFT_TWO}\nchk((await page.getByTestId('c').innerText()) === '3', 'three')` }, /left\.mjs {2}3 innerText read\(s\) with no out \(lines 1, 2, 4\)/, { TEXT_READS_LEFT: '{"left.mjs":2}' }],
  ['caught', 'and one fewer asks for the number to come down', { 'left.mjs': "const a = await page.getByTestId('a').innerText()\nchk(a === '1', 'one')" }, /left\.mjs {2}1 innerText read\(s\) with no out, where LEFT_FOR_LATER says 2/, { TEXT_READS_LEFT: '{"left.mjs":2}' }],
  ['caught', 'a textContent read in a suite left for later is still reported', { 'left.mjs': "const a = await page.getByTestId('a').innerText()\nconst t = await page.getByTestId('t').textContent()\nchk(a === '1' && t === '2', 'both')" }, /✗ left\.mjs:2 {2}textContent\(\)/, { TEXT_READS_LEFT: '{"left.mjs":1}' }],
]

function runCases(gate) {
  let fail = 0
  const seen = {}
  console.log(`\n▶ planted suites, each run through ${gate === SELF ? 'this gate' : 'the gate under test'}`)
  for (const [want, name, files, pattern, caseEnv] of CASES) {
    const dir = mkdtempSync(join(tmpdir(), 'text-reads-'))
    let r
    try {
      for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, path)), { recursive: true })
        writeFileSync(join(dir, path), `${text}\n`)
      }
      const env = { ...process.env, SUITE_DIR: dir }
      delete env.TEXT_READS_UNDER_TEST
      delete env.TEXT_READS_LEFT
      Object.assign(env, caseEnv)
      r = spawnSync(process.execPath, [gate], { encoding: 'utf8', env, timeout: 60_000 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
    const ok = want === 'caught' ? r.status === 1 && pattern.test(out) : r.status === 0 && /\[text-reads\] ok/.test(out)
    seen[name] = { ok, first: out.split('\n').find((l) => l.startsWith('✗') || l.startsWith('[text-reads] ok')) ?? '' }
    if (ok) console.log(`  \x1b[32mPASS\x1b[0m ${want === 'caught' ? 'caught' : 'passes'}: ${name}`)
    else {
      fail += 1
      console.log(`  \x1b[31mFAIL\x1b[0m ${want === 'caught' ? 'not caught' : 'did not pass'}: ${name} — exit ${r.status}: ${out.trim().split('\n')[0]}`)
    }
  }
  console.log(`\n${CASES.length - fail} passed, ${fail} failed`)
  return { fail, seen }
}

if (process.env.TEXT_READS_UNDER_TEST) {
  // One pass of the cases against a broken copy, started by `proveMutationsBite` below.
  process.exitCode = runCases(process.env.TEXT_READS_UNDER_TEST).fail ? 1 : 0
} else {
  const realOk = report(scan(SUITES))
  if (process.argv.includes('--mutate')) {
    const { fail, seen } = runCases(SELF)
    const planted = seen[CASES[0][1]]
    const fixed = seen[CASES[1][1]]
    console.log(
      `[text-reads] mutate: the planted hr-9 read was ${planted.ok ? 'caught' : 'NOT caught'} — ${planted.first}\n` +
        `[text-reads] mutate: the same suite, filtered to visible and read with innerText, ${fixed.ok ? 'passes' : 'does NOT pass'} — ${fixed.first}`,
    )
    const alive = (mutant) => {
      const r = spawnSync(process.execPath, [mutant], { encoding: 'utf8', timeout: 60_000 })
      return { ok: /\[text-reads\]|✗/.test(r.stdout ?? ''), why: r.stderr }
    }
    /*
     * EACH ANCHOR IS WRITTEN IN TWO PIECES, because this file holds its own
     * mutations: written whole, every anchor would be found twice — where it
     * works, and here — and `proveMutationsBite` refuses an anchor that is
     * not exactly one place.
     */
    const at = (...pieces) => pieces.join('')
    const blind = proveMutationsBite({
      subject: SELF,
      caseFile: SELF,
      envVar: 'TEXT_READS_UNDER_TEST',
      label: 'this gate',
      alive,
      mutations: [
        ['messages-decide', at('if (k !== null && k >= 1) ', "read.kind = 'message'"), "if (k !== null && k >= 99) read.kind = 'message'"],
        ['any-guard-will-do', at('const GUARD = /', '\\.filter'), 'const GUARD = /|\\.filter'],
        ['helpers-unread', at("if (!read.kind) {\n      let text = ''", ''), "if (!read.kind) {\n      read.kind = k === 0 ? undefined : 'guarded'\n      let text = ''"],
        ['every-variable-a-message', at('return uses.every((u) => ', '(inCheck(u) ?? 0) >= 1)'), 'return true'],
        ['no-floor', at('const MIN_SUITES = ', 'process.env.SUITE_DIR ? 1 : 100'), 'const MIN_SUITES = 0'],
        ['strings-are-code', at("      } else blank(code, i)\n    } else if (mode === ", "'template') {"), "      }\n    } else if (mode === 'template') {"],
        ['regexes-are-code', at('      } else blank(code, i)\n    }\n  }\n', '  return { code'), '      }\n    }\n  }\n  return { code'],
        ['comments-are-code', at("      if (c === '\\n') mode = 'code'\n", '      else blank(code, i), blank(bare, i)'), "      if (c === '\\n') mode = 'code'\n      else blank(bare, i)"],
        ['writes-are-reads', at("if (after === '=') ", 'continue'), 'if (false) continue'],
        ['any-reason-will-do', at('} else if (!REASONS.includes(mk.reason)) {\n', '        problems.push'), '} else if (false) {\n        problems.push'],
        ['stale-markers-pass', at('} else if (!mk.used) {', '\n'), '} else if (false) {\n'],
        ['markers-anywhere', at('      if (mk.inCheck) {', '\n        problems.push('), '      if (false) {\n        problems.push('],
        ['roots-not-followed', at('if (d && !(d.from <= start && start < d.to)) ', 'text = `'), 'if (false) text = `'],
        ['violations-exit-zero', at('    process.exitCode = 1\n', '    return false'), '    process.exitCode = 0\n    return false'],
        // The innerText half (`found-29-sep/innertext-reads-hidden-leaves`).
        ['innertext-unread', at('const READ = /\\.(textContent|allTextContents', '|innerText|allInnerTexts)\\b/g'), 'const READ = /\\.(textContent|allTextContents)\\b/g'],
        ['readtext-unread', at('...[...code.matchAll(', 'READ_TEXT)]'), '...[...[]]'],
        ['any-container-is-the-page', at('(?:body', '|html)\\1'), '[^\'"`]*\\1'],
        ['innertext-rules-for-textContent', at('else if (inner ', '&& recv.trim()) {'), 'else if (recv.trim()) {'],
        ['asked-of-any-element', at('${flex(', 'norm(recv))}'), '[^;]*?'],
        ['asked-after-the-read', at('asked(recv, regionStart(dot), ', 'dot)'), 'asked(recv, regionStart(dot), code.length)'],
        ['any-wait-will-do', at("method === 'isVisible' || ", '!/\\bstate'), "method === 'isVisible' || true || !/\\bstate"],
        ['asked-need-not-gate', at('return /^(?:\\?(?![.?])|&&)/', '.test(code.slice(k, k + 2))'), 'return true'],
        ['left-for-later-may-grow', at('if (unread.length ', '> want) {'), 'if (false) {'],
        ['left-for-later-may-shrink', at('} else if (unread.length ', '< want) {'), '} else if (false) {'],
        ['left-for-later-covers-textContent', at('} else if (!mk && r.inner ', '&& file in LEFT) {'), '} else if (!mk && file in LEFT) {'],
        ['ancestor-guards-count', at('!!last && !STEP', '.test('), '!!last && !/(?!)/.test('],
        ['options-unexcused', at(".replace(OPTION, ", "'')"), ''],
        ['declaration-read-last', at('text = `${bare.slice(d.from, d.to)} ', '${text}`'), 'text = `${text} ${bare.slice(d.from, d.to)}`'],
      ],
    })
    if (!realOk || fail || blind) process.exitCode = 1
  }
}
