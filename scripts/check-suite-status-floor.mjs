#!/usr/bin/env node
/*
 * A STATUS THAT CAN BE 0 IS NEVER READ AS SUCCESS BY AN UPPER BOUND ALONE
 * (`found-30-sep/status-zero-passes-status-only-checks`).
 *
 * `lib/fixture.mjs`'s one client answers `{ status: 0, ok: false, … }` when
 * nothing answers — the API is down, restarted under the run, the connection
 * dropped — unless the suite binds it with `noAnswer: 'throw'`
 * (`suite-hygiene/apiAs-duplicated-62`). And `0 < 300`. So in a suite bound the
 * default way,
 *
 *     chk(healed.status < 300, 'and the platform’s Forms switch is back on …')
 *
 * says the switch was put back when nothing answered the PUT, and
 *
 *     if (gate.status < 400) throw new Error('the member could open the hidden blocker …')
 *
 * says "the member could open the hidden blocker" about a dead API. A hand-made
 * answer does the same in any suite: `x ? await A(…) : { status: 0 }` stands in
 * for a step that was never taken, and `ai-value` turned a put-back that threw
 * into `{ status: 0 }` and then passed "the workspace's own benchmark is put
 * back" on it.
 *
 * MEASURED FIRST, 30 September, at 8c1b727: 389 status comparisons with an
 * upper bound in the suites' code. In the 112 suites bound the default way, 168
 * had no lower bound, in 61 suites: 162 in a check's condition, 4 in a guard
 * that throws, 1 in a helper a check calls, 1 in an `if`. And 26 more, in 12
 * suites bound to throw, read a name that can hold a hand-made `status: 0` or a
 * helper's: 194 in 73 suites, each rewritten (none exempt).
 *
 * THE RULE. A STATUS — `x.status`, a bare `status`, or a name ending in
 * `Status` (not one bound to a page response's `.status()`, which is never 0) —
 * compared with an UPPER BOUND ALONE (`< N`, `<= N`, `N > …`, `N >= …`) is
 * refused where it CAN BE 0:
 *
 *   ZERO-CLIENT   the suite binds the fixture's client without
 *                 `noAnswer: 'throw'` (`apiAsAt(API)`, `apiAsAt(API, {
 *                 emptyBodyOn … })`), so any answer in it can be 0;
 *   PLACEHOLDER   in any suite, the name it is read from is bound to a value
 *                 holding a hand-made `status: 0` (`: { status: 0 }`,
 *                 `.catch(() => ({ status: 0 }))`, an assignment in a catch);
 *   ZERO-HELPER   or to a call of a function in the suite whose body hands one
 *                 back (`file-exports`' `download`).
 *
 * WHERE: EVERY COMPARISON IN CODE, not only a check's condition. The ledger's
 * own examples are guards; `ai-task-reads` decides a check through a helper;
 * and following a value from a helper, a variable or a `waitUntil` into a
 * check is a parser's job (`check-suite-text-reads` says why). A check's
 * MESSAGE decides nothing and is not read.
 *
 * A LOWER BOUND is another conjunct of the same `&&` chain, grouping
 * parentheses stepped through: the same status `>= N`, `> N`, `!== 0`, tested
 * for truth (`x.status && …`), or the same answer's `ok`. A floor across an
 * `||`, a ternary or another statement does not count.
 *
 * THE FIX, per condition: `x.ok` (2xx), which is what `status < 300` meant, where
 * it means "it worked" — the client's answer and a fetch `Response` both have it,
 * and a hand-made `{ status: 0 }` does not; `must(res, what)` where what follows
 * cannot do without it; a floor (`>= 200 &&`) on a bare number; or the binding
 * `noAnswer: 'throw'`. A refusal is `>= 400` or its status, which a 0 fails.
 *
 * EXEMPT, by `// status-floor: <reason>` at the end of the comparison's own
 * line, the reason one of `not-a-client` (the status is a page response's or
 * another that cannot be 0, which the gate cannot tell) or `zero-fails` (a 0
 * makes the condition false where it stands: under a `!`, or counted among
 * answers that must all be refusals). Never inside a check's arguments — the
 * other gates split those on text and a comment moves the split — so a
 * comparison that needs one is hoisted into a variable first. An unknown
 * reason, or a marker that exempts nothing on its line, is a failure.
 *
 * READ AS JAVASCRIPT, NOT AS LINES: comments, strings, regex literals and
 * template text are blanked before anything is matched (`lex`, copied from
 * `check-suite-api-clients`, which runs when imported). The binding's options
 * are read from the source, since `'throw'` is a string. A suite that does not
 * lex to a clean end is reported, not guessed at.
 *
 * A GATE THAT READ NOTHING ANSWERS ok AS SURELY AS ONE THAT READ EVERYTHING:
 * fewer than 100 suites read is a failure (1 under `SUITE_DIR`).
 *
 * `--mutate` plants suites in a temp directory — the dependency-read-access
 * guard and `flag-resolution`'s restore among them — requires every shape above
 * to be caught and `ok`, a floor, a `noAnswer: 'throw'` binding and a page
 * response to pass, then breaks this file one rule at a time and requires a
 * planted case to notice (`lib/mutate.mjs`).
 *
 *   node scripts/check-suite-status-floor.mjs [--mutate]
 *   SUITE_DIR=<dir> node scripts/check-suite-status-floor.mjs
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
const REASONS = ['not-a-client', 'zero-fails']
const MARKER = /\/\/\s*status-floor:\s*([\w-]*)/g
const CHECKS = /(?<![.\w$])(?:chk|check)\s*\(|\.\s*step\s*\(/g
const KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'await', 'yield'])
/** What a statement can start with that is not part of the condition after it. */
const LEADERS = /^(?:(?:return|throw|yield|case|else|do|await|void)\b\s*)+/
/** A hand-made answer's status of 0: `status: 0`, as code (a string saying so is blanked). */
const ZERO = /(?<![\w$.])status\s*:\s*0(?![\w.])/

/*
 * `src` with comments, string and regex contents and template text blanked,
 * exactly as long, so an index means the same place in both. `clean` says
 * whether the walk ended outside every string and comment; `regexEnds` holds
 * where each regex literal closes; `comments` where each `//` comment starts,
 * so a marker in a string is told from one in a comment.
 */
