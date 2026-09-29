#!/usr/bin/env node
/**
 * A conditional check makes the run's LENGTH conditional, and every suite here
 * compares its length against `EXPECTED_CHECKS` with `!==`.
 *
 * Put those two facts together and a whole class of regression stops being
 * reportable. `video-regression`'s G13-10 chain reported three checks when the
 * AI dock was missing and seven when it was there, so
 * `vr-4-the-ai-dock-is-only-on-the-ai-page` — which removes the dock — produced
 *
 *     84 passed, 4 failed
 *     ✗ 88 of 92 checks ran — this run stopped early
 *
 * The three FAIL lines naming the missing dock were right there, under a
 * headline that says the RUN is broken. A person reading that reaches for the
 * harness, not for the product. With the chain reporting eight on every path
 * the same patch reddens NINE and the run reaches its own totals.
 *
 * It is not a rare shape. `emoji-picker` section 7 clicked a Try again button
 * that only exists in the failure state, so a build where the picker WORKS
 * threw an uncaught TimeoutError and killed the process before printing
 * anything — which the break harness recorded as a patch that reddened three
 * checks. `addressability-live` guarded three follow-up checks the same way.
 * Four instances in two days, all found by running a patch rather than by
 * reading, which is why this exists.
 *
 * WHAT THIS IS AND IS NOT
 *
 * It is a HEURISTIC over text, and it says so in its own output. It COUNTS the
 * checks each branch of an `if` reports and compares the two sides:
 *
 *   · `chk(`, `check(`, and `ok(` / `bad(` / `skip(` where the suite defines
 *     those as reporters (a `const ok = (res) => res.status < 300` is a
 *     predicate and is not counted), and a chain's `.step(`, are ONE check each;
 *   · a chain's `.rest(` and `.skipRest(` FILL the chain to the length it was
 *     declared with, from wherever the flow had got to;
 *   · a loop multiplies its body by its bound when the bound is a literal (a
 *     number, or an array literal), and is carried as a named term otherwise;
 *   · a function of the suite's own that reports (`const expectRow = …`)
 *     counts what its body reports, wherever it is called.
 *
 * Four findings come out of that:
 *
 *   1. an `if` that reports and has no `else` — the original rule;
 *   2. an `if`/`else` whose two sides report DIFFERENT counts — 9 against 8,
 *      a chain of four against one `bad()`, three against an uncounted
 *      `console.log('SKIP …')`;
 *   3. a loop whose bound is a literal NUMBER and whose body reports — the
 *      re-typed count (`for (let i = 0; i < 8; i++) bad(…)`) that drifts the
 *      day the other side gains a check, which is exactly how the 9-vs-8 was
 *      made;
 *   4. a check reported from a `.catch(` callback, which exists only when the
 *      call it is attached to fails.
 *
 * One thing is NOT compared as stepped: a chain declared outside the `if` that
 * a `.rest()` able to run after the `if` fills. Each side then reaches the
 * chain's length whatever it stepped here — `syncup-live`'s `bgChain` steps
 * twice under an `if` with no `else` and is filled further down, and reports
 * four on every path. With no such fill, the chain counts exactly as stepped,
 * and a side that stepped less has left sentences no path will report.
 *
 * It reads code, not comments or strings: comments, string literals, regular
 * expressions and template text are blanked before a brace is counted, so a
 * `chk(` in a sentence or a `{` in a regex is not structure. What it CANNOT
 * know is whether a condition is ever false in practice, and a branch whose
 * count it cannot settle (a fill on a chain whose position it lost, a call it
 * cannot count) is printed as unsettled rather than guessed at either way.
 * Nor does it read a `switch`, a check on either side of a `?:`, or one behind
 * `&&` — none of the suites reports that way today, and the first to do so is
 * a case to add here, not a shape to assume away. `BRANCHES_TRACE=<suite>.mjs`
 * prints every pair it compared in that suite, both counts, for reading by
 * hand.
 *
 * It is a RATCHET over the total, like the break-coverage and break-claims
 * checks beside it: the number may fall and may not rise. The fix is
 * `test/e2e/lib/chain.mjs`: give the `if` an `else` that reports the same
 * checks as FAILED, with the reason the branch was not taken. A check that did
 * not run is a check nobody knows the answer to, and the honest way to say
 * that is to fail it with a sentence explaining why.
 *
 * THE ONE EXCEPTION IS A GATE ON THE MACHINE, NOT ON THE PRODUCT — no routable
 * audio output, no object storage configured, an entitlement the tenant does
 * not have. Those are genuinely unknown rather than broken, and `skipRest`
 * reports them as SKIP. It only works where the suite has a `skip` that COUNTS
 * towards the run total, because an uncounted skip is the short run this file
 * exists to find; `syncup-live` is the suite that needed it, and counting its
 * five storage skips is what let it stop keeping a floor and compare exactly.
 * A skip reachable by a PRODUCT regression is a check that cannot fail.
 */
/*
 * `process.exitCode`, NOT `process.exit()`. Writing to a PIPE is asynchronous,
 * and `process.exit` discards whatever has not been flushed — eleven checkers
 * in this tree were found truncating their own output that way, one of them
 * losing 8,263 bytes and 641 of 809 lines while exiting 0. A checker whose
 * explanation is cut off is a checker nobody can act on.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHECK_CALL } from './lib/check-call.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
/*
 * `SUITE_DIR` EXISTS SO THIS RULE CAN BE TESTED AT ALL, and nothing in the
 * audit reads it but `check-branches-cases.mjs`. The same seam
 * `check-suite-section-enders.mjs` carries, for the same reason: this file's
 * steady-state answer is zero, and "0 failed is not it ran". With the floor
 * below satisfied by the real directory and no fixture able to reach it, a
 * regression in the counting or in the comparison would be invisible.
 */
const SUITES = process.env.SUITE_DIR ?? join(ROOT, 'test/e2e')

// Set by every refusal below. The file used to `bail(1)` at each of
// them; with that gone, the final line must not clobber the code they set.
let fatal = false

/*
 * THE MASK: code only, same length, same line breaks.
 *
 * The rule used to match braces over raw text, and said so: "a `{` inside a
 * string or a comment inside the block will throw the count off". Counting
 * CHECKS over raw text is worse — a check sentence that says "chk(" or a
 * comment that cites `bad(…)` at a line number would be counted as a call. So
 * every comment, string, regular expression and the TEXT of every template is
 * blanked before anything is read; a template's `${…}` stays, because it is
 * code. A template's own line breaks are blanked too, so a multi-line template
 * is one line to the statement splitter, which is what it is to the language.
 *
 * A `/` is a regex where a value cannot be — after an operator, an opening
 * bracket, a `}` or a keyword like `return` — and division elsewhere. That is
 * the usual heuristic and it has the usual hole (`if (x) /re/.test(y)`); the
 * bracket balance each file is asked for below is what would notice it.
 */
