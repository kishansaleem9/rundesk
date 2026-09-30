#!/usr/bin/env node
/*
 * A CATCH ON AN API CLIENT'S CALL DOES NOT SWALLOW WHAT IT CATCHES
 * (`suite-hygiene/inert-catches`, `resume-defects/resume-3`).
 *
 * Every API client the suites use — `lib/fixture.mjs`'s `apiAs(base)(token)`,
 * which each suite binds as `apiAs` (`suite-hygiene/apiAs-duplicated-62`), and
 * `apiClient` over it — answers EVERY HTTP status by returning `{ status, data,
 * error, … }`. A 500, a 403, a 404: each returns normally. The client rejects
 * only when nothing answers at all, and only where a suite asked it to
 * (`noAnswer: 'throw'`, as `apiClient` does); elsewhere that is a status of 0.
 * A raw `fetch` rejects then too. So
 *
 *     if (WS && A) await A(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})
 *
 * reads no status, so every HTTP failure goes past it unseen, and the one
 * thing its catch can catch, a dead API, it swallows as well. A cleanup that
 * did not clean up, a restore of the shared admin that did not restore, a
 * setup that did not set up: each one said nothing.
 *
 * MEASURED, 29 September, twice: with a real JS parser (acorn, in a scratch
 * scan that is not committed) and with this file, which agree site for site.
 * At d86220d the 239 suites held 1,544 `.catch(() => {})`, and 158 of them, in
 * 133 suites, were on an API client: 136 on a client's own call, 11 on a
 * closure or loop that calls one (a `restore`, a cleanup runner), 11 on a raw
 * `fetch` to the API. d4708b8 added `audit-log-settings`, and with it one
 * more: 159 in 134. The rest are on Playwright calls, which DO reject (a
 * bounded `.click().catch(() => {})` is the form `check-suite-section-enders`
 * asks for), and on SQL, `browser.close()` and `sql.end()`. After the fix,
 * none: a cleanup `DELETE` reads its status, accepts 200, 204 or 404 and
 * prints anything else, and a restore of shared state is a counted check.
 *
 * THE RULE. On an API call, `.catch(h)` — or `.then(ok, h)`, which is the
 * same catch — is refused where `h` swallows:
 *
 *   · an EMPTY handler — `() => {}`, `function () {}`, a body holding only a
 *     comment or a bare `return`, or a name bound to one — wherever its value
 *     goes. An empty handler is never written for the next line to read;
 *   · a handler that hands back NULL or UNDEFINED — `() => null`,
 *     `() => undefined`, `() => void 0` — where nothing reads it: a statement
 *     of its own, or bound to a name that nothing reads again. Read on the next
 *     line, `() => null` is the sentinel the clients themselves are built on
 *     (`fetch(…).catch(() => null)`, then `if (!res) return { status: 0 }`),
 *     and the fixed cleanups read it the same way (`gone?.status`).
 *
 * AN API CALL is one of three things, resolved per suite:
 *
 *   DIRECT   a call of a client: a name bound to a call of a factory (`apiAs`,
 *            `apiClient`, or a local function whose returned function calls
 *            `fetch`), a local function that calls `fetch` itself, an alias of
 *            one (`cleanupA = A`, `a || b`), a property a client was handed
 *            out as (`{ as: apiAs(token) }`, then `stranger.as(…)`), or a
 *            curried `apiAs(token)(…)`. Followed through `.then(…)` and
 *            `.finally(…)`, which pass a rejection on.
 *   WRAPPED  a call of a closure or helper whose body calls a client
 *            (`restore`, `platformOn`), a loop variable over an array that
 *            client-calling closures were pushed onto (`for (const fn of
 *            cleanup.reverse())`), or anything with a client call inside it
 *            (`Promise.all`). Not `waitUntil`, which never rejects.
 *   FETCH    a raw `fetch(…)`, wherever it points: `fetch` resolves on every
 *            status, so a catch that swallows on it can only hide that nothing
 *            answered. (A URL is only text; telling the API's from a stub's
 *            would be a guess. The model and store stubs' control calls hand
 *            their null on, and pass.)
 *
 * Anything else is out of scope: Playwright, SQL tagged templates,
 * `browser.close()`, `sql.end()`, and a handler that does something (logs,
 * counts, returns a status). Not read either: an empty `try { … } catch {}`
 * around a client call (one at d4708b8: `comment-recording` putting the
 * account's language back).
 * A null HANDED ON — returned from a closure, passed as an argument, a branch
 * of a ternary — counts as read, because where it goes next is not followed;
 * an empty handler there is still refused.
 *
 * READ AS JAVASCRIPT, NOT AS LINES: comments, strings, regex literals and
 * template text are blanked before anything is matched (`lex`, copied from
 * `check-suite-text-reads`), so the shape in a sentence, a comment or a string
 * is not a site, and a `)` in a string does not close a call. A suite that
 * does not lex to a clean end is reported, not guessed at. No parser package:
 * `acorn` is not a dependency of this repo.
 *
 * A GATE THAT READ NOTHING ANSWERS ok AS SURELY AS ONE THAT READ EVERYTHING:
 * fewer than 100 suites read is a failure (1 under `SUITE_DIR`).
 *
 * `--mutate` plants suites in a temp directory, requires each shape above to
 * be caught and Playwright, SQL, teardown and the fixed forms to pass, then
 * breaks this file one rule at a time and requires a planted case to notice
 * (`lib/mutate.mjs`).
 *
 *   node scripts/check-suite-api-catches.mjs [--mutate]
 *   SUITE_DIR=<dir> node scripts/check-suite-api-catches.mjs
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
/** Called, each returns a client: `lib/fixture.mjs`'s, and the name every local copy goes by. */
const FACTORIES = ['apiAs', 'apiClient']
/** A rejection passes straight through these, so a catch after one is on what it follows. */
const THROUGH = new Set(['then', 'finally'])
const KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'await', 'yield'])
const CONTROL = new Set(['if', 'for', 'while', 'with'])
const IDENT = /^[A-Za-z_$][\w$]*$/
const NAME = /[A-Za-z_$][\w$]*/y