export function lex(src) {
  const code = src.split('')
  // Newlines survive in comments and strings, so a line is still a line; in
  // template text they go too, so a wrapped sentence does not end a statement.
  const blank = (i, keepNewline = true) => {
    if (i < code.length && !(keepNewline && code[i] === '\n')) code[i] = ' '
  }
  const regexEnds = new Set()
  const comments = new Set()
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
        if (n === '/') comments.add(i)
        blank(i), blank(i + 1)
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
      else blank(i)
    } else if (mode === 'block') {
      blank(i)
      if (c === '*' && n === '/') {
        blank(i + 1)
        i += 1
        mode = 'code'
      }
    } else if (mode === 'string') {
      if (c === '\\') {
        blank(i), blank(i + 1)
        i += 1
      } else if (c === quote || c === '\n') {
        mode = 'code'
        if (c === quote) prev = c
        word = ''
      } else blank(i)
    } else if (mode === 'template') {
      if (c === '\\') {
        blank(i, false), blank(i + 1, false)
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
      } else blank(i, false)
    } else if (mode === 'regex') {
      if (c === '\\') {
        blank(i), blank(i + 1)
        i += 1
      } else if (c === '\n') mode = 'code'
      else if (inClass) {
        if (c === ']') inClass = false
        blank(i)
      } else if (c === '[') {
        inClass = true
        blank(i)
      } else if (c === '/') {
        mode = 'code'
        regexEnds.add(i)
        prev = ')' // a regex literal is a value: a `/` after it divides
        word = ''
      } else blank(i)
    }
  }
  return { code: code.join(''), clean: mode === 'code' && frames.length === 0, regexEnds, comments }
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
const isWord = (c) => c !== undefined && /[\w$]/.test(c)
const skipFwd = (code, i) => {
  for (; i < code.length && /\s/.test(code[i]); i++);
  return i
}
const skipBack = (code, i) => {
  for (; i >= 0 && /\s/.test(code[i]); i--);
  return i
}
const wordBefore = (code, end) => {
  let k = end
  while (k >= 0 && isWord(code[k])) k--
  return { word: code.slice(k + 1, end + 1), at: k + 1 }
}
const trimmed = (code, a, b) => {
  while (a < b && /\s/.test(code[a])) a++
  while (b > a && /\s/.test(code[b - 1])) b--
  return [a, b]
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
/** Spaces out, `?.` read as `.`: the same operand however it is written. */
const norm = (s) => s.replace(/\s+/g, '').replace(/\?\./g, '.')

/*
 * Where an expression that starts at `from` ends: a `,` or `;` outside every
 * bracket it opened, a closing bracket it did not open, or a newline nothing
 * carries on over (copied from `check-suite-api-clients`).
 */
const exprEnd = (code, from, regexEnds) => {
  let d = 0
  let last = ''
  for (let k = from; k < code.length; k++) {
    const c = code[k]
    if (c === '\n' && d === 0 && last) {
      const next = code[skipFwd(code, k + 1)] ?? ''
      if (!/[=(\[{,?:&|+\-*/.<>!]/.test(last) && !/[.?:&|+*,=]/.test(next)) return k
      continue
    }
    if (/\s/.test(c)) continue
    if ('([{'.includes(c)) d += 1
    else if (')]}'.includes(c)) {
      if (d === 0) return k
      d -= 1
    } else if ((c === ';' || c === ',') && d === 0) return k
    last = regexEnds.has(k) ? 'x' : c
  }
  return code.length
}

/** Every function in `code`: its name when it has one, where its body starts and ends (from `check-suite-api-clients`). */
function functionsIn(code, regexEnds) {
  const fns = []
  for (const m of code.matchAll(/(?<![\w$.])(?:async\s+)?function\b\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(/g)) {
    const close = matchForward(code, m.index + m[0].length - 1)
    const b = close < 0 ? -1 : skipFwd(code, close + 1)
    const end = code[b] === '{' ? matchForward(code, b) : -1
    if (end > 0) fns.push({ start: m.index, name: m[1] ?? null, bodyStart: b, end: end + 1 })
  }
  for (const m of code.matchAll(/=>/g)) {
    const j = skipBack(code, m.index - 1)
    let start
    if (code[j] === ')') start = matchBack(code, j)
    else if (isWord(code[j])) start = wordBefore(code, j).at
    else continue
    if (start < 0) continue
    const before = wordBefore(code, skipBack(code, start - 1))
    const b = skipFwd(code, m.index + 2)
    const end = code[b] === '{' ? matchForward(code, b) + 1 : trimmed(code, b, exprEnd(code, b, regexEnds))[1]
    if (end > b) fns.push({ start: before.word === 'async' ? before.at : start, name: null, bodyStart: b, end })
  }
  return fns
}

/** Whether the `(` at `i` groups (`(a && b)`, `!(x)`, `return (x)`) rather than calls or heads a statement (`f(`, `if (`). */
const isGroup = (code, i) => {
  const p = skipBack(code, i - 1)
  if (p < 0) return true
  if (!/[\w$)\]`]/.test(code[p])) return true
  return KEYWORDS.has(wordBefore(code, p).word)
}

/*
 * THE SEGMENT AROUND `at` between `lo` and `hi` (a bracket's inside, or the
 * file): the stretch at that bracket's own level bounded by `,` `;` `||` `??`,
 * a ternary's `?` or `:`, `=>`, an assignment, or a line nothing carries on over.
 */
function segmentAround(code, lo, hi, at) {
  let a = lo
  let b = hi
  let last = ''
  for (let k = lo; k < hi; k++) {
    const c = code[k]
    // A bracket is one term, whatever is inside it.
    if ('([{'.includes(c)) {
      const e = matchForward(code, k)
      if (e < 0 || e >= hi) break
      k = e
      last = ')'
      continue
    }
    let cut = 0
    if (c === '\n') {
      if (last && !/[=(\[{,?:&|+\-*/.<>!]/.test(last) && !/[.?:&|+*,=]/.test(code[skipFwd(code, k + 1)] ?? '')) cut = 1
    } else if (c === ',' || c === ';' || c === ':') cut = 1
    else if ((c === '|' && code[k + 1] === '|') || (c === '?' && code[k + 1] === '?')) cut = 2
    else if (c === '?' && code[k + 1] !== '.') cut = 1
    else if (c === '=' && code[k + 1] === '>') cut = 2
    else if (c === '=' && code[k + 1] !== '=' && !'=!<>'.includes(code[k - 1])) cut = 1
    if (cut) {
      if (k + cut <= at) a = k + cut
      else if (k >= at) {
        b = k
        break
      }
      k += cut - 1
      last = ''
      continue
    }
    if (!/\s/.test(c)) last = c
  }
  return trimmed(code, a, b)
}

/** The innermost bracket open before `at` and still open there, or -1 at the top level. */
const enclosingOpen = (code, at) => {
  for (let k = at - 1; k >= 0; k--) {
    if (')]}'.includes(code[k])) {
      const o = matchBack(code, k)
      if (o < 0) return -1
      k = o
    } else if ('([{'.includes(code[k])) return k
  }
  return -1
}

/*
 * THE CONJUNCTION AROUND `at`, as its conjuncts: the segment holding it, widened
 * through any grouping parenthesis that is the whole of its segment, then split
 * on `&&` — and a conjunct that is itself a group of `&&`s split in its turn.
 */
function conjunctsAround(code, at) {
  let open = enclosingOpen(code, at)
  let [a, b] = segmentAround(code, open + 1, open < 0 ? code.length : matchForward(code, open), at)
  for (;;) {
    if (open < 0 || code[open] !== '(' || !isGroup(code, open)) break
    const close = matchForward(code, open)
    const [ia, ib] = trimmed(code, open + 1, close)
    if (ia !== a || ib !== b) break
    const outer = enclosingOpen(code, open)
    ;[a, b] = segmentAround(code, outer + 1, outer < 0 ? code.length : matchForward(code, outer), open)
    open = outer
  }
  const leaves = []
  const split = (x, y) => {
    let d = 0
    let s = x
    const parts = []
    for (let k = x; k < y; k++) {
      if ('([{'.includes(code[k])) d += 1
      else if (')]}'.includes(code[k])) d -= 1
      else if (d === 0 && code[k] === '&' && code[k + 1] === '&') {
        parts.push([s, k])
        s = k + 2
        k += 1
      }
    }
    parts.push([s, y])
    for (const [p, q] of parts) {
      const [ta, tb] = trimmed(code, p, q)
      const lead = LEADERS.exec(code.slice(ta, tb))
      const from = lead ? ta + lead[0].length : ta
      // A conjunct that is one group of `&&`s is split in its turn.
      if (code[from] === '(' && matchForward(code, from) === tb - 1 && isGroup(code, from)) {
        const [ga, gb] = trimmed(code, from + 1, tb - 1)
        const [sa, sb] = segmentAround(code, ga, gb, ga)
        if (sa === ga && sb === gb) {
          split(ga, gb)
          continue
        }
      }
      leaves.push([from, tb])
    }
  }
  split(a, b)
  return leaves
}

/** Every status in one suite compared with an upper bound alone where it can be 0, and every marker. */
export function floorlessIn(src) {
  const { code, clean, regexEnds, comments } = lex(src)
  const newlines = []
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') newlines.push(i)
  const lineOf = (i) => {
    let lo = 0
    let hi = newlines.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (newlines[mid] < i) lo = mid + 1
      else hi = mid
    }
    return lo + 1
  }

  /*
   * ZERO-CLIENT: the fixture's `apiAs`, under the name the suite imports it by,
   * called without `noAnswer: 'throw'`. The options are read from the source:
   * `'throw'` is a string, and the lexed code has it blanked.
   */
  const local = new Set()
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]\.\/lib\/fixture\.mjs['"]/g)) {
    if (code[m.index] !== 'i') continue // an import in a comment or a string is not one
    for (const spec of m[1].split(',')) {
      const s = /^\s*apiAs(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(spec)
      if (s) local.add(s[1] ?? 'apiAs')
    }
  }
  let zeroClient = false
  for (const name of local) {
    for (const m of code.matchAll(new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}\\s*\\(`, 'g'))) {
      const open = m.index + m[0].length - 1
      const close = matchForward(code, open)
      if (close < 0) continue
      const options = argSpans(code, open, close)[1]
      if (!options || !/noAnswer\s*:\s*['"]throw['"]/.test(src.slice(...options))) zeroClient = true
    }
  }

  /* WHAT EACH NAME IS BOUND TO: every declarator, every later `name = …`, every object key `name: …`. */
  const bindings = new Map()
  const bind = (name, from) => {
    const [a, b] = trimmed(code, from, exprEnd(code, from, regexEnds))
    if (!bindings.has(name)) bindings.set(name, [])
    bindings.get(name).push({ a, b })
  }
  for (const m of code.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*=(?![=>])/g)) bind(m[1], m.index + m[0].length)
  for (const m of code.matchAll(/(?<![\w$])([A-Za-z_$][\w$]*)\s*:(?!:)/g)) {
    const before = skipBack(code, m.index - 1)
    if (code[before] === '{' || code[before] === ',') bind(m[1], m.index + m[0].length)
  }
  const fns = functionsIn(code, regexEnds)
  /** ZERO-HELPER: functions whose body hands back a hand-made status of 0, by name. */
  const zeroFns = new Set()
  for (const f of fns) {
    if (!ZERO.test(code.slice(f.bodyStart, f.end))) continue
    if (f.name) zeroFns.add(f.name)
    for (const [name, vals] of bindings) if (vals.some((v) => v.a === f.start)) zeroFns.add(name)
  }
  /** Why the name at the root of an operand can hold a 0, or null. */
  const zeroRoot = (root) => {
    for (const v of bindings.get(root) ?? []) {
      const text = code.slice(v.a, v.b)
      if (ZERO.test(text)) return 'PLACEHOLDER'
      const call = /^(?:await\s+)?([A-Za-z_$][\w$]*)\s*\(/.exec(text)
      if (call && zeroFns.has(call[1])) return 'ZERO-HELPER'
    }
    return null
  }
  /*
   * A STATUS COPIED INTO A FIELD OF ANOTHER NAME (`found-30-sep/status-floor-blind-to-other-names`).
   * `time-tracking-readers`' `track()` returned `{ stop: stop.status, … }`, and its
   * check compared `g.stop < 300`: a status, under a name this knew nothing of,
   * where `stop` was a hand-made `{ status: 0 }` when nothing was started. So a
   * property written from an answer's `.status` (not a page response's
   * `.status()`) is a status wherever this file reads it.
   */
  const statusFields = new Set(
    [...code.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*[A-Za-z_$][\w$.?]*\.status\b(?!\s*\()/g)].map((m) => m[1]),
  )
  /** A name ending in `Status` bound only to a page response's `.status()`, which is never 0. */
  const pageStatus = (name) => {
    const vals = bindings.get(name) ?? []
    return vals.length > 0 && vals.every((v) => /\.\s*status\s*\(/.test(code.slice(v.a, v.b)))
  }

  const checks = []
  for (const m of code.matchAll(CHECKS)) {
    const open = m.index + m[0].length - 1
    const close = matchForward(code, open)
    if (close > 0) checks.push({ open, close, args: argSpans(code, open, close) })
  }
  /** Which argument of the innermost check around `p` holds it, or null outside every check. */
  const inCheck = (p) => {
    const call = checks.filter((c) => c.open < p && p < c.close).sort((x, y) => y.open - x.open)[0]
    return call ? call.args.findIndex(([a, b]) => p >= a && p <= b) : null
  }

  /*
   * THE COMPARISONS: `<`, `<=` with a number after them, and `>`, `>=` with a
   * number before them — each with a status on its other side.
   */
  /** The operand chain that ends at `end`: `res.status`, `(await A(x)).status`, `l.lister?.status`. */
  const chainBack = (end) => {
    let k = end
    for (;;) {
      if (code[k] === ')' || code[k] === ']') {
        const o = matchBack(code, k)
        if (o < 0) return -1
        k = skipBack(code, o - 1)
        if (code[k] === '.' && code[k - 1] === '?') k = skipBack(code, k - 2)
        // `(await A(x)).status`: the group starts the chain, and so it does after `return (…)`.
        if (!isWord(code[k]) && code[k] !== ')' && code[k] !== ']') return o
        if (isWord(code[k]) && KEYWORDS.has(wordBefore(code, k).word)) return o
        continue
      }
      if (!isWord(code[k])) return k + 1
      const w = wordBefore(code, k)
      const q = skipBack(code, w.at - 1)
      if (code[q] === '.' && code[q - 1] !== '.') {
        k = skipBack(code, code[q - 1] === '?' ? q - 2 : q - 1)
        continue
      }
      return w.at
    }
  }
  const chainFwd = (start) => {
    let k = skipFwd(code, start)
    if (code[k] === '(') k = matchForward(code, k) + 1
    else if (isWord(code[k])) while (isWord(code[k])) k++
    else return -1
    for (;;) {
      let j = skipFwd(code, k)
      if (code[j] === '?' && code[j + 1] === '.') j = skipFwd(code, j + 2)
      else if (code[j] === '.') j = skipFwd(code, j + 1)
      else if (code[j] === '(' || code[j] === '[') {
        k = matchForward(code, j) + 1
        continue
      } else return k
      if (code[j] === '(' || code[j] === '[') {
        k = matchForward(code, j) + 1
        continue
      }
      if (!isWord(code[j])) return k
      while (isWord(code[j])) j++
      k = j
    }
  }
  const sites = []
  const considered = { compared: 0, floored: 0, cannotBeZero: 0 }
  for (const m of code.matchAll(/(?<![<>=!])(<=?|>=?)(?![<>=])/g)) {
    const op = m[1]
    const at = m.index
    let opStart
    let opEnd
    if (op[0] === '<') {
      // `x.status < 300`: a number after, the status before
      if (!/^\s*\d/.test(code.slice(at + op.length, at + op.length + 12))) continue
      opEnd = skipBack(code, at - 1) + 1
      opStart = chainBack(opEnd - 1)
    } else {
      // `300 > x.status`: a number before, the status after (`=>` is excluded above)
      const n = skipBack(code, at - 1)
      if (!/^\d[\d_.]*$/.test(wordBefore(code, n).word)) continue
      opStart = skipFwd(code, at + op.length)
      opEnd = chainFwd(opStart)
    }
    if (opStart < 0 || opEnd <= opStart) continue
    // The operand as written (strings included, so `A('/x')` is not `A('/y')`), spaces out.
    const operand = norm(src.slice(opStart, opEnd))
    const last = /([A-Za-z_$][\w$]*)$/.exec(operand)?.[1]
    if (!last || !(last === 'status' || /Status$/.test(last) || (operand.includes('.') && statusFields.has(last)))) continue
    if (last !== 'status' && !statusFields.has(last) && pageStatus(last)) continue
    const where = inCheck(at)
    if (where !== null && where >= 1) continue // a check's message decides nothing
    considered.compared += 1

    const base = operand.endsWith('.status') ? operand.slice(0, -'.status'.length) : null
    const same = (x) => x === operand
    /*
     * A FLOOR is a whole conjunct that no status of 0 satisfies: the same status
     * tested for truth, `> N` with N ≥ 0, `>= N` with N > 0 (either way round),
     * `!== 0`, or the same answer's `ok`.
     */
    const floorLeaf = (t) => {
      let f
      if ((f = /^(?:!!)?(.+)$/.exec(t)) && same(f[1])) return true
      if ((f = /^(.+?)(>=|>)(-?[\d_.]+)$/.exec(t)) && same(f[1])) return f[2] === '>' ? Number(f[3]) >= 0 : Number(f[3]) > 0
      if ((f = /^(-?[\d_.]+)(<=|<)(.+)$/.exec(t)) && same(f[3])) return f[2] === '<' ? Number(f[1]) >= 0 : Number(f[1]) > 0
      if ((f = /^(.+?)!==?(-?[\d_.]+)$/.exec(t)) && same(f[1])) return Number(f[2]) === 0
      if (base && (f = /^(.+)\.ok(?:===true)?$/.exec(t)) && f[1] === base) return true
      return false
    }
    const floored = conjunctsAround(code, at).some(([a, b]) => floorLeaf(norm(src.slice(a, b))))
    if (floored) {
      considered.floored += 1
      continue
    }
    const root = /^([A-Za-z_$][\w$]*)/.exec(operand)?.[1] ?? null
    const why = (root && zeroRoot(root)) ?? (zeroClient ? 'ZERO-CLIENT' : null)
    if (!why) {
      considered.cannotBeZero += 1
      continue
    }
    const said = src.slice(opStart, opEnd).replace(/\s+/g, ' ')
    const num = op[0] === '<' ? /\d[\d_.]*/.exec(code.slice(at + op.length))[0] : wordBefore(code, skipBack(code, at - 1)).word
    sites.push({
      line: lineOf(at),
      rule: why,
      text: op[0] === '<' ? `${said} ${op} ${num}` : `${num} ${op} ${said}`,
      inCheck: where === 0,
    })
  }

  const markers = []
  for (const m of src.matchAll(MARKER)) {
    const slash = m.index
    // A comment's own `//`, not a `//` inside a string or a longer comment's text.
    let commentStart = -1
    for (let k = slash; k >= 0 && src[k] !== '\n'; k--) if (comments.has(k)) commentStart = k
    if (commentStart !== slash) continue
    markers.push({ line: lineOf(slash), reason: m[1], inCheck: inCheck(slash) !== null })
  }
  return { sites, markers, clean, zeroClient, considered }
}

/** The gate over one directory: every site and problem, and a tally of what was read. */
export function scan(dir) {
  const problems = []
  const sites = []
  const tally = { suites: 0, zeroClient: 0, compared: 0, floored: 0, cannotBeZero: 0, exempt: {} }
  let files = []
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort()
  } catch {
    files = []
  }
  tally.suites = files.length
  if (files.length < MIN_SUITES) {
    problems.push(
      `only ${files.length} suite(s) read under ${dir}, below the floor of ${MIN_SUITES} — a scan that reads ` +
        'nothing passes, so the zero needs a denominator',
    )
  }
  for (const file of files) {
    const found = floorlessIn(readFileSync(join(dir, file), 'utf8'))
    if (!found.clean) {
      problems.push(`${file}  could not be read as JavaScript — it ends inside a string, comment or template, so any answer about it would be a guess`)
      continue
    }
    if (found.zeroClient) tally.zeroClient += 1
    tally.compared += found.considered.compared
    tally.floored += found.considered.floored
    tally.cannotBeZero += found.considered.cannotBeZero
    const byLine = new Map(found.markers.map((mk) => [mk.line, mk]))
    for (const s of found.sites) {
      const mk = byLine.get(s.line)
      if (mk && REASONS.includes(mk.reason) && !mk.inCheck) {
        tally.exempt[mk.reason] = (tally.exempt[mk.reason] ?? 0) + 1
        mk.used = true
        continue
      }
      sites.push({ file, ...s })
    }
    for (const mk of found.markers) {
      if (mk.inCheck) {
        problems.push(
          `${file}:${mk.line}  // status-floor: ${mk.reason} — inside a check's arguments, where the other gates split on text ` +
            'and a comment moves the split; hoist the comparison into a variable and mark that line',
        )
      } else if (!REASONS.includes(mk.reason)) {
        problems.push(`${file}:${mk.line}  // status-floor: ${mk.reason} — not a reason this gate knows (${REASONS.join(', ')})`)
      } else if (!mk.used) {
        problems.push(`${file}:${mk.line}  // status-floor: ${mk.reason} — exempts nothing: no comparison on this line needs it`)
      }
    }
  }
  return { problems, sites, tally }
}

const WHY = {
  'ZERO-CLIENT': "the suite binds the fixture's client without noAnswer: 'throw', so it answers 0 when nothing answers",
  PLACEHOLDER: 'the name it is read from can hold a hand-made status of 0',
  'ZERO-HELPER': 'the name it is read from holds what a helper hands back, and that helper can hand back a status of 0',
}

function report({ problems, sites, tally }) {
  for (const p of problems) console.log(`✗ ${p}`)
  for (const s of sites) console.log(`✗ ${s.file}:${s.line}  ${s.rule}  ${s.text} — ${WHY[s.rule]}`)
  if (problems.length || sites.length) {
    const of = (rule) => sites.filter((s) => s.rule === rule).length
    console.error(
      `\n[status-floor] ${sites.length} status comparison(s) with an upper bound and no lower bound, where the status can be 0, ` +
        `in ${new Set(sites.map((s) => s.file)).size} suite(s): ${of('ZERO-CLIENT')} on a client that answers 0, ` +
        `${of('PLACEHOLDER')} on a hand-made status of 0, ${of('ZERO-HELPER')} on a helper's` +
        `${problems.length ? `; and ${problems.length} other problem(s)` : ''}.\n` +
        '0 < 300: nothing answering reads as success. Where the condition means "it worked", read `ok` (2xx), which\n' +
        'the client\'s answer and a fetch Response both have and a hand-made `{ status: 0 }` does not; where what\n' +
        "follows cannot do without it, `must(res, what)`; on a bare number, a floor (`s >= 200 && s < 300`); or bind\n" +
        "the suite's client with `noAnswer: 'throw'`. A refusal is `>= 400` or its status. A comparison a 0 cannot\n" +
        `pass ends its own line with \`// status-floor: <reason>\`, one of ${REASONS.join(', ')} — outside any check's arguments.`,
    )
    process.exitCode = 1
    return false
  }
  const exempt = Object.entries(tally.exempt).sort()
  console.log(
    `[status-floor] ok — ${tally.suites} suite(s) read, ${tally.zeroClient} of them binding a client that answers 0; ` +
      `${tally.compared} status comparison(s) with an upper bound: ${tally.floored} with a lower bound beside it, ` +
      `${tally.cannotBeZero} on a status that cannot be 0, ` +
      `${exempt.reduce((n, [, v]) => n + v, 0)} exempt${exempt.length ? ` (${exempt.map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}`,
  )
  return true
}

/*
 * THE PLANTED SUITES. Each gets a directory of its own, and the gate — this
 * file, or under `--mutate` a broken copy of it — runs over it as a child,
 * exactly as it runs over `test/e2e`.
 */
const HEAD = ["import { apiAs as apiAsAt } from './lib/fixture.mjs'", 'const apiAs = apiAsAt(API)', 'const A = apiAs(token)']
const THROWS = ["import { apiAs as apiAsAt } from './lib/fixture.mjs'", "const apiAs = apiAsAt(API, { noAnswer: 'throw' })", 'const A = apiAs(token)']
const suite = (head, ...lines) => ({ 'c.mjs': [...head, ...lines].join('\n') })
const CASES = [
  ['caught', "the dependency-read-access guard: a refusal read as status < 400, on the default binding", suite(HEAD,
    'const gate = await M(`/tasks/${HIDDEN}`)',
    "if (gate.status < 400) throw new Error(`the member could open the hidden blocker (${said(gate)}), so nothing here would mean anything`)",
  ), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}gate\.status < 400/],
  ['caught', "flag-resolution's restore: a check resting on the status alone", suite(HEAD,
    'const healed = await platformOn()',
    "chk(!A || healed?.status < 300, 'and the platform’s Forms switch is back on for every workspace after this run')",
  ), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}healed\?\.status < 300/],
  ['caught', 'a status ANDed with a read-back, which a dead API would also fail', suite(HEAD,
    "const made = await A('/tasks', { method: 'POST', body: { title } })",
    "chk(made.status < 300 && made.data?.id, 'the task is made')",
  ), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}made\.status < 300/],
  ['caught', 'a status compared with <= 299', suite(HEAD, "const r = await A('/x')", "chk(r.status <= 299, 'x')"), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}r\.status <= 299/],
  ['caught', 'the bound written first: 300 > status', suite(HEAD, "const r = await A('/x')", "chk(300 > r.status, 'x')"), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}300 > r\.status/],
  ['caught', 'a status read inline off the call', suite(HEAD, "chk((await A('/x')).status < 300, 'x')"), /✗ c\.mjs:4 {2}ZERO-CLIENT {2}\(await A\('\/x'\)\)\.status < 300/],
  ['caught', 'and read off the call after return, which is no part of it', suite(HEAD,
    'const saved = async () => {',
    "  return (await A('/x')).status < 300",
    '}',
  ), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}\(await A\('\/x'\)\)\.status < 300/],
  ['caught', 'in a waitUntil predicate that decides a check', suite(HEAD,
    "const saved = await waitUntil(async () => (await A('/x')).status < 300)",
    "chk(saved, 'it is saved')",
  ), /✗ c\.mjs:4 {2}ZERO-CLIENT /],
  ['caught', 'in a helper a check calls', suite(HEAD, 'const served = (res) => (modelOn ? res.status < 300 : res.status === 503)', "chk(served(await A('/x')), 'x')"), /✗ c\.mjs:4 {2}ZERO-CLIENT {2}res\.status < 300/],
  ['caught', 'every answer in a list, and a status held under a name of its own', suite(HEAD,
    "const answers = { memberAddsStatus: (await A('/s', { method: 'POST' })).status }",
    "chk(toggles.every((r) => r.status < 300) && answers.memberAddsStatus < 300, 'x')",
  ), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}r\.status < 300[\s\S]*✗ c\.mjs:5 {2}ZERO-CLIENT {2}answers\.memberAddsStatus < 300/],
  ['caught', "a default binding that asks for other options still answers 0", suite(
    ["import { apiAs as apiAsAt } from './lib/fixture.mjs'", "const apiAs = apiAsAt(API, { emptyBodyOn: ['POST', 'PATCH'] })", 'const A = apiAs(token)'],
    "const r = await A('/x')", "chk(r.status < 300, 'x')",
  ), /✗ c\.mjs:5 {2}ZERO-CLIENT /],
  ['caught', "the client imported by its own name and bound bare", suite(
    ["import { apiAs, must } from './lib/fixture.mjs'", 'const A = apiAs(API)(token)'],
    "const r = await A('/x')", "chk(r.status < 300, 'x')",
  ), /✗ c\.mjs:4 {2}ZERO-CLIENT /],
  ['caught', "a noAnswer: 'throw' suite whose step, not taken, stands in as { status: 0 }", suite(THROWS,
    "const removed = id ? await A(`/files/${id}`, { method: 'DELETE' }) : { status: 0 }",
    "chk(removed.status < 300, 'the file is removed')",
  ), /✗ c\.mjs:5 {2}PLACEHOLDER {2}removed\.status < 300/],
  ['caught', 'a put-back that threw, caught into { status: 0 }', suite(THROWS,
    'let putBack = null',
    'try {',
    "  putBack = await A('/settings', { method: 'PATCH', body })",
    '} catch (err) {',
    '  putBack = { status: 0, error: { message: String(err) } }',
    '}',
    "chk(!putBack || putBack.status < 300, 'and the setting is put back')",
  ), /✗ c\.mjs:10 {2}PLACEHOLDER {2}putBack\.status < 300/],
  ['caught', "a helper of the suite's own that hands back { status: 0 }", suite(THROWS,
    'const download = async (route) => {',
    '  const res = await fetch(`${API}${route}`).catch(() => null)',
    "  if (!res) return { status: 0, type: '' }",
    "  return { status: res.status, type: res.headers.get('content-type') ?? '' }",
    '}',
    "const csv = await download('/export')",
    "chk(csv.status < 300 && /csv/.test(csv.type), 'it downloads')",
  ), /✗ c\.mjs:10 {2}ZERO-HELPER {2}csv\.status < 300/],
  ['caught', 'a floor across an || does not count', suite(HEAD, "const r = await A('/x')", "chk(r.status >= 200 && fresh || r.status < 300, 'x')"), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}r\.status < 300/],
  ['caught', "a floor on another answer's status does not count", suite(HEAD, "const r = await A('/x')", "const q = await A('/y')", "chk(q.status >= 200 && r.status < 300, 'x')"), /✗ c\.mjs:6 {2}ZERO-CLIENT {2}r\.status < 300/],
  ['caught', 'a floor in the statement before does not count', suite(HEAD,
    'const saved = async (r) => {',
    "  r.status >= 200 && console.log('answered')",
    '  return r.status < 300',
    '}',
  ), /✗ c\.mjs:6 {2}ZERO-CLIENT {2}r\.status < 300/],
  ['caught', 'a floor that lets 0 through does not count', suite(HEAD,
    "const r = await A('/x')",
    "chk(r.status > -1 && r.status < 300, 'a')",
    "chk(r.status !== 404 && r.status < 300, 'b')",
    "chk(r.status >= 0 && r.status < 300, 'c')",
    "chk(-1 < r.status && r.status < 300, 'd')",
  ), /✗ c\.mjs:5 [\s\S]*✗ c\.mjs:6 [\s\S]*✗ c\.mjs:7 [\s\S]*✗ c\.mjs:8 /],
  ['caught', 'a marker with a reason nobody defined', suite(HEAD, "const r = await A('/x')", 'const through = r.status < 300 // status-floor: because', "chk(through, 'x')"), /not a reason this gate knows/],
  ['caught', 'a marker that exempts nothing', suite(HEAD, "const r = await A('/x')", 'const through = r.ok // status-floor: zero-fails', "chk(through, 'x')"), /exempts nothing/],
  ['caught', "a marker inside a check's arguments", suite(HEAD, "const r = await A('/x')", 'chk(', '  !(r.status < 300), // status-floor: zero-fails', "  'refused',", ')'), /inside a check's arguments/],
  ['caught', 'a directory with no suites in it', { 'README.md': 'nothing' }, /below the floor/],
  ['caught', 'a suite that does not lex to a clean end', suite(HEAD, 'const t = `left open ${WS}'), /could not be read as JavaScript/],
  ['caught', 'a status copied into a field of another name, and compared there (time-tracking-readers)', suite(HEAD,
    "const track = async () => { const stop = await A('/stop', { method: 'POST' }); return { stop: stop.status } }",
    'const g = await track()',
    "chk(g.stop < 300, 'the timer stops')",
  ), /✗ c\.mjs:\d+ {2}ZERO-\w+ {2}g\.stop < 300/],
  ['passes', 'that copied status floored, or its answer\'s ok copied instead', suite(HEAD,
    "const track = async () => { const stop = await A('/stop', { method: 'POST' }); return { stop: stop.status, stopped: stop.ok === true } }",
    'const g = await track()',
    "chk(g.stop >= 200 && g.stop < 300 && g.stopped, 'the timer stops')",
  )],
  ['passes', 'the same checks reading ok', suite(HEAD,
    'const gate = await M(`/tasks/${HIDDEN}`)',
    'if (gate.ok) throw new Error(`the member could open the hidden blocker (${said(gate)})`)',
    'const healed = await platformOn()',
    "chk(!A || healed?.ok === true, 'and the switch is back on')",
    "chk(toggles.every((r) => r.ok) && (await A('/x')).ok, 'x')",
  )],
  ['passes', 'a lower bound beside the upper one, in every spelling', suite(HEAD,
    "const r = await A('/x')",
    "chk(r.status >= 200 && r.status < 300, 'a')",
    "chk((r.status > 0) && (r.data?.id && r.status < 400), 'b')",
    "chk(r.status !== 0 && r.status < 300 && 0 < r.status, 'c')",
    "chk(r.status && r.status <= 299, 'd')",
    "chk(r.ok && r.status < 300, 'e')",
    "chk(100 <= r.status && 300 > r.status, 'f')",
    'const memberAddsStatus = answers.memberAddsStatus',
    "chk(memberAddsStatus >= 200 && memberAddsStatus < 300, 'g')",
  )],
  ['passes', "a noAnswer: 'throw' binding, whose client rejects instead of answering 0", suite(THROWS,
    "const r = await A('/x')",
    "chk(r.status < 300 && (await A('/y')).status < 400, 'x')",
    'const gate = await A(`/tasks/${HIDDEN}`)',
    "if (gate.status < 400) throw new Error('the member could open it')",
  )],
  ['passes', 'apiClient, which rejects when nothing answers', { 'c.mjs': ["import { apiClient } from './lib/fixture.mjs'", 'const api = apiClient(B, token)', "const r = await api('/x')", "chk(r.status < 300, 'x')"].join('\n') }],
  ['passes', "a page response's status(), which is never 0, held in a name of its own", suite(HEAD,
    "const answer = page.waitForResponse((r) => r.url().includes('/tasks')).catch(() => null)",
    'const usedStatus = (await answer)?.status() ?? null',
    "chk(usedStatus !== null && usedStatus < 300 && (await answer).status() < 300, 'x')",
  )],
  ['passes', 'a refusal, a placeholder read as a refusal, and a status that is not compared from above', suite(THROWS,
    "const refused = id ? await A('/x') : { status: 0 }",
    "chk(refused.status >= 400 && refused.status === 403 && [200, 204].includes(refused.status), 'x')",
  )],
  ['passes', 'a comparison a 0 cannot pass, hoisted and marked', suite(HEAD,
    "const answers = [await A('/x'), await A('/y')]",
    'const noneThrough = !answers.some((r) => r.status < 300) // status-floor: zero-fails — a 0 counts as through, and fails',
    "chk(noneThrough, 'none got through')",
  )],
  ['passes', "the shape in a comment, a string, a template, and a check's message", suite(HEAD,
    '// if (gate.status < 400) throw',
    "const said = 'if (gate.status < 400) throw'",
    'const tpl = `r.status < 300 ${WS}`',
    "const r = await A('/x')",
    "chk(r.ok, 'x', `it answered ${r.status < 300 ? 'yes' : 'no'}`)",
  )],
]

function runCases(gate) {
  let fail = 0
  const seen = {}
  console.log(`\n▶ planted suites, each run through ${gate === SELF ? 'this gate' : 'the gate under test'}`)
  for (const [want, name, files, pattern] of CASES) {
    const dir = mkdtempSync(join(tmpdir(), 'status-floor-'))
    let r
    try {
      for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, path)), { recursive: true })
        writeFileSync(join(dir, path), `${text}\n`)
      }
      const env = { ...process.env, SUITE_DIR: dir }
      delete env.STATUS_FLOOR_UNDER_TEST
      r = spawnSync(process.execPath, [gate], { encoding: 'utf8', env, timeout: 60_000 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
    const ok = want === 'caught' ? r.status === 1 && pattern.test(out) : r.status === 0 && /\[status-floor\] ok/.test(out)
    seen[name] = { ok, first: out.split('\n').find((l) => l.startsWith('✗') || l.startsWith('[status-floor] ok')) ?? '' }
    if (ok) console.log(`  \x1b[32mPASS\x1b[0m ${want === 'caught' ? 'caught' : 'passes'}: ${name}`)
    else {
      fail += 1
      console.log(`  \x1b[31mFAIL\x1b[0m ${want === 'caught' ? 'not caught' : 'did not pass'}: ${name} — exit ${r.status}: ${out.trim().split('\n')[0]}`)
    }
  }
  console.log(`\n${CASES.length - fail} passed, ${fail} failed`)
  return { fail, seen }
}

if (process.env.STATUS_FLOOR_UNDER_TEST) {
  // One pass of the cases against a broken copy, started by `proveMutationsBite` below.
  process.exitCode = runCases(process.env.STATUS_FLOOR_UNDER_TEST).fail ? 1 : 0
} else {
  const realOk = report(scan(SUITES))
  if (process.argv.includes('--mutate')) {
    const { fail, seen } = runCases(SELF)
    const planted = seen[CASES[0][1]]
    const fixed = seen[CASES.find(([want]) => want === 'passes')[1]]
    console.log(
      `[status-floor] mutate: the planted dependency-read-access guard was ${planted.ok ? 'caught' : 'NOT caught'} — ${planted.first}\n` +
        `[status-floor] mutate: the same conditions reading ok ${fixed.ok ? 'pass' : 'do NOT pass'} — ${fixed.first}`,
    )
    const alive = (mutant) => {
      const r = spawnSync(process.execPath, [mutant], { encoding: 'utf8', timeout: 120_000 })
      return { ok: /\[status-floor\]|✗/.test(r.stdout ?? ''), why: r.stderr }
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
      envVar: 'STATUS_FLOOR_UNDER_TEST',
      label: 'this gate',
      alive,
      mutations: [
        ['lt-unread', at("if (op[0] === '<') {\n      // `x.status < 300`: a number after", ', the status before\n'), "if (false) {\n"],
        ['lte-unread', at('for (const m of code.matchAll(/(?<![<>=!])(<=?|>=?)', '(?![<>=])/g)) {'), 'for (const m of code.matchAll(/(?<![<>=!])(<|>=?)(?![<>=])/g)) {'],
        ['reversed-unread', at("if (!/^\\d[\\d_.]*$/.test(wordBefore(code, n).word)) ", 'continue'), 'continue'],
        ['keywords-in-chains', at('if (isWord(code[k]) && KEYWORDS.has(wordBefore(code, k).word)) ', 'return o'), ''],
        ['named-statuses-unread', at("if (!last || !(last === 'status' || /Status$/.test(last) || (operand.includes('.') && statusFields", ".has(last)))) continue"), "if (!last || !(last === 'status' || (operand.includes('.') && statusFields.has(last)))) continue"],
        ['copied-statuses-unread', at("/Status$/.test(last) || (operand.includes('.') && ", 'statusFields.has(last)))) continue'), "/Status$/.test(last) || false)) continue"],
        ['page-statuses-counted', at("if (last !== 'status' && !statusFields.has(last) && ", 'pageStatus(last)) continue'), 'if (false) continue'],
        ['zero-client-off', at('if (!options || !/noAn', "swer\\s*:\\s*['\"]throw['\"]/.test(src.slice(...options))) zeroClient = true"), 'if (false) zeroClient = true'],
        ['any-options-throw', at('if (!options || ', '!/noAnswer'), 'if (!options || false && !/noAnswer'],
        ['own-name-unread', at("if (s) local.add(s[1] ?? ", "'apiAs')"), 'if (s && s[1]) local.add(s[1])'],
        ['placeholders-unread', at('if (ZERO.test(text)) ', "return 'PLACEHOLDER'"), 'if (false) return null'],
        ['every-name-a-placeholder', at("      if (ZERO.test(text)) return 'PLACE", "HOLDER'"), "      if (true) return 'PLACEHOLDER'"],
        ['helpers-unread', at('if (call && zeroFns.has(call[1])) ', "return 'ZERO-HELPER'"), 'if (false) return null'],
        ['floors-unread', at('const floored = conjunctsAround(code, at).some(([a, b]) => ', 'floorLeaf(norm(src.slice(a, b))))'), 'const floored = false'],
        ['other-answers-floor', at('const same = (x) => ', 'x === operand'), 'const same = (x) => /status$/i.test(x)'],
        ['truthy-not-a-floor', at('if ((f = /^(?:!!)?(.+)$/.exec(t)) && same(f[1])) ', 'return true'), 'if (false) return true'],
        ['nonpositive-floors', at("return f[2] === '>' ? Number(f[3]) >= 0 : ", 'Number(f[3]) > 0'), 'return true'],
        ['nonpositive-floors-reversed', at("return f[2] === '<' ? Number(f[1]) >= 0 : ", 'Number(f[1]) > 0'), 'return true'],
        ['any-inequality-floors', at('&& same(f[1])) return Number(f[2]) ', '=== 0'), '&& same(f[1])) return true'],
        ['ok-not-a-floor', at('if (base && (f = /^(.+)\\.ok(?:===true)?$/.exec(t)) && f[1] === base) ', 'return true'), 'if (false) return true'],
        ['groups-not-stepped-through', at("if (open < 0 || code[open] !== '(' || ", '!isGroup(code, open)) break'), 'if (true) break'],
        ['disjunctions-joined', at("else if ((c === '|' && code[k + 1] === '|') || ", "(c === '?' && code[k + 1] === '?')) cut = 2"), "else if (c === '?' && code[k + 1] === '?') cut = 2"],
        ['statements-joined', at('if (last && !/[=(\\[{,?:&|+\\-*/.<>!]/.test(last) && ', "!/[.?:&|+*,=]/.test(code[skipFwd(code, k + 1)] ?? '')) cut = 1"), 'if (false) cut = 1'],
        ['messages-decide', at('if (where !== null && where >= 1) ', 'continue'), 'if (false) continue'],
        ['strings-are-code', at("        if (c === quote) prev = c\n        word = ''\n      } else ", 'blank(i)'), "        if (c === quote) prev = c\n        word = ''\n      }"],
        ['templates-are-code', at("        i += 1\n      } else ", 'blank(i, false)'), '        i += 1\n      }'],
        ['comments-are-code', at("      if (c === '\\n') mode = 'code'\n", '      else blank(i)'), "      if (c === '\\n') mode = 'code'"],
        ['any-reason-will-do', at('} else if (!REASONS.includes(mk.reason)) {\n', '        problems.push'), '} else if (false) {\n        problems.push'],
        ['stale-markers-pass', at('} else if (!mk.used) {', '\n'), '} else if (false) {\n'],
        ['markers-anywhere', at('      if (mk.inCheck) {', '\n        problems.push('), '      if (false) {\n        problems.push('],
        ['unlexed-read-anyway', at('    if (!found.clean) ', '{'), '    if (false) {'],
        ['no-floor', at('const MIN_SUITES = ', 'process.env.SUITE_DIR ? 1 : 100'), 'const MIN_SUITES = 0'],
        ['violations-exit-zero', at('    process.exitCode = 1\n', '    return false'), '    process.exitCode = 0\n    return false'],
      ],
    })
    if (!realOk || fail || blind) process.exitCode = 1
  }
}