const REGEX_AFTER_WORD = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'await', 'yield',
])
const regexMayStart = (last, word) =>
  last === '' || /[(,=:[!&|?{};+\-*%<>~^}]/.test(last) || (word !== '' && REGEX_AFTER_WORD.has(word))

export function mask(src) {
  const out = src.split('')
  const n = src.length
  const blank = (k) => {
    if (out[k] !== '\n') out[k] = ' '
  }
  let i = 0
  let depth = 0
  const resume = [] // brace depths at which a template's `${` opened
  let inTemplate = false
  let last = ''
  let word = ''
  while (i < n) {
    const c = src[i]
    if (inTemplate) {
      if (c === '\\') {
        out[i] = ' '
        if (i + 1 < n) out[i + 1] = ' '
        i += 2
      } else if (c === '`') {
        inTemplate = false
        last = '`'
        word = ''
        i += 1
      } else if (c === '$' && src[i + 1] === '{') {
        resume.push(depth)
        depth += 1
        inTemplate = false
        last = '{'
        word = ''
        i += 2
      } else {
        out[i] = ' '
        i += 1
      }
      continue
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') blank(i++)
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2)
      const stop = close < 0 ? n : close + 2
      while (i < stop) blank(i++)
      continue
    }
    if (c === '"' || c === "'") {
      i += 1
      while (i < n && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\' && i + 1 < n) blank(i++)
        blank(i++)
      }
      i += 1
      last = c
      word = ''
      continue
    }
    if (c === '`') {
      inTemplate = true
      i += 1
      continue
    }
    if (c === '/' && regexMayStart(last, word)) {
      i += 1
      let cls = false
      while (i < n && src[i] !== '\n') {
        const d = src[i]
        if (d === '\\' && i + 1 < n) {
          blank(i++)
          blank(i++)
          continue
        }
        if (d === '/' && !cls) break
        if (d === '[') cls = true
        else if (d === ']') cls = false
        blank(i++)
      }
      i += 1
      while (i < n && /[a-z]/i.test(src[i])) i += 1
      last = '/'
      word = ''
      continue
    }
    if (c === '{') depth += 1
    else if (c === '}') {
      if (resume.length && resume[resume.length - 1] === depth - 1) {
        resume.pop()
        depth -= 1
        inTemplate = true
        i += 1
        continue
      }
      depth -= 1
    }
    if (/[\w$]/.test(c)) {
      let j = i
      while (j < n && /[\w$]/.test(src[j])) j += 1
      word = src.slice(i, j)
      last = src[j - 1]
      i = j
      continue
    }
    if (!/\s/.test(c)) {
      last = c
      word = ''
    }
    i += 1
  }
  return out.join('')
}

/** Whether the brackets of masked code balance, and where they first do not. */
function unbalancedAt(code) {
  const stack = []
  const pairs = { ')': '(', ']': '[', '}': '{' }
  for (let i = 0; i < code.length; i++) {
    const c = code[i]
    if (c === '(' || c === '[' || c === '{') stack.push(i)
    else if (c in pairs) {
      const open = stack.pop()
      if (open === undefined || code[open] !== pairs[c]) return i
    }
  }
  return stack.length ? stack[stack.length - 1] : -1
}

/*
 * THE STATEMENTS, which is the part a brace count alone could not give.
 *
 * Not a parser: blocks, `if`/`else`, the loops, `try`, function declarations
 * and a label, and everything else is an expression statement that ends at a
 * `;` or at a line break the next line does not continue — the same automatic
 * semicolon the language inserts, and every suite here is written without
 * semicolons. A braceless `if (x) c.rest('…')` / `else c.step(…)` is read as
 * the two statements it is.
 */
const isWordChar = (c) => c !== undefined && /[\w$]/.test(c)
const skipWs = (code, i, to = code.length) => {
  while (i < to && /\s/.test(code[i])) i += 1
  return i
}
const wordAt = (code, i) => {
  if (!/[A-Za-z_$]/.test(code[i] ?? '') || isWordChar(code[i - 1]) || code[i - 1] === '.') return ''
  let j = i
  while (isWordChar(code[j])) j += 1
  return code.slice(i, j)
}
/** From an opening bracket to just past its partner. */
function matching(code, i) {
  let depth = 0
  for (let j = i; j < code.length; j++) {
    const c = code[j]
    if (c === '(' || c === '[' || c === '{') depth += 1
    else if (c === ')' || c === ']' || c === '}') {
      depth -= 1
      if (depth === 0) return j + 1
    }
  }
  return code.length
}