/*
 * `src` with comments, string and regex contents and template text blanked,
 * exactly as long, so an index means the same place in both (a bracket or a
 * comma there is text, not syntax). `clean` says whether the walk ended
 * outside every string and comment; `regexEnds` holds where each regex literal
 * closes, since a `/` that ends a value does not carry a statement on.
 */
export function lex(src) {
  const code = src.split('')
  // Newlines survive in comments and strings, so a line is still a line; in
  // template text they go too, so a wrapped sentence does not end a statement.
  const blank = (i, keepNewline = true) => {
    if (i < code.length && !(keepNewline && code[i] === '\n')) code[i] = ' '
  }
  const regexEnds = new Set()
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
  return { code: code.join(''), clean: mode === 'code' && frames.length === 0, regexEnds }
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
const isWord = (c) => c !== undefined && /[\w$]/.test(c)
/** The first non-space at or after `i`, and whether a newline was crossed on the way. */
const skipFwd = (code, i) => {
  let nl = false
  for (; i < code.length && /\s/.test(code[i]); i++) if (code[i] === '\n') nl = true
  return { i, nl }
}
/** The last non-space at or before `i`, and whether a newline was crossed on the way. */
const skipBack = (code, i) => {
  let nl = false
  for (; i >= 0 && /\s/.test(code[i]); i--) if (code[i] === '\n') nl = true
  return { i, nl }
}
/** The word that ends at `end`, and where it starts — '' when `end` is not in a word. */
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

/*
 * Where an expression that starts at `from` ends: a `,` or `;` outside every
 * bracket it opened, a closing bracket it did not open, or a newline nothing
 * carries on over — a line ending in an operator, or a next line starting
 * with `.`, `?`, `:`, `&&`, `||` or `,`, which is how every wrapped chain and
 * ternary in these suites is written.
 */
const exprEnd = (code, from, regexEnds) => {
  let d = 0
  let last = ''
  for (let k = from; k < code.length; k++) {
    const c = code[k]
    if (c === '\n' && d === 0 && last) {
      const next = code[skipFwd(code, k + 1).i] ?? ''
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

/** Where the template literal whose closing backtick is at `j` opens. */
const templateStart = (code, j) => {
  for (let k = j - 1; k >= 0; k--) {
    if (code[k] === '`') return k
    if (code[k] === '}') {
      const o = matchBack(code, k)
      if (o < 0) return -1
      k = o
    }
  }
  return -1
}
/** Where the template literal whose opening backtick is at `i` closes. */
const templateEnd = (code, i) => {
  for (let k = i + 1; k < code.length; k++) {
    if (code[k] === '`') return k
    if (code[k] === '$' && code[k + 1] === '{') {
      const c = matchForward(code, k + 1)
      if (c < 0) return -1
      k = c
    }
  }
  return -1
}

/*
 * Where the member chain that the `.` at `dot` continues begins — for the `.`
 * of `.catch(`, the start of `A(`/x`, { … }).then((r) => r)` before it —
 * across lines, calls, indexes, tagged templates and optional chaining.
 */
const chainStart = (code, dot) => {
  let i = dot
  for (;;) {
    let j = i - 1
    if (code[j] === '?') j -= 1
    while (j >= 0 && /\s/.test(code[j])) j--
    for (;;) {
      let o
      if (code[j] === ')' || code[j] === ']') o = matchBack(code, j)
      else if (code[j] === '`') o = templateStart(code, j)
      else break
      if (o < 0) return 0
      j = o - 1
      if (code[j] === '.' && code[j - 1] === '?') j -= 2
      if (!/[\w$)\]`]/.test(code[j] ?? '')) return o // `(await x).…` — the group starts the chain
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

/**
 * The chain from `start` to `end` as a head — a name, a group, a template —
 * and the steps after it: `.prop`, `(call)`, `[index]`, a tagged template.
 * Null when something else is in the way.
 */
const parseChain = (code, start, end) => {
  let i = start
  let head
  if (code[i] === '(' || code[i] === '[') {
    const c = matchForward(code, i)
    if (c < 0) return null
    head = { kind: 'group', a: i, b: c + 1 }
  } else if (code[i] === '`') {
    const c = templateEnd(code, i)
    if (c < 0) return null
    head = { kind: 'template', a: i, b: c + 1 }
  } else {
    NAME.lastIndex = i
    const w = NAME.exec(code)
    if (!w) return null
    head = { kind: 'name', name: w[0], a: i, b: i + w[0].length }
  }
  i = head.b
  const ops = []
  for (;;) {
    i = skipFwd(code, i).i
    if (i >= end) return { head, ops }
    let dotted = false
    if (code[i] === '?' && code[i + 1] === '.') {
      i = skipFwd(code, i + 2).i
      dotted = !'(['.includes(code[i])
    } else if (code[i] === '.') {
      i = skipFwd(code, i + 1).i
      dotted = true
    }
    if (dotted) {
      NAME.lastIndex = i
      const w = NAME.exec(code)
      if (!w) return null
      ops.push({ kind: 'prop', name: w[0], a: i, b: i + w[0].length })
      i += w[0].length
      continue
    }
    const c = code[i] === '`' ? templateEnd(code, i) : '(['.includes(code[i]) ? matchForward(code, i) : -1
    if (c < 0) return null
    ops.push({ kind: code[i] === '(' ? 'call' : code[i] === '[' ? 'index' : 'tag', a: i, b: c + 1 })
    i = c + 1
  }
}

/** Every function in `code`: where it starts, where its body starts and ends, and whether that body is a block. */
function functionsIn(code, regexEnds) {
  const fns = []
  for (const m of code.matchAll(/(?<![\w$.])(?:async\s+)?function\b\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(/g)) {
    const close = matchForward(code, m.index + m[0].length - 1)
    const b = close < 0 ? -1 : skipFwd(code, close + 1).i
    const end = code[b] === '{' ? matchForward(code, b) : -1
    if (end > 0) fns.push({ start: m.index, name: m[1] ?? null, bodyStart: b, end: end + 1, block: true })
  }
  for (const m of code.matchAll(/=>/g)) {
    const j = skipBack(code, m.index - 1).i
    const params = code[j] === ')' ? matchBack(code, j) : isWord(code[j]) ? wordBefore(code, j).at : -1
    if (params < 0) continue
    const before = wordBefore(code, skipBack(code, params - 1).i)
    const b = skipFwd(code, m.index + 2).i
    const block = code[b] === '{'
    const end = block ? matchForward(code, b) + 1 : trimmed(code, b, exprEnd(code, b, regexEnds))[1]
    if (end > b) fns.push({ start: before.word === 'async' ? before.at : params, name: null, bodyStart: b, end, block })
  }
  return fns.sort((x, y) => x.start - y.start)
}

/** Every inert catch on an API client in one suite. */
export function inertCatchesIn(src) {
  const { code, clean, regexEnds } = lex(src)
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
  const endOf = (from) => exprEnd(code, from, regexEnds)

  const fns = functionsIn(code, regexEnds)
  const fnAt = new Map(fns.map((f) => [f.start, f]))
  /** The innermost function around `p`: the last, in source order, that holds it. */
  const innermost = (p) => {
    let best = null
    for (const f of fns) {
      if (f.start > p) break
      if (p < f.end) best = f
    }
    return best
  }

  // Every call of a name — `A(`, `restore?.(`, `.catch(`, `.as(` — and whether it is a member's.
  const calls = []
  for (const m of code.matchAll(/(?<![\w$])([A-Za-z_$][\w$]*)\s*(?:\?\.\s*)?\(/g)) {
    const open = m.index + m[0].length - 1
    const close = matchForward(code, open)
    if (close < 0) continue
    const before = skipBack(code, m.index - 1).i
    const member = code[before] === '.' && code[before - 1] !== '.'
    if (!member && wordBefore(code, before).word === 'function') continue
    calls.push({ name: m[1], at: m.index, open, close, member })
  }

  /*
   * WHAT EACH NAME IS BOUND TO: every `const`/`let`/`var` declarator, every
   * later `name = …`, every function declaration. A name is a client, a
   * factory or a wrapper if ANY value it is given makes it one — `let A =
   * null` and then `A = apiAs(token)` is how most suites write it.
   */
  const bindings = new Map()
  const bind = (name, from, to) => {
    const [a, b] = trimmed(code, from, to)
    if (!bindings.has(name)) bindings.set(name, [])
    bindings.get(name).push({ a, b })
  }
  for (const m of code.matchAll(/(?<![\w$.])(?:const|let|var)\s+/g)) {
    let i = m.index + m[0].length
    for (;;) {
      i = skipFwd(code, i).i
      let name = null
      if (code[i] === '{' || code[i] === '[') {
        const c = matchForward(code, i)
        if (c < 0) break
        i = c + 1
      } else {
        NAME.lastIndex = i
        const w = NAME.exec(code)
        if (!w) break
        name = w[0]
        i += name.length
      }
      i = skipFwd(code, i).i
      let end = i
      if (code[i] === '=' && code[i + 1] !== '=' && code[i + 1] !== '>') {
        end = endOf(i + 1)
        if (name) bind(name, i + 1, end)
      }
      if (code[end] !== ',') break
      i = end + 1
    }
  }
  for (const m of code.matchAll(/(?<![\w$])([A-Za-z_$][\w$]*)\s*=(?![=>])/g)) {
    const before = skipBack(code, m.index - 1).i
    if (code[before] === '.' || /^(?:const|let|var)$/.test(wordBefore(code, before).word)) continue
    bind(m[1], m.index + m[0].length, endOf(m.index + m[0].length))
  }
  for (const f of fns) if (f.name) bind(f.name, f.start, f.end)

  const fnOf = (v) => fnAt.get(v.a) ?? null
  /** `[await ]name(…)` and nothing more, from `a` to `b`: the name. */
  const callOf = (from, to) => {
    const [a, b] = trimmed(code, from, to)
    const i = /^await\s/.test(code.slice(a, a + 6)) ? skipFwd(code, a + 5).i : a
    NAME.lastIndex = i
    const w = NAME.exec(code)
    if (!w) return null
    let k = skipFwd(code, i + w[0].length).i
    if (code[k] === '?' && code[k + 1] === '.') k = skipFwd(code, k + 2).i
    return code[k] === '(' && matchForward(code, k) === b - 1 ? w[0] : null
  }
  /** `x.prop` or `x?.prop`, the whole range one member chain: the prop. */
  const memberProp = (a, b) => {
    const m = /(\??\.)\s*([A-Za-z_$][\w$]*)$/.exec(code.slice(a, b))
    if (!m) return null
    return chainStart(code, a + m.index + m[1].length - 1) === a ? m[2] : null
  }
  /** The names a value can take by `a || b`, `a ?? b`, `a && b`, or a ternary's branches. */
  const operandsOf = (a, b) => {
    const parts = []
    let s = a
    let d = 0
    for (let k = a; k < b; k++) {
      const c = code[k]
      if ('([{'.includes(c)) d += 1
      else if (')]}'.includes(c)) d -= 1
      else if (d === 0 && /^(?:\|\||\?\?|&&)$/.test(code.slice(k, k + 2))) {
        parts.push([s, k])
        s = k + 2
        k += 1
      } else if (d === 0 && c === '?' && code[k + 1] !== '.') {
        parts.length = 0 // a ternary's test is not a value it takes
        s = k + 1
      } else if (d === 0 && c === ':') {
        parts.push([s, k])
        s = k + 1
      }
    }
    if (s === a) return []
    parts.push([s, b])
    return parts.map(([x, y]) => code.slice(x, y).trim()).filter((t) => IDENT.test(t))
  }

  /*
   * FACTORIES: the known names, and any function whose own body calls no
   * `fetch` but holds a function that does — `(token) => async (route) =>
   * { … fetch … }` — or that only calls a factory: `(t) => apiAs(t)`.
   */
  const fetchers = new Set(calls.filter((c) => c.name === 'fetch' && !c.member).map((c) => innermost(c.at)))
  const callsFetch = (f) => fetchers.has(f)
  const factories = new Set(FACTORIES)
  for (const [name, vals] of bindings) {
    for (const v of vals) {
      const f = fnOf(v)
      if (f && !callsFetch(f) && [...fetchers].some((g) => g && g.start > f.start && g.end <= f.end)) factories.add(name)
    }
  }
  for (let grew = true; grew; ) {
    grew = false
    for (const [name, vals] of bindings) {
      if (factories.has(name)) continue
      if (vals.some((v) => fnOf(v) && !fnOf(v).block && factories.has(callOf(fnOf(v).bodyStart, fnOf(v).end)))) {
        factories.add(name)
        grew = true
      }
    }
  }

  /*
   * CLIENTS: a name bound to a factory's call, or to a function that calls
   * `fetch` itself (`syncup-live`'s `api(token, method, …)`); then, until
   * nothing new turns up, an alias of one, a property one was handed out as,
   * and a name bound to such a property.
   */
  const clients = new Map()
  for (const [name, vals] of bindings) {
    for (const v of vals) {
      if (factories.has(callOf(v.a, v.b))) clients.set(name, `a call of ${callOf(v.a, v.b)}`)
      if (fnOf(v) && callsFetch(fnOf(v)) && !factories.has(name)) clients.set(name, 'a function that calls fetch')
    }
  }
  const props = []
  for (const m of code.matchAll(/(?<![\w$])([A-Za-z_$][\w$]*)\s*:(?!:)/g)) {
    const before = skipBack(code, m.index - 1).i
    if (code[before] !== '{' && code[before] !== ',') continue
    const [a, b] = trimmed(code, m.index + m[0].length, endOf(m.index + m[0].length))
    props.push({ key: m[1], a, b })
  }
  const clientProps = new Set()
  for (let grew = true; grew; ) {
    grew = false
    for (const p of props) {
      if (clientProps.has(p.key)) continue
      const t = code.slice(p.a, p.b)
      if (factories.has(callOf(p.a, p.b)) || (IDENT.test(t) && clients.has(t))) {
        clientProps.add(p.key)
        grew = true
      }
    }
    // `{ id, as }`, where `as` is a client
    for (const name of clients.keys()) {
      if (clientProps.has(name)) continue
      const shorthand = new RegExp(`[{,]\\s*${name.replace(/\$/g, '\\$')}\\s*[,}]`)
      if (shorthand.test(code)) {
        clientProps.add(name)
        grew = true
      }
    }
    for (const [name, vals] of bindings) {
      if (clients.has(name) || factories.has(name)) continue
      for (const v of vals) {
        const t = code.slice(v.a, v.b)
        const prop = memberProp(v.a, v.b)
        let why = null
        if (IDENT.test(t) && clients.has(t)) why = `an alias of ${t}`
        else if (prop && clientProps.has(prop)) why = `a client handed out as .${prop}`
        else if (operandsOf(v.a, v.b).some((o) => clients.has(o))) why = 'one client or another'
        if (why) {
          clients.set(name, why)
          grew = true
          break
        }
      }
    }
  }

  const isClientCall = (c) => {
    if (c.member) return clientProps.has(c.name)
    if (clients.has(c.name)) return true
    if (!factories.has(c.name)) return false
    const k = skipFwd(code, c.close + 1).i // curried: apiAs(token)(…)
    return code[k] === '(' || (code[k] === '?' && code[k + 1] === '.' && code[skipFwd(code, k + 2).i] === '(')
  }
  const clientCalls = calls.filter(isClientCall).map((c) => c.at)
  const containsClientCall = (a, b) => clientCalls.some((p) => p >= a && p < b)

  /*
   * WRAPPERS: a name bound to a function that calls a client anywhere in it
   * (`restore`, `platformOn`, `cleanup`), and a for-of variable over an array
   * that such functions were pushed onto — the cleanup runner.
   */
  const wrappers = new Map()
  for (const [name, vals] of bindings) {
    if (clients.has(name) || factories.has(name)) continue
    for (const v of vals) if (fnOf(v) && containsClientCall(v.a, fnOf(v).end)) wrappers.set(name, 'a function that calls a client')
  }
  const pushed = new Set()
  for (const c of calls) {
    if (!c.member || (c.name !== 'push' && c.name !== 'unshift')) continue
    const onto = wordBefore(code, skipBack(code, skipBack(code, c.at - 1).i - 1).i)
    if (!onto.word || code[skipBack(code, onto.at - 1).i] === '.') continue
    const fnArg = ([x, y]) => fnAt.get(trimmed(code, x, y)[0])
    if (argSpans(code, c.open, c.close).some((s) => fnArg(s) && containsClientCall(fnArg(s).start, fnArg(s).end))) pushed.add(onto.word)
  }
  for (const m of code.matchAll(/(?<![\w$.])for\s*(?:await\s*)?\(/g)) {
    const close = matchForward(code, m.index + m[0].length - 1)
    const head = close > 0 && /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s+of\s+([\s\S]*?)\s*$/.exec(code.slice(m.index + m[0].length, close))
    if (!head) continue
    let over = head[2]
    // `cleanup.reverse()`, `cleanup.slice().reverse()`: the array under the calls
    for (let g; (g = /^([\s\S]*?)\s*\??\.\s*[A-Za-z_$][\w$]*\s*\([^()]*\)$/.exec(over)); ) over = g[1]
    if (pushed.has(over)) wrappers.set(head[1], `a loop over ${over}, which client-calling closures are pushed onto`)
  }

  /*
   * WHAT A CATCH IS ON. `.then(…)` and `.finally(…)` are stepped over. A call
   * is a client's, a curried factory's or a client property's (DIRECT);
   * `fetch`'s (FETCH); a wrapper's, or anything else with a client call inside
   * it (WRAPPED). A promise held in a name is followed to what it was bound
   * to. The rest — Playwright, SQL, teardown — is OTHER.
   */
  const directCall = (head, ops) => {
    const callee = ops.slice(0, -1)
    if (head.kind === 'name' && !callee.length) return clients.has(head.name)
    if (head.kind === 'name' && callee.length === 1 && callee[0].kind === 'call' && factories.has(head.name)) return true
    const last = callee[callee.length - 1]
    return last?.kind === 'prop' && clientProps.has(last.name)
  }
  const classify = ({ head, ops }) => {
    while (ops.length >= 2 && ops.at(-1).kind === 'call' && ops.at(-2).kind === 'prop' && THROUGH.has(ops.at(-2).name)) ops = ops.slice(0, -2)
    const last = ops.at(-1)
    const inside = () => containsClientCall(head.a, (last ?? head).b)
    if (last?.kind === 'call') {
      if (directCall(head, ops)) return 'DIRECT'
      if (head.kind === 'name' && ops.length === 1) {
        if (head.name === 'waitUntil') return 'OTHER' // lib/wait.mjs: it catches its predicate's throws, and never rejects
        if (head.name === 'fetch') return 'FETCH'
        if (wrappers.has(head.name)) return 'WRAPPED'
      }
      return inside() ? 'WRAPPED' : 'OTHER'
    }
    if (last?.kind === 'tag') return 'OTHER'
    if (!last && head.kind === 'name') {
      const vals = bindings.get(head.name) ?? []
      const held = (v) => {
        const ch = parseChain(code, v.a, v.b)
        return ch?.ops.at(-1)?.kind === 'call' && directCall(ch.head, ch.ops)
      }
      if (vals.some(held)) return 'DIRECT'
      return vals.some((v) => containsClientCall(v.a, v.b)) ? 'WRAPPED' : 'OTHER'
    }
    return inside() ? 'WRAPPED' : 'OTHER'
  }

  /*
   * WHAT A HANDLER IS: 'empty' (nothing in it, or a bare `return`), 'nullish'
   * (it hands back null or undefined), or null — it does something. A name is
   * followed to the functions bound to it.
   */
  const bodyKind = (f) => {
    if (f.block) {
      const body = code.slice(f.bodyStart + 1, f.end - 1).trim()
      if (/^(?:return\s*)?;?$/.test(body)) return 'empty'
      return /^return\s+\(*\s*(?:null|undefined|void\s+0)\s*\)*\s*;?$/.test(body) ? 'nullish' : null
    }
    return /^\(*\s*(?:null|undefined|void\s+0)\s*\)*$/.test(code.slice(f.bodyStart, f.end).trim()) ? 'nullish' : null
  }
  const handlerKind = (a, b) => {
    if (fnAt.has(a)) return fnAt.get(a).end === b ? bodyKind(fnAt.get(a)) : null
    const name = code.slice(a, b)
    if (!IDENT.test(name)) return null
    const kinds = (bindings.get(name) ?? []).map((v) => (fnOf(v) && fnOf(v).end === v.b ? bodyKind(fnOf(v)) : null))
    return kinds.length && kinds.every((k) => k && k === kinds[0]) ? kinds[0] : null
  }

  /*
   * WHETHER A VALUE IS THROWN AWAY: out through `await`, a group and
   * `.finally(…)`, which hand it on as it is, it is a statement of its own —
   * or `void`ed, or bound to a name that nothing in its function reads again.
   * Anything else reads it: a condition, an argument, a `return`, an operand.
   */
  const isGroup = (i) => {
    const p = skipBack(code, i - 1).i
    return !/[\w$)\]`]/.test(code[p] ?? '') || KEYWORDS.has(wordBefore(code, p).word)
  }
  const startsStatement = (prev, word) => {
    if (prev.i < 0) return true
    const c = code[prev.i]
    if (c === ';' || c === '{' || c === '}') return true
    if (word) return word === 'else' || word === 'do' || (prev.nl && !KEYWORDS.has(word))
    if (c === ')') return CONTROL.has(wordBefore(code, skipBack(code, matchBack(code, prev.i) - 1).i).word) || prev.nl
    return prev.nl && !/[=(\[{,?:&|+\-*/%<>!~^.]/.test(c)
  }
  const readAgain = (name, at) => {
    const scope = innermost(at) ?? { start: 0, end: code.length }
    const uses = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g')
    for (const m of code.slice(scope.start, scope.end).matchAll(uses)) {
      const i = scope.start + m.index
      if (i === at) continue
      const after = skipFwd(code, i + name.length).i
      if (code[after] === '=' && !/[=>]/.test(code[after + 1])) continue // written, not read
      if (/^(?:const|let|var)$/.test(wordBefore(code, skipBack(code, i - 1).i).word)) continue
      return true
    }
    return false
  }
  const thrownAway = (a, b) => {
    for (;;) {
      const next = skipFwd(code, b)
      const fin = /^\??\.\s*finally\s*\(/.exec(code.slice(next.i, next.i + 24))
      if (fin) {
        b = matchForward(code, next.i + fin[0].length - 1) + 1
        continue
      }
      const prev = skipBack(code, a - 1)
      const word = wordBefore(code, prev.i)
      if (word.word === 'await') {
        a = word.at
        continue
      }
      if (code[prev.i] === '(' && code[next.i] === ')' && matchForward(code, prev.i) === next.i && isGroup(prev.i)) {
        a = prev.i
        b = next.i + 1
        continue
      }
      break
    }
    const prev = skipBack(code, a - 1)
    const next = skipFwd(code, b)
    const word = wordBefore(code, prev.i).word
    if (word === 'void') return true
    const c = code[next.i]
    const ends = next.i >= code.length || c === ';' || c === '}' || (next.nl && !/[.?:&|+\-*/%,=<>(\[`^]/.test(c))
    if (ends && startsStatement(prev, word)) return true
    // `const gone = await A(…).catch(() => null)`, and `gone` never read again
    if (code[prev.i] === '=' && !/[=!<>+\-*/%&|^?]/.test(code[prev.i - 1]) && (ends || c === ',')) {
      const target = wordBefore(code, skipBack(code, prev.i - 1).i)
      if (!target.word || code[skipBack(code, target.at - 1).i] === '.') return false
      return !readAgain(target.word, target.at)
    }
    return false
  }

  const sites = []
  for (const c of calls) {
    if (!c.member || (c.name !== 'catch' && c.name !== 'then')) continue
    // `.then(ok, h)` catches with its second argument, exactly as `.then(ok).catch(h)` would
    const handler = argSpans(code, c.open, c.close)[c.name === 'catch' ? 0 : 1]
    const kind = handler ? handlerKind(...trimmed(code, ...handler)) : null
    if (!kind) continue
    const dot = skipBack(code, c.at - 1).i
    const start = chainStart(code, dot)
    const chain = parseChain(code, start, code[dot - 1] === '?' ? dot - 1 : dot)
    const cls = chain ? classify(chain) : 'OTHER'
    if (cls === 'OTHER') continue
    if (kind === 'nullish' && !thrownAway(start, c.close + 1)) continue
    const text = src.slice(start, c.close + 1).replace(/\s+/g, ' ')
    sites.push({ line: lineOf(start), cls, kind, text: text.length > 120 ? `${text.slice(0, 119)}…` : text })
  }
  return { sites, clean }
}

/** The gate over one directory: every site and problem, and how many suites were read. */
export function scan(dir) {
  const problems = []
  const sites = []
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
    const found = inertCatchesIn(readFileSync(join(dir, file), 'utf8'))
    if (!found.clean) {
      problems.push(`${file}  could not be read as JavaScript — it ends inside a string, comment or template, so any answer about it would be a guess`)
      continue
    }
    for (const s of found.sites) sites.push({ file, ...s })
  }
  return { problems, sites, suites: files.length }
}

function report({ problems, sites, suites }) {
  for (const p of problems) console.log(`✗ ${p}`)
  for (const s of sites) console.log(`✗ ${s.file}:${s.line}  ${s.cls}  ${s.text}`)
  if (problems.length || sites.length) {
    const of = (cls) => sites.filter((s) => s.cls === cls).length
    console.error(
      `\n[api-catches] ${sites.length} inert catch(es) on an API client in ${new Set(sites.map((s) => s.file)).size} suite(s): ` +
        `${of('DIRECT')} direct, ${of('WRAPPED')} wrapped, ${of('FETCH')} raw fetch` +
        `${problems.length ? `; and ${problems.length} other problem(s)` : ''}.\n` +
        'An API client answers every HTTP status with `{ status, data, error }` and rejects only when the API is\n' +
        'not there, so a catch that swallows on one hides both. Read the status instead: a cleanup DELETE accepts\n' +
        '200, 204 or 404 and prints anything else; a restore or a setup of shared state is a counted check; a\n' +
        'cleanup runner calls each closure in a try and prints what did not answer. A catch whose value is read\n' +
        'on the next line (`const res = await fetch(…).catch(() => null)`, then `if (!res)`) is not refused.',
    )
    process.exitCode = 1
    return false
  }
  console.log(`[api-catches] ok — ${suites} suite(s) read, 0 inert catch(es) on an API client`)
  return true
}

/*
 * THE PLANTED SUITES. Each gets a directory of its own, and the gate — this
 * file, or under `--mutate` a broken copy of it — runs over it as a child,
 * exactly as it runs over `test/e2e`. Most start with a local client, its own
 * `fetch(…).catch(() => null)` read on the next line, so every case also
 * proves a client's own sentinel passes; the planted line is then line 8.
 */
const CLIENT = [
  'const apiAs = (token) => async (route, init = {}) => {',
  '  const res = await fetch(`${API}${route}`, { ...init, headers: { authorization: `Bearer ${token}` } }).catch(() => null)',
  "  if (!res) return { status: 0, data: null, error: { message: 'no answer' } }",
  '  return { status: res.status, data: (await res.json().catch(() => null))?.data }',
  '}',
  'let A = null',
  'A = apiAs(auth.accessToken)',
]
const suite = (...lines) => ({ 'c.mjs': [...CLIENT, ...lines].join('\n') })
const alone = (...lines) => ({ 'c.mjs': lines.join('\n') })
const CASES = [
  ['caught', 'direct: a cleanup DELETE on the client, in a finally', suite(
    'try {',
    "  chk(true, 'x')",
    '} finally {',
    "  if (WS && A) await A(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})",
    '}',
  ), /✗ c\.mjs:11 {2}DIRECT {2}A\(`\/workspaces\//],
  ['caught', 'wrapped: a cleanup runner over pushed closures', suite(
    'const cleanup = []',
    "cleanup.push(() => A(`/tasks/${id}`, { method: 'DELETE' }))",
    'for (const fn of cleanup.reverse()) await fn().catch(() => {})',
  ), /✗ c\.mjs:10 {2}WRAPPED {2}fn\(\)\.catch/],
  ['caught', 'wrapped: a restore closure, called if it was set', suite(
    'let restore = null',
    "restore = async () => { await A('/users/me', { method: 'PATCH', body: { panelsCollapsed: {} } }) }",
    'await restore?.().catch(() => {})',
  ), /✗ c\.mjs:10 {2}WRAPPED {2}restore\?\.\(\)/],
  ['caught', 'fetch: a raw fetch to the API', suite(
    "await fetch(`${API}/workspaces/${WS}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }).catch(() => {})",
  ), /✗ c\.mjs:8 {2}FETCH {2}fetch\(/],
  ['caught', 'direct: an alias of a client, over three lines', suite(
    'let cleanupA = null',
    'cleanupA = A',
    'await cleanupA(`/workspaces/${WS}/members/${id}`, {',
    "  method: 'DELETE',",
    '}).catch(() => {})',
  ), /✗ c\.mjs:10 {2}DIRECT {2}cleanupA\(/],
  ['caught', 'direct: a client call through .then(…)', suite(
    "await A('/users/me').then((r) => r.data).catch(() => {})",
  ), /✗ c\.mjs:8 {2}DIRECT {2}A\('\/users\/me'\)\.then/],
  ['caught', 'direct: a client handed out as a property', suite(
    'const person = async (key) => {',
    '  const signed = await signUpApi(API, { email: key })',
    '  return { id: signed.user?.id, as: apiAs(signed.accessToken) }',
    '}',
    "const stranger = await person('stranger')",
    "await stranger.as(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})",
  ), /✗ c\.mjs:13 {2}DIRECT {2}stranger\.as\(/],
  ['caught', 'direct: a curried factory call', suite(
    "await apiAs(token)('/users/me', { method: 'PATCH', body: { mute: false } }).catch(() => {})",
  ), /✗ c\.mjs:8 {2}DIRECT {2}apiAs\(token\)\(/],
  ['caught', "direct: lib/fixture.mjs's apiClient, under a function handler", alone(
    "import { apiClient } from './lib/fixture.mjs'",
    'const api = apiClient(`${B}/api/v1`, auth.accessToken)',
    "await api(`/tasks/${id}`, { method: 'DELETE' }).catch(function () {})",
  ), /✗ c\.mjs:3 {2}DIRECT {2}api\(/],
  ['caught', 'direct: a helper that calls fetch itself', alone(
    'const api = async (token, method, route) => {',
    '  const r = await fetch(`${API}${route}`, { method, headers: { authorization: `Bearer ${token}` } })',
    '  return { status: r.status }',
    '}',
    "await api(token, 'DELETE', `/workspaces/${WS}`).catch(() => {})",
  ), /✗ c\.mjs:5 {2}DIRECT {2}api\(token/],
  ['caught', 'direct: a factory by another name', alone(
    'const client = (token) => async (route, init = {}) => {',
    '  const r = await fetch(`${API}${route}`, { ...init, headers: { authorization: `Bearer ${token}` } })',
    '  return { status: r.status }',
    '}',
    'const Z = client(token)',
    "await Z(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})",
  ), /✗ c\.mjs:6 {2}DIRECT {2}Z\(/],
  ['caught', 'direct: a handler that hands back null, the value thrown away', suite(
    "if (id) await A(`/tasks/${id}`, { method: 'DELETE' }).catch(() => null)",
  ), /✗ c\.mjs:8 {2}DIRECT {2}A\(.*\(\) => null\)/],
  ['caught', 'direct: null bound to a name nothing reads again', suite(
    "const gone = await A(`/tasks/${id}`, { method: 'DELETE' }).catch(() => null)",
    "console.log('cleaned up')",
  ), /✗ c\.mjs:8 {2}DIRECT {2}A\(/],
  ['caught', 'direct: an empty handler held in a name', suite(
    'const ignore = () => {}',
    "await A(`/tasks/${id}`, { method: 'DELETE' }).catch(ignore)",
  ), /✗ c\.mjs:9 {2}DIRECT {2}A\(.*catch\(ignore\)/],
  ['caught', 'direct: a handler holding nothing but a comment', suite(
    "await A(`/tasks/${id}`, { method: 'DELETE' }).catch((err) => { /* the stack is going down anyway */ })",
  ), /✗ c\.mjs:8 {2}DIRECT {2}/],
  ['caught', "direct: an empty rejection handler as .then's second argument", suite(
    "await A('/users/me', { method: 'PATCH', body: { mute: false } }).then((r) => r.data, () => {})",
  ), /✗ c\.mjs:8 {2}DIRECT {2}A\('\/users\/me'.*\.then\(\(r\) => r\.data, \(\) => \{\}\)/],
  ['caught', 'a directory with no suites in it', { 'README.md': 'nothing' }, /below the floor/],
  ['caught', 'a suite that does not lex to a clean end', suite('const t = `left open ${WS}'), /could not be read as JavaScript/],
  ['passes', 'a Playwright click and a load state bounded by a catch, beside a client', suite(
    "await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})",
    "await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})",
  )],
  ['passes', 'SQL, a browser and a pool, closed under a catch', suite(
    'await sql`delete from tasks where id = ${id}`.catch(() => {})',
    'await browser?.close().catch(() => {})',
    'await sql.end({ timeout: 5 }).catch(() => {})',
  )],
  ['passes', 'the fixed forms: a status read, a sentinel read, a runner that reports', suite(
    'const cleanup = []',
    "cleanup.push(() => A(`/tasks/${id}`, { method: 'DELETE' }))",
    'if (WS && A) {',
    "  const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })",
    "  if (![200, 204, 404].includes(gone.status)) console.log(`cleanup left behind: ${gone.status || 'nothing'}`)",
    '}',
    "const left = await fetch(`${API}/workspaces/${WS}`, { method: 'DELETE' }).catch(() => null)",
    "if (![200, 204, 404].includes(left?.status)) console.log('cleanup left behind')",
    "const seen = (await A('/users/me').catch(() => null))?.data",
    'const bytes = url ? await fetch(url).then(async (r) => (r.ok ? await r.text() : null), () => null) : null',
    "chk(bytes !== null, 'the file is served')",
    'for (const fn of cleanup.reverse()) {',
    '  try {',
    '    const r = await fn()',
    '    if (![200, 204, 404].includes(r.status)) console.log(`left behind: ${r.status}`)',
    '  } catch (err) {',
    '    console.log(`no answer: ${err.message}`)',
    '  }',
    '}',
    "chk(seen !== undefined, 'the admin is there')",
  )],
  ['passes', 'a handler that does something', suite(
    "await A('/users/me').catch((err) => console.log(`no answer: ${err.message}`))",
    "const r = await A('/users/me').catch(() => ({ status: 0 }))",
    "await A('/users/me').catch(() => { failed += 1 })",
    "chk(r.status === 200, 'the admin is there')",
  )],
  ['passes', 'the shape in a comment, a string, a template and a regex', suite(
    "// await A('/x').catch(() => {})",
    "/* await A('/y').catch(() => {}) */",
    'const said = "await A(\'/x\').catch(() => {})"',
    "const tpl = `await A('/x').catch(() => {}) ${WS}`",
    'const re = /A(1).catch(() => {})/',
    "chk(re.test(said) && tpl.length > 0, 'nothing here calls the API')",
  )],
  ['passes', 'waitUntil around a client, which never rejects', suite(
    "await waitUntil(async () => (await A('/users/me')).status === 200, { timeoutMs: 5000 }).catch(() => {})",
  )],
]

function runCases(gate) {
  let fail = 0
  const seen = {}
  console.log(`\n▶ planted suites, each run through ${gate === SELF ? 'this gate' : 'the gate under test'}`)
  for (const [want, name, files, pattern] of CASES) {
    const dir = mkdtempSync(join(tmpdir(), 'api-catches-'))
    let r
    try {
      for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, path)), { recursive: true })
        writeFileSync(join(dir, path), `${text}\n`)
      }
      const env = { ...process.env, SUITE_DIR: dir }
      delete env.API_CATCHES_UNDER_TEST
      r = spawnSync(process.execPath, [gate], { encoding: 'utf8', env, timeout: 60_000 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
    const ok = want === 'caught' ? r.status === 1 && pattern.test(out) : r.status === 0 && /\[api-catches\] ok/.test(out)
    seen[name] = { ok, first: out.split('\n').find((l) => l.startsWith('✗') || l.startsWith('[api-catches] ok')) ?? '' }
    if (ok) console.log(`  \x1b[32mPASS\x1b[0m ${want === 'caught' ? 'caught' : 'passes'}: ${name}`)
    else {
      fail += 1
      console.log(`  \x1b[31mFAIL\x1b[0m ${want === 'caught' ? 'not caught' : 'did not pass'}: ${name} — exit ${r.status}: ${out.trim().split('\n')[0]}`)
    }
  }
  console.log(`\n${CASES.length - fail} passed, ${fail} failed`)
  return { fail, seen }
}

if (process.env.API_CATCHES_UNDER_TEST) {
  // One pass of the cases against a broken copy, started by `proveMutationsBite` below.
  process.exitCode = runCases(process.env.API_CATCHES_UNDER_TEST).fail ? 1 : 0
} else {
  const realOk = report(scan(SUITES))
  if (process.argv.includes('--mutate')) {
    const { fail, seen } = runCases(SELF)
    const planted = seen[CASES[0][1]]
    const click = seen[CASES.find(([want]) => want === 'passes')[1]]
    console.log(
      `[api-catches] mutate: the planted cleanup DELETE was ${planted.ok ? 'caught' : 'NOT caught'} — ${planted.first}\n` +
        `[api-catches] mutate: a Playwright click bounded by the same catch ${click.ok ? 'passes' : 'does NOT pass'} — ${click.first}`,
    )
    const alive = (mutant) => {
      const r = spawnSync(process.execPath, [mutant], { encoding: 'utf8', timeout: 120_000 })
      return { ok: /\[api-catches\]|✗/.test(r.stdout ?? ''), why: r.stderr }
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
      envVar: 'API_CATCHES_UNDER_TEST',
      label: 'this gate',
      alive,
      mutations: [
        ['aliases-not-followed', at("if (IDENT.test(t) && clients.has(t)) why = `an alias ", 'of ${t}`'), "if (false) why = ''"],
        ['wrapped-ignored', at("if (wrappers.has(head.name)) return ", "'WRAPPED'"), "if (false) return 'WRAPPED'"],
        ['runners-not-followed', at('if (pushed.has(over)) ', 'wrappers.set('), 'if (false) wrappers.set('],
        ['then-not-followed', at('while (ops.length >= 2 && ops.at(-1).kind === ', "'call'"), "while (false && ops.at(-1).kind === 'call'"],
        ['fetch-ignored', at("if (head.name === 'fetch') ", "return 'FETCH'"), "if (false) return 'FETCH'"],
        ['props-not-followed', at('        clientProps.add(p.key)\n', '        grew = true\n'), ''],
        ['curried-not-followed', at("callee.length === 1 && callee[0].kind === 'call' && ", 'factories.has(head.name)) return true'), 'false) return true'],
        ['fetch-helpers-not-clients', at("if (fnOf(v) && callsFetch(fnOf(v)) && !factories.has(name)) ", 'clients.set('), 'if (false) clients.set('],
        ['factories-by-name-only', at('if (f && !callsFetch(f) && [...fetchers].some(', '(g) =>'), 'if (false && [...fetchers].some((g) =>'],
        ['lib-client-unknown', at("const FACTORIES = ['apiAs', ", "'apiClient']"), "const FACTORIES = ['apiAs']"],
        ['null-handlers-pass', at("return /^\\(*\\s*(?:null|undefined|void\\s+0)\\s*\\)*$/.test(code.slice(f.bodyStart, f.end).trim()) ? ", "'nullish' : null"), 'return null'],
        ['unread-names-read', at('return !readAgain(', 'target.word, target.at)'), 'return false'],
        ['every-null-thrown-away', at('if (kind === ', "'nullish' && !thrownAway(start, c.close + 1)) continue"), 'if (false) continue'],
        ['then-rejections-pass', at("if (!c.member || (c.name !== 'catch' && ", "c.name !== 'then')) continue"), "if (!c.member || c.name !== 'catch') continue"],
        ['named-handlers-pass', at('const name = code.slice(a, b)\n', '    if (!IDENT.test(name)) return null'), 'return null'],
        ['waituntil-rejects', at("if (head.name === 'waitUntil') ", "return 'OTHER'"), 'if (false) return'],
        ['every-call-the-api', at("      return inside() ? 'WRAPPED' : 'OTHER'\n    }\n", "    if (last?.kind === 'tag')"), "      return 'WRAPPED'\n    }\n    if (last?.kind === 'tag')"],
        ['strings-are-code', at("        if (c === quote) prev = c\n        word = ''\n      } else ", 'blank(i)'), "        if (c === quote) prev = c\n        word = ''\n      }"],
        ['templates-are-code', at("        i += 1\n      } else ", 'blank(i, false)'), '        i += 1\n      }'],
        ['regexes-are-code', at("        prev = ')' // a regex literal is a value: a `/` after it divides\n        word = ''\n      } else ", 'blank(i)'), "        prev = ')'\n        word = ''\n      }"],
        ['comments-are-code', at("      if (c === '\\n') mode = 'code'\n", '      else blank(i)'), "      if (c === '\\n') mode = 'code'"],
        ['unlexed-read-anyway', at('    if (!found.clean) ', '{'), '    if (false) {'],
        ['no-floor', at('const MIN_SUITES = ', 'process.env.SUITE_DIR ? 1 : 100'), 'const MIN_SUITES = 0'],
        ['violations-exit-zero', at('    process.exitCode = 1\n', '    return false'), '    process.exitCode = 0\n    return false'],
      ],
    })
    if (!realOk || fail || blind) process.exitCode = 1
  }
}