/** Whether a line break at `nl` continues the statement that began at `from`. */
function continues(code, from, nl, to) {
  let p = nl - 1
  while (p >= from && /\s/.test(code[p])) p -= 1
  if (p < from) return true
  const prev = code[p]
  if (/[,+\-*/%=&|^!~?:<>.([{]/.test(prev)) {
    // `i++` at the end of a line ends it.
    if (!((prev === '+' || prev === '-') && code[p - 1] === prev)) return true
  }
  const q = skipWs(code, nl + 1, to)
  if (q >= to) return false
  const next = code[q]
  if (/[.?:+\-*/%=&|^,<>([`]/.test(next)) return !((next === '+' || next === '-') && code[q + 1] === next)
  const w = wordAt(code, q)
  return w === 'in' || w === 'of' || w === 'instanceof'
}

/** Where an expression statement that starts at `i` ends. */
function expressionEnd(code, i, to) {
  let depth = 0
  for (let j = i; j < to; j++) {
    const c = code[j]
    if (c === '(' || c === '[' || c === '{') depth += 1
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return j
      depth -= 1
    } else if (c === ';' && depth === 0) return j + 1
    else if (c === '\n' && depth === 0 && !continues(code, i, j, to)) return j
  }
  return to
}

function statements(code, from, to) {
  const out = []
  let i = from
  for (;;) {
    i = skipWs(code, i, to)
    if (i >= to) return out
    const s = statement(code, i, to)
    out.push(s)
    i = s.end > i ? s.end : i + 1
  }
}

function statement(code, i, to) {
  i = skipWs(code, i, to)
  const start = i
  if (code[i] === '{') {
    const close = Math.min(matching(code, i), to)
    return { type: 'block', start, end: close, body: statements(code, i + 1, close - 1) }
  }
  if (code[i] === ';') return { type: 'empty', start, end: i + 1 }
  const w = wordAt(code, i)
  if (w === 'if') {
    const open = skipWs(code, i + 2, to)
    if (code[open] === '(') {
      const condEnd = matching(code, open)
      const cons = statement(code, condEnd, to)
      const k = skipWs(code, cons.end, to)
      const alt = wordAt(code, k) === 'else' ? statement(code, k + 4, to) : null
      return { type: 'if', start, end: alt ? alt.end : cons.end, cond: [open + 1, condEnd - 1], cons, alt, elseAt: alt ? k : -1 }
    }
  }
  if (w === 'for' || w === 'while') {
    let open = skipWs(code, i + w.length, to)
    if (wordAt(code, open) === 'await') open = skipWs(code, open + 5, to)
    if (code[open] === '(') {
      const headEnd = matching(code, open)
      const body = statement(code, headEnd, to)
      return { type: 'loop', start, end: body.end, head: [open + 1, headEnd - 1], body }
    }
  }
  if (w === 'do') {
    const body = statement(code, i + 2, to)
    let end = body.end
    let head = [end, end]
    const k = skipWs(code, body.end, to)
    if (wordAt(code, k) === 'while') {
      const open = skipWs(code, k + 5, to)
      if (code[open] === '(') {
        end = matching(code, open)
        head = [open + 1, end - 1]
      }
    }
    return { type: 'loop', start, end, head, body, isDo: true }
  }
  if (w === 'try') {
    const block = statement(code, i + 3, to)
    let end = block.end
    let handler = null
    let finalizer = null
    let k = skipWs(code, end, to)
    if (wordAt(code, k) === 'catch') {
      let b = skipWs(code, k + 5, to)
      if (code[b] === '(') b = matching(code, b)
      handler = statement(code, b, to)
      end = handler.end
      k = skipWs(code, end, to)
    }
    if (wordAt(code, k) === 'finally') {
      finalizer = statement(code, k + 7, to)
      end = finalizer.end
    }
    return { type: 'try', start, end, block, handler, finalizer }
  }
  if (w === 'function' || (w === 'async' && wordAt(code, skipWs(code, i + 5, to)) === 'function')) {
    let p = i
    while (p < to && code[p] !== '(') p += 1
    const b = skipWs(code, matching(code, p), to)
    if (code[b] === '{') {
      const close = matching(code, b)
      const name = /function\s*\*?\s*([\w$]+)/.exec(code.slice(i, p))?.[1] ?? null
      return { type: 'func', start, end: close, name, body: statements(code, b + 1, close - 1), bodyAt: b }
    }
  }
  if (w && w !== 'else' && /^\s*:(?!:)/.test(code.slice(i + w.length, i + w.length + 4)) && !/^(case|default)$/.test(w)) {
    // A label. The statement it names is the one that counts.
    const inner = statement(code, code.indexOf(':', i + w.length) + 1, to)
    return { ...inner, start }
  }
  return { type: 'expr', start, end: expressionEnd(code, i, to) }
}

/*
 * FUNCTION LITERALS inside an expression: what an arrow or a `function`
 * expression holds is not run where it is written. Each is found with its
 * body, and with the call it is an argument of — `.catch(` is the one that
 * matters, because a check inside it exists only when the call fails.
 */
function arrowBodyEnd(code, b, to) {
  let depth = 0
  for (let j = b; j < to; j++) {
    const c = code[j]
    if (c === '(' || c === '[' || c === '{') depth += 1
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return j
      depth -= 1
    } else if ((c === ',' || c === ';') && depth === 0) return j
    else if (c === '\n' && depth === 0 && !continues(code, b, j, to)) return j
  }
  return to
}

/** The callee a function literal starting at `at` is passed to, as `.catch` or `name`. */
function calleeOf(code, at, from) {
  let depth = 0
  for (let j = at - 1; j >= from; j--) {
    const c = code[j]
    if (c === ')' || c === ']' || c === '}') depth += 1
    else if (c === '(' || c === '[' || c === '{') {
      if (depth === 0) {
        if (c !== '(') return null
        let e = j - 1
        while (e >= from && /\s/.test(code[e])) e -= 1
        let s = e
        while (s >= from && isWordChar(code[s])) s -= 1
        const name = code.slice(s + 1, e + 1)
        if (!name) return null
        let d = s
        while (d >= from && /\s/.test(code[d])) d -= 1
        return code[d] === '.' ? `.${name}` : name
      }
      depth -= 1
    } else if (c === ';' && depth === 0) return null
  }
  return null
}

/** Top-level function literals in [s, e): where each starts, its body, and whether it is a block. */
function functionsIn(code, s, e) {
  const found = []
  let i = s
  while (i < e) {
    if (code[i] === '=' && code[i + 1] === '>') {
      // Walk back over the parameters to where the literal starts.
      let p = i - 1
      while (p >= s && /\s/.test(code[p])) p -= 1
      if (code[p] === ')') {
        let depth = 0
        for (; p >= s; p--) {
          if (code[p] === ')') depth += 1
          else if (code[p] === '(') {
            depth -= 1
            if (depth === 0) break
          }
        }
        p -= 1
      } else {
        while (p >= s && isWordChar(code[p])) p -= 1
      }
      let q = p
      while (q >= s && /\s/.test(code[q])) q -= 1
      if (code.slice(q - 4, q + 1) === 'async' && !isWordChar(code[q - 5])) p = q - 5
      const litStart = p + 1
      const b = skipWs(code, i + 2, e)
      const block = code[b] === '{'
      const bodyEnd = block ? matching(code, b) : arrowBodyEnd(code, b, e)
      found.push({ start: litStart, bodyStart: block ? b + 1 : b, bodyEnd: block ? bodyEnd - 1 : bodyEnd, block, end: bodyEnd })
      i = bodyEnd
      continue
    }
    if (wordAt(code, i) === 'function') {
      let p = i + 8
      while (p < e && code[p] !== '(') p += 1
      const b = skipWs(code, matching(code, p), e)
      if (code[b] === '{') {
        const close = matching(code, b)
        let litStart = i
        let q = i - 1
        while (q >= s && /\s/.test(code[q])) q -= 1
        if (code.slice(q - 4, q + 1) === 'async' && !isWordChar(code[q - 5])) litStart = q - 4
        found.push({ start: litStart, bodyStart: b + 1, bodyEnd: close - 1, block: true, end: close })
        i = close
        continue
      }
    }
    i += 1
  }
  return found
}

/*
 * A COUNT. Each side of an `if` is counted as a SET of alternatives, because a
 * side holding an unbalanced `if` of its own reports one number or another; a
 * balanced side has exactly one. Each alternative carries
 *
 *   k   checks reported outright: `chk(`, `bad(`, a chain declared and run on
 *       this side;
 *   t   named terms: `loop(const t of tools)×(1)` for a loop over something
 *       only the run knows, `cb:.map(1)` for a callback that reports, and the
 *       UNSETTLED ones — `?…`, `call:f` — for what this cannot count;
 *   ch  what this side reported on each chain declared OUTSIDE it.
 *
 * `ch` is kept apart because it is the one part of a side's count that code
 * after the `if` can make up. `syncup-live`'s `bgChain` steps twice when there
 * is a background picker and not at all when there is none, and a `.rest()`
 * further down fills whatever is left, so every path reports four. So a chain
 * that a `.rest()` after the `if` FILLS is left out when the two sides are
 * compared; any other chain counts exactly as stepped — a later `.step()`
 * adds one on both paths and makes nothing up — and a side that stepped less
 * has left sentences no path will ever report.
 */
const CAP = 24
const sym = (k = 0) => ({ k, t: {}, ch: {} })
const named = (key) => ({ k: 0, t: { [key]: 1 }, ch: {} })
function addSym(a, b) {
  const r = { k: a.k + b.k, t: { ...a.t }, ch: { ...a.ch } }
  for (const [key, v] of Object.entries(b.t)) r.t[key] = (r.t[key] ?? 0) + v
  for (const [id, v] of Object.entries(b.ch)) {
    const w = r.ch[id]
    r.ch[id] = w === undefined ? v : w === '?' || v === '?' ? '?' : w + v
  }
  return r
}
const timesSym = (a, n) => ({
  k: a.k * n,
  t: Object.fromEntries(Object.entries(a.t).map(([key, v]) => [key, v * n])),
  ch: Object.fromEntries(Object.entries(a.ch).map(([id, v]) => [id, v === '?' ? '?' : v * n])),
})
const byKey = ([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)
/** What a side reports outright: its checks and terms, without the chains from outside. */
function phiKey(a) {
  const parts = Object.entries(a.t)
    .filter(([, v]) => v !== 0)
    .sort(byKey)
    .map(([key, v]) => (v === 1 ? key : `${v}×${key}`))
  if (a.k || !parts.length) parts.unshift(String(a.k))
  return parts.join(' + ')
}
const chKey = (a) =>
  Object.entries(a.ch)
    .filter(([, v]) => v !== 0)
    .sort(byKey)
    .map(([id, v]) => `${id}:${v}`)
    .join(',')
const symKey = (a) => `${phiKey(a)}|${chKey(a)}`
/** A side's whole count, as a reader of the suite would add it up. */
function showSym(a) {
  const ch = Object.entries(a.ch).filter(([, v]) => v !== 0)
  const known = ch.filter(([, v]) => v !== '?').reduce((n, [, v]) => n + v, 0)
  const unknown = ch.filter(([, v]) => v === '?').map(([id]) => `fill:${id.split('@')[0]}`)
  const base = phiKey({ ...a, k: a.k + known })
  return unknown.length ? [base === '0' ? null : base, ...unknown].filter(Boolean).join(' + ') : base
}
function uniq(alts) {
  const seen = new Map()
  for (const a of alts) seen.set(symKey(a), a)
  return seen.size > CAP ? [named('?many')] : [...seen.values()]
}
const plusC = (A, B) => uniq(A.flatMap((a) => B.map((b) => addSym(a, b))))
const ZEROC = () => [sym()]
const isZeroC = (A) => A.length === 1 && symKey(A[0]) === '0|'
const showC = (A) => A.map(showSym).join(' or ')
const UNSETTLING = /\?|call:/
const settledPhi = (a) => !Object.keys(a.t).some((key) => UNSETTLING.test(key))
const sameSet = (A, B) => {
  const a = new Set(A.map(symKey))
  return a.size === new Set(B.map(symKey)).size && B.every((b) => a.has(symKey(b)))
}

/*
 * A LOOP'S BOUND, when the text says it. `for (let i = 0; i < 8; i++)` is 8
 * and is also finding 3; `for (const v of ['List', 'Board'])` is 2 and is
 * not, because the list IS the data — only a re-typed NUMBER can drift from
 * the side it was copied from.
 */
function literalBound(code, head) {
  const h = code.slice(head[0], head[1])
  const num =
    /^\s*(?:let|var|const)?\s*([\w$]+)\s*=\s*(\d+)\s*;\s*\1\s*(<=?)\s*(\d+)\s*;\s*(?:\1\s*\+\+|\+\+\s*\1|\1\s*\+=\s*1)\s*$/.exec(h)
  if (num) return { n: Number(num[4]) - Number(num[2]) + (num[3] === '<=' ? 1 : 0), numeric: true }
  const arr = /^\s*(?:let|var|const)\s+[\w$[\]{},\s]+\s+of\s+\[/.exec(h)
  if (!arr) return null
  const open = head[0] + arr[0].length - 1
  const close = matching(code, open)
  if (skipWs(code, close, head[1]) !== head[1]) return null
  const inner = code.slice(open + 1, close - 1)
  if (inner.includes('...')) return null
  let depth = 0
  let items = inner.trim() ? 1 : 0
  for (const c of inner) {
    if ('([{'.includes(c)) depth += 1
    else if (')]}'.includes(c)) depth -= 1
    else if (c === ',' && depth === 0) items += 1
  }
  if (/,\s*$/.test(inner)) items -= 1
  return { n: items, numeric: false }
}

/** Whether a statement (not a nested loop or function) can leave its loop early. */
function exitsLoop(code, s) {
  if (!s) return false
  if (s.type === 'expr') return /^\s*(break|continue|return|throw)\b/.test(code.slice(s.start, s.end))
  if (s.type === 'block') return s.body.some((x) => exitsLoop(code, x))
  if (s.type === 'if') return exitsLoop(code, s.cons) || exitsLoop(code, s.alt)
  if (s.type === 'try') return [s.block, s.handler, s.finalizer].some((x) => exitsLoop(code, x))
  return false
}

/** Commas at depth zero, less a trailing one: how many arguments a call was given. */
function argumentCount(code, open) {
  const close = matching(code, open)
  const args = code.slice(open + 1, close - 1)
  if (args.includes('...')) return null
  let depth = 0
  let n = args.trim() ? 1 : 0
  for (const c of args) {
    if ('([{'.includes(c)) depth += 1
    else if (')]}'.includes(c)) depth -= 1
    else if (c === ',' && depth === 0) n += 1
  }
  if (/,\s*$/.test(args)) n -= 1
  return n
}

/*
 * A SUITE'S REPORTERS. `chk` and `check` always — the shared matcher. `ok`,
 * `bad` and `skip` only where the suite defines them to REPORT (the definition
 * pushes a result or prints a PASS/FAIL/SKIP line): suites that define `ok` as
 * a status predicate, `(res) => res.status < 300`, call it inside conditions,
 * and counting those calls as checks would make every one of them a finding.
 */
const EXTRA_REPORTERS = ['ok', 'bad', 'skip']
const CHAIN_OP = /(?<![.\w$])([\w$]+)\s*\.\s*(step|rest|skipRest)\s*\(/g

/*
 * THE WALK. Statements in order, with each chain's POSITION carried along, so
 * a `.rest()` knows how much it fills: a chain declared with seven sentences
 * and stepped once reports six more when it is told to stop. Both sides of an
 * `if` start from the same positions and are compared by what they report.
 */
function analyse(src) {
  const code = mask(src)
  const badAt = unbalancedAt(code)
  const lineOf = (at) => src.slice(0, at).split('\n').length
  if (badAt >= 0) return { unreadable: lineOf(badAt) }
  const top = statements(code, 0, code.length)
  const found = { noElse: [], unequal: [], literal: [], onCatch: [], unsettled: [], pairs: 0, trace: [] }

  // Every function a name is bound to, wherever it is: `const f = (…) => …`
  // and `function f(…) {…}`. Only the ones that report are kept below.
  const literalsCache = new Map()
  const literalsOf = (s, e) => {
    const key = `${s}:${e}`
    if (!literalsCache.has(key)) literalsCache.set(key, functionsIn(code, s, e))
    return literalsCache.get(key)
  }
  const defs = new Map()
  const visit = (list) => {
    for (const s of list) {
      if (!s) continue
      if (s.type === 'func' && s.name) defs.set(s.name, { at: s.start, end: s.end, body: [s.bodyAt + 1, s.end - 1], block: true })
      if (s.type === 'expr') {
        const m = /^\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*/.exec(code.slice(s.start, s.end))
        for (const f of literalsOf(s.start, s.end)) {
          if (m && skipWs(code, s.start + m[0].length) === skipWs(code, f.start) && code.slice(s.start + m[0].length, f.start).trim() === '') {
            defs.set(m[1], { at: s.start, end: s.end, body: [f.bodyStart, f.bodyEnd], block: f.block })
          }
          if (f.block) visit(statements(code, f.bodyStart, f.bodyEnd))
        }
      }
      for (const inner of [s.body, s.cons, s.alt, s.block, s.handler, s.finalizer]) {
        if (Array.isArray(inner)) visit(inner)
        else if (inner) visit([inner])
      }
    }
  }
  visit(top)
  const reporters = new Set(
    EXTRA_REPORTERS.filter((n) => defs.has(n) && /\.push\(|\bPASS\b|\bFAIL\b|\bSKIP\b/.test(src.slice(defs.get(n).at, defs.get(n).end))),
  )
  const chainMakers = new Set([...code.matchAll(/(?:const|let|var)\s+([\w$]+)\s*=\s*makeChain\s*\(/g)].map((m) => m[1]))
  chainMakers.add('chain')
  for (const n of ['chk', 'check', ...EXTRA_REPORTERS, ...chainMakers]) defs.delete(n)
  const reportRe = new RegExp(`${CHECK_CALL.source}|(?<![.\\w$])(?:${[...reporters, '\\$never'].join('|')})\\s*\\(`, 'g')

  // Which of them report, directly or through each other: a fixed point. A
  // recursive predicate (`sameShape`) or a directory walker reports nothing,
  // and must not be counted as a call that might.
  const reporting = new Set()
  const bodyText = (d) => code.slice(d.body[0], d.body[1])
  for (const [n, d] of defs) {
    const t = bodyText(d)
    if (new RegExp(reportRe.source).test(t) || new RegExp(CHAIN_OP.source).test(t)) reporting.add(n)
  }
  for (let grew = true; grew; ) {
    grew = false
    for (const [n, d] of defs) {
      if (reporting.has(n)) continue
      const t = bodyText(d)
      if ([...reporting].some((r) => new RegExp(`(?<![.\\w$])${r.replace(/\$/g, '\\$')}\\s*\\(`).test(t))) {
        reporting.add(n)
        grew = true
      }
    }
  }
  for (const n of [...defs.keys()]) if (!reporting.has(n)) defs.delete(n)
  const callRe = defs.size ? new RegExp(`(?<![.\\w$])(${[...defs.keys()].map((n) => n.replace(/\$/g, '\\$')).join('|')})\\s*\\(`, 'g') : null

  /*
   * Where each chain is declared and FILLED, for "does anything after this
   * `if` fill it?". Only a `.rest()` makes up a difference: it takes every path
   * to the chain's length, whatever each had stepped. A later `.step()` adds
   * one on every path alike, so a difference it follows is still there.
   */
  const declsOf = new Map()
  const fillsOf = new Map()
  for (const m of code.matchAll(/(?<![.\w$])([\w$]+)\s*=\s*([\w$]+)\s*\(/g)) {
    if (chainMakers.has(m[2])) declsOf.set(m[1], [...(declsOf.get(m[1]) ?? []), m.index])
  }
  for (const m of code.matchAll(CHAIN_OP)) {
    if (m[2] !== 'step') fillsOf.set(m[1], [...(fillsOf.get(m[1]) ?? []), m.index])
  }
  const callsOf = new Map()
  if (callRe) for (const m of code.matchAll(callRe)) callsOf.set(m[1], [...(callsOf.get(m[1]) ?? []), m.index])
  const filledAfter = (rec, after, env) => {
    const next = (declsOf.get(rec.name) ?? []).find((o) => o > rec.at)
    const limit = Math.min(rec.scopeEnd, next ?? Infinity)
    // The other side of an `if` this one is inside comes later in the text
    // and never runs after it.
    const elsewhere = []
    for (let e = env; e; e = e.parent) if (e.otherSide) elsewhere.push(e.otherSide)
    const inRange = (o) => o >= after && o < limit && !elsewhere.some(([a, b]) => o >= a && o < b)
    if ((fillsOf.get(rec.name) ?? []).some(inRange)) return true
    for (const [n, offsets] of callsOf) {
      const f = summaryOf(n)
      const fills = f.straight ? f.outer.some((op) => op.kind === 'fill' && op.name === rec.name) : f.touches.has(rec.name)
      if (fills && offsets.some(inRange)) return true
    }
    return false
  }

  const scope = (parent, { closure = false, end = code.length, summary = null, otherSide = null } = {}) => ({
    vars: new Map(),
    declared: [],
    parent,
    closure,
    end,
    summary,
    otherSide,
  })
  const lookup = (env, name) => {
    let crossed = false
    for (let e = env; e; e = e.parent) {
      if (e.vars.has(name)) return { rec: e.vars.get(name), crossed }
      if (e.closure) crossed = true
    }
    return null
  }
  const summaryRoot = (env) => {
    for (let e = env; e; e = e.parent) if (e.summary) return e.summary
    return null
  }
  const notStraight = (env) => {
    const root = summaryRoot(env)
    if (root) root.straight = false
  }
  // Positions are copied per side; declarations inside a side die with it.
  const snapshot = (env) => {
    const snap = []
    for (let e = env; e; e = e.parent) snap.push(new Map([...e.vars].map(([k, v]) => [k, { ...v }])))
    return snap
  }
  const restore = (env, snap) => {
    let i = 0
    for (let e = env; e; e = e.parent) e.vars = snap[i++]
  }
  const mergeInto = (env, a, b) => {
    let i = 0
    for (let e = env; e; e = e.parent) {
      const merged = new Map()
      for (const [k, v] of a[i]) {
        const w = b[i].get(k)
        merged.set(k, w && w.pos === v.pos ? v : { ...v, pos: '?' })
      }
      e.vars = merged
      i += 1
    }
  }
  const advance = (env, before, after, n) => {
    let i = 0
    for (let e = env; e; e = e.parent) {
      const next = new Map()
      for (const [k, v] of before[i]) {
        const w = after[i].get(k)
        if (!w || w.pos === v.pos) next.set(k, v)
        else if (n !== null && typeof v.pos === 'number' && typeof w.pos === 'number') next.set(k, { ...v, pos: v.pos + n * (w.pos - v.pos) })
        else next.set(k, { ...v, pos: '?' })
      }
      e.vars = next
      i += 1
    }
  }
  /*
   * A scope's own chains, when it closes: what each reported becomes part of
   * the side's outright count. A chain whose position was lost inside is taken
   * at its declared length — the same completion every `.rest()` assumes.
   */
  const fold = (count, inner) =>
    uniq(
      count.map((a) => {
        let r = a
        for (const rec of inner.declared) {
          const v = r.ch[rec.id]
          if (v === undefined) continue
          const ch = { ...r.ch }
          delete ch[rec.id]
          const settledTo = v !== '?' ? v : rec.length ?? null
          r = settledTo === null ? addSym({ ...r, ch }, named(`?chain:${rec.name}`)) : { ...r, ch, k: r.k + settledTo }
        }
        return r
      }),
    )
  const inScope = (env, end, fn, opts = {}) => {
    const inner = scope(env, { end, ...opts })
    return fold(fn(inner), inner)
  }

  /** One chain operation, applied to where the flow has got to. */
  function chainOp(env, kind, name) {
    const hit = lookup(env, name)
    if (!hit) {
      const root = summaryRoot(env)
      if (root) {
        root.outer.push({ kind, name })
        root.touches.add(name)
        return ZEROC()
      }
      // A chain this cannot see declared: a step is still one check.
      return kind === 'step' ? [sym(1)] : [named(`?fill:${name}`)]
    }
    const { rec } = hit
    if (hit.crossed) return [{ k: 0, t: {}, ch: { [rec.id]: '?' } }]
    if (kind === 'step') {
      rec.pos = typeof rec.pos === 'number' ? rec.pos + 1 : '?'
      return [{ k: 0, t: {}, ch: { [rec.id]: 1 } }]
    }
    if (rec.length !== null && typeof rec.pos === 'number') {
      const amount = Math.max(0, rec.length - rec.pos)
      rec.pos = rec.length
      return [{ k: 0, t: {}, ch: { [rec.id]: amount } }]
    }
    rec.pos = rec.length ?? '?'
    return [{ k: 0, t: {}, ch: { [rec.id]: '?' } }]
  }

  /*
   * What a call to one of the suite's own reporting functions reports. Its
   * body is walked once on its own; the checks it reports outright are its
   * count, and what it does to a chain from OUTSIDE — `chainRest = (why) =>
   * unread.rest(why)` — is replayed at each call, where the position is known.
   */
  const summaries = new Map()
  function summaryOf(name) {
    if (summaries.has(name)) return summaries.get(name)
    summaries.set(name, { count: [named(`call:${name}`)], outer: [], touches: new Set(), straight: false })
    const d = defs.get(name)
    const summary = { outer: [], touches: new Set(), straight: true }
    const quiet = { noElse: [], unequal: [], literal: [], onCatch: [], unsettled: [], pairs: 0 }
    const count = inScope(
      null,
      d.body[1],
      (env) => (d.block ? walkList(statements(code, d.body[0], d.body[1]), env, quiet) : effects(d.body[0], d.body[1], env, quiet)),
      { closure: true, summary },
    )
    const result = count.every(settledPhi) ? { count, ...summary } : { count: [named(`call:${name}`)], ...summary }
    summaries.set(name, result)
    return result
  }
  function callOf(env, name) {
    const s = summaryOf(name)
    let count = s.count
    if (s.straight) {
      for (const op of s.outer) count = plusC(count, chainOp(env, op.kind, op.name))
    } else {
      for (const n of s.touches) {
        const hit = lookup(env, n)
        if (hit && !hit.crossed) hit.rec.pos = '?'
        if (hit) count = plusC(count, [{ k: 0, t: {}, ch: { [hit.rec.id]: '?' } }])
      }
    }
    return count
  }

  function effects(s, e, env, sink) {
    let count = ZEROC()
    const lits = literalsOf(s, e)
    const inLit = (at) => lits.some((f) => at >= f.start && at < f.end)
    const decl = /^\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*/.exec(code.slice(s, e))
    for (const f of lits) {
      // Each literal's own branches are findings wherever it is written.
      const body = inScope(
        env,
        f.bodyEnd,
        (inner) => (f.block ? walkList(statements(code, f.bodyStart, f.bodyEnd), inner, sink) : effects(f.bodyStart, f.bodyEnd, inner, sink)),
        { closure: true },
      )
      if (isZeroC(body)) continue
      // `const f = () => …` defines; it runs where it is CALLED.
      if (decl && skipWs(code, s + decl[0].length) === skipWs(code, f.start) && code.slice(s + decl[0].length, f.start).trim() === '') continue
      const callee = calleeOf(code, f.start, s)
      // The skip a chain is made with runs through its `.skipRest`, which is
      // counted where it is called.
      if (callee === 'makeChain') continue
      notStraight(env)
      if (callee === '.catch') sink.onCatch.push({ line: lineOf(f.start), count: showC(body) })
      count = plusC(count, [named(`cb:${callee ?? '?'}(${showC(body)})`)])
    }
    const text = code.slice(s, e)
    const events = []
    for (const m of text.matchAll(reportRe)) events.push({ at: s + m.index, kind: 'report' })
    for (const m of text.matchAll(CHAIN_OP)) events.push({ at: s + m.index, kind: m[2] === 'step' ? 'step' : 'fill', name: m[1] })
    for (const m of text.matchAll(/(?<![.\w$])([\w$]+)\s*=\s*([\w$]+)\s*\(/g)) {
      if (!chainMakers.has(m[2])) continue
      const open = s + m.index + m[0].length - 1
      events.push({ at: s + m.index, kind: 'declare', name: m[1], length: argumentCount(code, open) })
    }
    if (callRe) {
      for (const m of text.matchAll(callRe)) {
        if (!(decl && decl[1] === m[1])) events.push({ at: s + m.index, kind: 'call', name: m[1] })
      }
    }
    events.sort((x, y) => x.at - y.at)
    for (const ev of events) {
      if (inLit(ev.at)) continue
      if (ev.kind === 'report') count = plusC(count, [sym(1)])
      else if (ev.kind === 'declare') {
        const rec = { id: `${ev.name}@${ev.at}`, name: ev.name, at: ev.at, length: ev.length, pos: 0, scopeEnd: env.end }
        env.vars.set(ev.name, rec)
        env.declared.push(rec)
      } else if (ev.kind === 'call') count = plusC(count, callOf(env, ev.name))
      else count = plusC(count, chainOp(env, ev.kind, ev.name))
    }
    return count
  }

  function walkList(list, env, sink) {
    let count = ZEROC()
    for (const s of list) count = plusC(count, walk(s, env, sink))
    return count
  }

  function walk(s, env, sink) {
    if (!s || s.type === 'empty') return ZEROC()
    if (s.type === 'expr') return effects(s.start, s.end, env, sink)
    if (s.type === 'block') return inScope(env, s.end, (inner) => walkList(s.body, inner, sink))
    if (s.type === 'func') {
      inScope(env, s.end, (inner) => walkList(s.body, inner, sink), { closure: true })
      return ZEROC()
    }
    notStraight(env)
    if (s.type === 'try') {
      let count = walk(s.block, env, sink)
      if (s.handler) {
        const before = snapshot(env)
        walk(s.handler, env, sink)
        restore(env, before)
      }
      if (s.finalizer) count = plusC(count, walk(s.finalizer, env, sink))
      return count
    }
    if (s.type === 'loop') {
      const bound = literalBound(code, s.head)
      const before = snapshot(env)
      const body = inScope(env, s.end, (inner) => walk(s.body, inner, sink))
      const after = snapshot(env)
      restore(env, before)
      const exits = exitsLoop(code, s.body)
      if (bound?.numeric && !isZeroC(body)) sink.literal.push({ line: lineOf(s.start), n: bound.n, count: showC(body) })
      // A chain stepped inside the loop moves by the bound times what one pass
      // moved it — when the bound is literal and nothing leaves early.
      advance(env, before, after, bound && !exits ? bound.n : null)
      if (isZeroC(body)) return ZEROC()
      if (bound && !exits) return uniq(body.map((a) => timesSym(a, bound.n)))
      const head = code.slice(s.head[0], s.head[1]).replace(/\s+/g, ' ').trim()
      return uniq(
        body.map((a) => ({
          k: 0,
          t: phiKey(a) === '0' ? {} : { [`loop(${head})×(${phiKey(a)})`]: 1 },
          ch: Object.fromEntries(Object.keys(a.ch).map((id) => [id, '?'])),
        })),
      )
    }
    // `if`, with or without an `else`.
    const cond = effects(s.cond[0], s.cond[1], env, sink)
    const start = snapshot(env)
    const A = inScope(env, s.cons.end, (inner) => walk(s.cons, inner, sink), { otherSide: s.alt ? [s.alt.start, s.alt.end] : null })
    const endA = snapshot(env)
    restore(env, start)
    const B = s.alt ? inScope(env, s.alt.end, (inner) => walk(s.alt, inner, sink)) : ZEROC()
    const endB = snapshot(env)
    mergeInto(env, endA, endB)
    const line = lineOf(s.start)
    const report = (why) => {
      if (s.alt) sink.unequal.push({ line, elseLine: lineOf(s.elseAt), a: showC(A), b: showC(B), why })
      else sink.noElse.push({ line, count: showC(A), why })
    }
    if (!(isZeroC(A) && isZeroC(B))) sink.pairs += s.alt ? 1 : 0
    if (sink.trace && !(isZeroC(A) && isZeroC(B))) sink.trace.push(`${line}: ${showC(A)}  ·  ${s.alt ? `${showC(B)} (else ${lineOf(s.elseAt)})` : '(no else)'}`)
    const samePositions = start.every((level, i) => [...level.keys()].every((k) => endA[i].get(k)?.pos === endB[i].get(k)?.pos))
    if (sameSet(A, B) && samePositions) return plusC(cond, A)
    /*
     * The chains from outside that the two sides leave in different places,
     * and which of those are MADE UP: a `.rest()` that can run after this `if`
     * takes each side to the chain's length, so what either stepped here is
     * left out of the comparison — and so is a chain one side filled from a
     * place nothing can know, where only that completion can be assumed. Every
     * other chain counts exactly as stepped: a step is one check wherever the
     * chain had got to.
     */
    const behind = []
    const madeUp = new Set()
    start.forEach((level, i) => {
      for (const [k, rec] of level) {
        const a = endA[i].get(k)?.pos
        const b = endB[i].get(k)?.pos
        if (a === b && typeof a === 'number') continue
        const unknownAmount = [...A, ...B].some((x) => x.ch[rec.id] === '?')
        if (unknownAmount || filledAfter(rec, s.end, env)) madeUp.add(rec.id)
        else if (typeof a === 'number' && typeof b === 'number') {
          behind.push(`${k} ends at ${Math.min(a, b)} of ${rec.length ?? '?'} on one side and nothing after fills it`)
        }
      }
    })
    const view = (x) => {
      const r = { k: x.k, t: { ...x.t }, ch: {} }
      for (const [id, v] of Object.entries(x.ch)) {
        if (madeUp.has(id)) continue
        if (v === '?') r.t[`?fill:${id.split('@')[0]}`] = (r.t[`?fill:${id.split('@')[0]}`] ?? 0) + 1
        else r.k += v
      }
      return r
    }
    const VA = [...new Set(A.map((a) => phiKey(view(a))))]
    const VB = [...new Set(B.map((b) => phiKey(view(b))))]
    if (VA.length === 1 && VB.length === 1 && VA[0] === VB[0]) {
      const ch = {}
      for (const id of madeUp) {
        const vals = new Set([...A, ...B].map((x) => x.ch[id] ?? 0))
        ch[id] = vals.size === 1 ? [...vals][0] : '?'
      }
      return plusC(cond, [{ ...view(A[0]), ch }])
    }
    const overlap = VA.some((p) => VB.includes(p))
    if (!overlap) {
      if ([...A, ...B].map(view).every(settledPhi)) report(behind.length ? behind.join('; ') : null)
      else sink.unsettled.push({ line, a: showC(A), b: showC(B) })
    }
    return plusC(cond, uniq([...A, ...B]))
  }

  walkList(top, scope(null), found)
  return found
}

/*
 * HOW MANY SUITES WERE ACTUALLY READ, because every verdict below is a zero.
 *
 * `SUITES` resolving to an empty or wrong directory gives no findings at all,
 * and this would print "0 conditional check block(s) with no else, in 0
 * suite(s)" and exit 0 — the same shape `check-no-break-patches.mjs` was found
 * in, where relative roots meant a clean verdict over nothing.
 *
 * So the count is asserted and then PRINTED, so the zero carries its
 * denominator: "0 … in 0 of 242 suite(s) read" is a claim, and "0" on its own
 * is not. The floor is a floor rather than an equality because suites are
 * still being added.
 */
// A fixture directory holds a handful of files on purpose, so the denominator
// floor applies to the REAL scan only. `check-branches-cases.mjs` asserts that
// the floor still fires when it should.
const MIN_SUITES = Number(process.env.BRANCHES_MIN_SUITES ?? (process.env.SUITE_DIR ? 1 : 100))
const suiteList = readdirSync(SUITES).filter((f) => f.endsWith('.mjs')).sort()
if (suiteList.length < MIN_SUITES) {
  console.error(
    `\n[check-branches] only ${suiteList.length} suite(s) were found under ${SUITES}, below the ` +
      `floor of ${MIN_SUITES}.\nEvery verdict in this file is a zero, so a scan that reads nothing ` +
      'passes — the zero has to have a\ndenominator. Point this at the suites rather than lowering ' +
      'the floor to meet an empty scan.',
  )
  process.exitCode = 1
  fatal = true
}

const rows = { noElse: [], unequal: [], literal: [], onCatch: [], unsettled: [] }
const unreadable = []
let pairs = 0
for (const file of suiteList) {
  const res = analyse(readFileSync(join(SUITES, file), 'utf8'))
  if (res.unreadable) {
    unreadable.push([file, res.unreadable])
    continue
  }
  pairs += res.pairs
  if (process.env.BRANCHES_TRACE === file) {
    console.log(`[check-branches] every branch pair in ${file} with a check on either side — the if's count · the else's:`)
    for (const t of res.trace) console.log(`  ${t}`)
  }
  for (const key of Object.keys(rows)) if (res[key].length) rows[key].push([file, res[key]])
}
const sum = (key) => rows[key].reduce((n, [, hits]) => n + hits.length, 0)
const total = { noElse: sum('noElse'), unequal: sum('unequal'), literal: sum('literal'), onCatch: sum('onCatch') }

console.log(
  `[check-branches] ${total.noElse} conditional check block(s) with no else, in ${rows.noElse.length} of ` +
    `${suiteList.length} suite(s) read.`,
)
console.log(
  `[check-branches] ${total.unequal} of ${pairs} if/else pair(s) report different numbers of checks on ` +
    `their two sides, in ${rows.unequal.length} suite(s).`,
)
console.log(`[check-branches] ${total.literal} loop(s) report a literal count of checks, in ${rows.literal.length} suite(s).`)
console.log(
  `[check-branches] ${total.onCatch} check(s) are reported from a .catch callback, which runs only when the ` +
    `call fails, in ${rows.onCatch.length} suite(s).`,
)
console.log('                 Counted per branch: chk, check, ok, bad and skip (where the suite defines')
console.log('                 them to report) and a chain\'s .step are one check each; .rest and .skipRest')
console.log('                 fill the chain to its declared length. A heuristic over code with comments')
console.log('                 and strings blanked: it finds the SHAPE, not whether the condition is ever')
console.log('                 false. Read each one before changing it.')
for (const [file, hits] of rows.noElse) {
  for (const h of hits) console.log(`  no else    ${file}:${h.line}  reports ${h.count} only when it is taken${h.why ? `, and ${h.why}` : ''}`)
}
for (const [file, hits] of rows.unequal) {
  for (const h of hits) {
    console.log(`  unequal    ${file}:${h.line}  if reports ${h.a} · else (line ${h.elseLine}) reports ${h.b}${h.why ? `, and ${h.why}` : ''}`)
  }
}
for (const [file, hits] of rows.literal) {
  for (const h of hits) console.log(`  literal    ${file}:${h.line}  a loop of ${h.n} reporting ${h.count} each — a re-typed count`)
}
for (const [file, hits] of rows.onCatch) {
  for (const h of hits) console.log(`  on catch   ${file}:${h.line}  reports ${h.count} only when the call before it fails`)
}
const unsettledCount = rows.unsettled.reduce((n, [, hits]) => n + hits.length, 0)
if (unsettledCount) {
  console.log(`\n  ${unsettledCount} if/else pair(s) it could not settle — neither counted as a finding nor as balanced:`)
  for (const [file, hits] of rows.unsettled) {
    for (const h of hits) console.log(`  unsettled  ${file}:${h.line}  ${h.a}  ·  ${h.b}`)
  }
}

/*
 * A FILE IT CANNOT READ IS NOT A FILE WITH NOTHING IN IT. When the masked
 * code's brackets do not balance, the mask went wrong somewhere — a regex it
 * read as division, a string it did not close — and every count after that
 * point would be about the wrong text. Refused by name rather than skipped.
 */
if (unreadable.length) {
  console.error(
    `\n[check-branches] ${unreadable.length} suite(s) could not be read — the brackets of their code do ` +
      'not balance once comments and strings are blanked, so nothing in them was counted:',
  )
  for (const [f, line] of unreadable) console.error(`    ${f} (near line ${line})`)
  process.exitCode = 1
  fatal = true
}

/*
 * THE RATCHET. Lower it as branches are balanced; never raise it to pass.
 *
 * 55 when this was written, across the ten suites whose branches nobody had
 * ever exercised — which is very nearly the same list as the eleven suites the
 * coverage checker could not see, and for the same reason. A suite with no
 * break patch is a suite whose conditions have never been made false.
 *
 * Those 55 were balanced: `video1-fast-items` (fifteen), `syncup-live` (ten),
 * `video-regression` (nine), `ui-sweep` (seven), `panel-collapse` (six),
 * `task-depth` (four), `addressability-live` (four), `person-panel` (two), and
 * one each in `emoji-picker`, `loading-states` and `stale-chunk-recovery`. The
 * rule then read "0" over every suite and this paragraph said it was ZERO
 * across all 113 — and it was not. The rule asked only whether an `else`
 * EXISTED. It matched `chk(` and `check(` and nothing else, so an `if` that
 * reported nine checks against an `else` that reported `bad()` eight times in
 * a loop passed, and so did a chain of four against one `bad()`, and three
 * checks against a `console.log('SKIP …')` that counted nothing. A confident
 * zero, from a rule that could not see the shape it was named for.
 *
 * COUNTED, 29 September, the first time it could: 23 findings in 11 of 242
 * suites, where the old rule said 0 of 242. Nineteen if/else pairs whose sides
 * report different numbers (of 126 compared) — 9 against 8, 12 against one
 * `bad()`, 3 against a `console.log('SKIP …')`, a hand-rolled chain whose
 * `while` loop no count can follow — three loops that re-type a count, and one
 * `bad()` inside a `.catch`. None was an `if` with no `else`: the old rule's
 * own shape really was at zero, and was never the whole of it. Every one was
 * balanced in its suite, each changed suite was re-run on a lane at its own
 * EXPECTED_CHECKS, and the tree reads 0 over 124 pairs.
 *
 * The last of those 55 found a check whose SENTENCE was a statement about the
 * fixture: `ui-sweep`'s "two members with unambiguous
 * names to drive the cycle with" failed when the workspace could not supply a
 * pair, naming nothing in the product and leaving the run a check shorter than
 * the path beside it. A reason belongs in the detail, not in the claim. The
 * fix is `test/e2e/lib/chain.mjs` — `step` for the next check, `rest` to report
 * the remainder as failed with the reason, and `skipRest` for a gate on the
 * machine rather than on the product, which is the narrow case where the
 * honest answer is "unknown" rather than "broken".
 *
 * AND A HEURISTIC THAT CANNOT SEE A FIX KEEPS REPORTING ONE. `loading-states`
 * balanced its panel loop with an early `continue` rather than an `else` — the
 * branches really did report two checks either way — and this kept flagging it,
 * because it matches the SHAPE. The cheapest honest answer is to write the shape
 * the checker can read; the alternative is a permanent known-false entry in a
 * list whose whole value is that every line in it is worth reading.
 *
 * EVERY BALANCED SUITE WAS RE-RUN AND ITS COUNT HELD, then and again now. Then:
 * `video1-fast-items` 92 of 92, `task-depth` 91, `panel-collapse` 56,
 * `ui-sweep` 107 — the point of the fix is that the happy path reports the
 * same number it always did, and a refactor that quietly changed it would be
 * the defect this whole sweep is about. `syncup-live` moved, 48 → 59, because
 * a floor became an exact count with skips included. Now `task-depth` moved,
 * 91 → 92, because its inline-list check ran only on a project that happened
 * to have no list — never, on the seeded data — and now runs on one made for
 * it. Keep this paragraph in step with the constant.
 */
/*
 * AND THE SAME FAMILY, ONE LEVEL WORSE: A SUITE THAT CANNOT REPORT A FAILURE.
 *
 * Everything above is about a run that reports the WRONG NUMBER of checks.
 * `planner-onboarding` reported none at all — `try { … } finally { … }` with no
 * catch, so `po-1-panel-never-shows` left the process on an uncaught
 * TimeoutError before the totals line and before the `EXPECTED_CHECKS` guard.
 * `wt-break.sh` recorded `NO SUMMARY: … it died before the totals`, which is
 * the one outcome that says nothing whatsoever about a patch.
 *
 * Three of the 113 were in that state — `planner-onboarding`,
 * `planner-command-bar`, `team-schedules` — and all three were in a running
 * plan at the time. A suite with a top-level `try` must have a `catch` that
 * records the throw, so the totals and the guard always print.
 *
 * TEXT, LIKE THE REST OF THIS FILE: it asks whether a top-level `try` has a
 * top-level `catch`, not whether the catch does anything sensible.
 */
const noCatch = []
for (const f of suiteList) {
  const src = readFileSync(join(SUITES, f), 'utf8')
  if (/^try \{/m.test(src) && !/^\} catch\b/m.test(src)) noCatch.push(f.slice(0, -4))
}
if (noCatch.length) {
  console.error(
    `\n[check-branches] ${noCatch.length} suite(s) have a top-level \`try\` and no \`catch\`, so a ` +
      'throw ends the process before the totals and the EXPECTED_CHECKS guard — the one outcome ' +
      'that says nothing about a patch at all:',
  )
  for (const n of noCatch) console.error(`    ${n}`)
  process.exitCode = 1
  fatal = true
}

/*
 * AND THE GUARD THAT EVERY RULE IN THIS FILE RESTS ON.
 *
 * Everything above is about a run's LENGTH being honest, and the reason length
 * matters at all is one line each suite carries:
 *
 *     if (results.length !== EXPECTED_CHECKS) { … }
 *
 * That `!==` is what turns a short run into a reported failure instead of a
 * `0 failed` nobody questions. It is the single assumption the whole sweep
 * stands on — "0 failed is not it ran" — and NOTHING WAS CHECKING IT. A suite
 * added without the constant, or with the comparison written `<` because a
 * skip was expected, would report a truncated run as a clean one and every
 * patch measured against it would be credited for checks that never ran.
 *
 * Measured 22 September: all 113 declare it and all 113 compare with `!==`.
 * This is a gate rather than a ratchet, because unlike the heuristic above,
 * the presence of a constant and the operator beside it are not a guess about
 * text — they are the text.
 *
 * `>=` and `<` are called out separately from a missing constant because they
 * are the plausible mistake: a suite with a conditional skip reaches for a
 * range comparison, and that is exactly the suite whose length cannot be
 * trusted.
 */
const noGuard = []
for (const file of suiteList) {
  const src = readFileSync(join(SUITES, file), 'utf8')
  const name = file.slice(0, -4)
  if (!/^const EXPECTED_CHECKS = \d+/m.test(src)) {
    noGuard.push([name, 'declares no EXPECTED_CHECKS at all'])
    continue
  }
  const ops = [
    ...src.matchAll(/\w+(?:\.length)?\s*(!==|===|<=|>=|<|>)\s*EXPECTED_CHECKS|EXPECTED_CHECKS\s*(!==|===|<=|>=|<|>)/g),
  ].map((m) => m[1] ?? m[2])
  if (!ops.length) noGuard.push([name, 'declares EXPECTED_CHECKS and never compares it'])
  else if (!ops.includes('!==')) noGuard.push([name, `compares it with ${[...new Set(ops)].join(', ')} — not \`!==\``])
}
if (noGuard.length) {
  console.error(
    `\n[check-branches] ${noGuard.length} suite(s) cannot report a short run, which is the one ` +
      'thing every number\nin this audit depends on:',
  )
  for (const [n, why] of noGuard) console.error(`    ${n} — ${why}`)
  console.error(
    '\n  A run that stops early prints `0 failed` for the checks it never reached, and the break\n' +
      '  harness credits the patch with every one of them. `EXPECTED_CHECKS` compared with `!==` is\n' +
      '  what makes that a reported failure instead. Exact, not a range: a skip that should count\n' +
      '  towards the total belongs in the total (see `skipRest`), not in a loosened comparison.',
  )
  process.exitCode = 1
  fatal = true
}

/*
 * `BRANCHES_MAX` is set by `check-branches-cases.mjs` and by nothing else, the
 * same seam `SUITE_DIR` is. Without it a fixture cannot exercise the ratchet
 * at all: every fixture with a finding is above a baseline of 0, so "at the
 * ratchet" and "above it" would be the same case. It holds the four findings
 * together: a branch balanced by moving its imbalance into a literal loop or a
 * `.catch` has not been balanced.
 */
const findings = total.noElse + total.unequal + total.literal + total.onCatch
const BASELINE = process.env.BRANCHES_MAX ? Number(process.env.BRANCHES_MAX) : 0
if (findings > BASELINE) {
  console.error(`\n[check-branches] WORSE: ${BASELINE} → ${findings}.`)
  console.error('  A conditional check makes the run length conditional, and EXPECTED_CHECKS is')
  console.error('  compared with !==. Give the `if` an `else` that reports the same checks — failed,')
  console.error('  with the reason — rather than raising this number. `makeChain(check).rest(why)`')
  console.error('  fills a chain to its declared length, so neither side re-types a count.')
  process.exitCode = 1
  fatal = true
}
if (findings < BASELINE) {
  console.log(`\n[check-branches] better — lower the baseline in this file to ${findings}`)
}
// Never an unconditional 0: the refusals above set the code, and this line
// used to be reached only because each of them called `process.exit`.
process.exitCode = fatal ? 1 : 0
