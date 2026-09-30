#!/usr/bin/env node
/*
 * A SUITE THAT MAKES A PERSON HANDS THEM TO THE CLEANUP
 * (`found-30-sep/suite-runs-leave-accounts-behind`).
 *
 * `test/e2e/lib/made.mjs` removes, when a run ends, every account the run
 * registered, with the organization and personal workspace sign-up made it,
 * and the next run sweeps what a killed one registered. What is not registered
 * stays: on lane 6, 30 September, 651 `@rundesk.invalid` accounts had.
 * `signUpApi` registers each person it makes. This gate refuses the other
 * ways a suite makes one without registering them.
 *
 * THE RULES, over every suite (`test/e2e/*.mjs`) read as JavaScript:
 *
 *   SITE   a string or template holding a route that makes an account —
 *          `/auth/signup`, or `/invitations/claim` (which makes one for an
 *          invitee without one) — or SQL text `insert into users`. Named in
 *          a comment it is no site; `signUpApi(…)` names none.
 *   RULE   each site has a `madeAccount(` call of its own, as code, BEFORE it
 *          and AFTER the site before it in the same function, in the site's
 *          block or a block around it out to that function's body (the file
 *          at the top level). Object literals are looked through (a route in
 *          `ROUTES = { signup: { path: '/auth/signup' } }` counts the block the
 *          object is made in); a sibling function's registration does not
 *          count, nor one outside the helper that makes the account. "Of its
 *          own", because one registration early in a long block covered every
 *          account the block went on to make: the invitation
 *          `sign-in-and-password` claims for a newcomer, added on 30 September,
 *          passed a looser rule and would have been left.
 *   AND    a helper with no braces is a helper: an arrow whose body is an
 *          expression (`(email) => fetch('/auth/signup', …)`, `.map((w) =>
 *          visit('/invitations/claim', …))`) is a function boundary as a braced
 *          one is, and so is a loop's body, braced or not (`for (…) await
 *          fetch('/auth/signup')`) — each is run for many accounts, and one
 *          registration outside it stands for one. The first cut stopped only
 *          at a `{`, and one `madeAccount(` before `const signUp = (email) =>
 *          fetch(…)` passed for every person `signUp` went on to make. A
 *          registration inside a brace-less loop still counts for a site after
 *          the loop (thirty registered, then thirty inserted by SQL).
 *   LIB    `signUpApi` in `test/e2e/lib/signin.mjs` calls `madeAccount(` in
 *          its own body before its `fetch(`, so every person it makes is
 *          registered before they are asked for.
 *
 * READ AS CODE: comments, strings, regex literals and template text are told
 * apart before anything is matched, so a route in a sentence is not a site, a
 * `madeAccount(` in a string registers nothing, and a brace in a string or a
 * template's `${` opens no block. A suite that does not lex to a clean end is
 * reported, not guessed at.
 *
 * A GATE THAT READ NOTHING ANSWERS ok AS SURELY AS ONE THAT READ EVERYTHING:
 * fewer than 100 suites read is a failure (1 under `SUITE_DIR`).
 *
 *   node scripts/check-suite-made-registered.mjs
 *   SUITE_DIR=<dir> LIB_DIR=<dir> node scripts/check-suite-made-registered.mjs
 *
 * `check-suite-made-registered-cases.mjs [--mutate]` plants suites to fool it
 * and breaks it one rule at a time.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SUITES = process.env.SUITE_DIR ?? join(HERE, '..', 'test', 'e2e')
const LIB = process.env.LIB_DIR ?? join(SUITES, 'lib')
const MIN_SUITES = process.env.SUITE_DIR ? 1 : 100
const KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'await', 'yield'])

/** Routes and SQL that make an account. */
const SITE = /\/auth\/signup\b|\/invitations\/claim\b|\binsert\s+into\s+users\b/gi

/*
 * Each character of `src` with what it is: `c` code, `m` comment, `s` string,
 * `t` template text, `r` regex. A template's `${` and its closing `}` are
 * template, so only code braces open and close blocks. `clean` says whether
 * the walk ended outside every string, comment and template.
 */
export function classify(src) {
  const kind = new Array(src.length).fill('c')
  const frames = []
  let mode = 'c'
  let quote = ''
  let inClass = false
  let prev = ''
  let word = ''
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    const n = src[i + 1]
    if (mode === 'c') {
      if (c === '/' && (n === '/' || n === '*')) {
        mode = n === '/' ? 'line' : 'block'
        kind[i] = kind[i + 1] = 'm'
        i += 1
        continue
      }
      if (/\s/.test(c)) continue
      if (c === "'" || c === '"') {
        mode = 's'
        quote = c
        kind[i] = 's'
        continue
      }
      if (c === '`') {
        mode = 't'
        kind[i] = 't'
        continue
      }
      if (c === '/' && (prev === '' || (/[\w$]/.test(prev) ? KEYWORDS.has(word) : !/[)\]'"`]/.test(prev)))) {
        mode = 'r'
        inClass = false
        kind[i] = 'r'
        continue
      }
      if (c === '{' && frames.length) frames[frames.length - 1] += 1
      if (c === '}' && frames.length) {
        if (frames[frames.length - 1] === 0) {
          frames.pop()
          mode = 't'
          kind[i] = 't'
          continue
        }
        frames[frames.length - 1] -= 1
      }
      word = /[\w$]/.test(c) ? (/[\w$]/.test(src[i - 1] ?? '') ? word + c : c) : ''
      prev = c
    } else if (mode === 'line') {
      if (c === '\n') mode = 'c'
      else kind[i] = 'm'
    } else if (mode === 'block') {
      kind[i] = 'm'
      if (c === '*' && n === '/') {
        kind[i + 1] = 'm'
        i += 1
        mode = 'c'
      }
    } else if (mode === 's') {
      kind[i] = 's'
      if (c === '\\') {
        kind[i + 1] = 's'
        i += 1
      } else if (c === quote || c === '\n') {
        mode = 'c'
        if (c === quote) prev = c
        word = ''
      }
    } else if (mode === 't') {
      kind[i] = 't'
      if (c === '\\') {
        kind[i + 1] = 't'
        i += 1
      } else if (c === '`') {
        mode = 'c'
        prev = c
        word = ''
      } else if (c === '$' && n === '{') {
        kind[i + 1] = 't'
        frames.push(0)
        mode = 'c'
        prev = '{'
        word = ''
        i += 1
      }
    } else if (mode === 'r') {
      kind[i] = 'r'
      if (c === '\\') {
        kind[i + 1] = 'r'
        i += 1
      } else if (c === '\n') mode = 'c'
      else if (inClass) {
        if (c === ']') inClass = false
      } else if (c === '[') inClass = true
      else if (c === '/') {
        mode = 'c'
        prev = ')'
        word = ''
      }
    }
  }
  return { kind, clean: mode === 'c' && frames.length === 0 }
}

/*
 * Whether the code brace at `k` opens an object literal rather than a block:
 * what comes before it is an operator or punctuation that takes a value (`=`,
 * `(`, `,`, `:`, `[`, `?`, `!`, `&`, `|`), or a word that does (`return`,
 * `await`). `=> {`, `) {`, `else {`, `try {` open blocks.
 */
function opensObject(src, kind, k) {
  let p = k - 1
  while (p >= 0 && (kind[p] === 'm' || /\s/.test(src[p]))) p -= 1
  if (p < 0) return false
  if (kind[p] !== 'c') return false
  if ('(,:=[?!&|'.includes(src[p])) return true
  const word = /[\w$]+$/.exec(src.slice(Math.max(0, p - 12), p + 1))?.[0]
  return word === 'return' || word === 'await' || word === 'yield'
}

/**
 * `[open, close]` of the innermost block holding `at` — a function's body, a
 * `try`, an `if`, not an object literal — or the whole file.
 */
function blockOf(src, kind, at) {
  let depth = 0
  for (let k = at; k >= 0; k--) {
    if (kind[k] !== 'c') continue
    if (src[k] === '}') depth += 1
    else if (src[k] === '{') {
      if (depth > 0) depth -= 1
      else if (!opensObject(src, kind, k)) {
        let d = 0
        for (let e = k; e < src.length; e++) {
          if (kind[e] !== 'c') continue
          if (src[e] === '{') d += 1
          else if (src[e] === '}' && --d === 0) return [k, e]
        }
        return [k, src.length]
      }
    }
  }
  return [0, src.length]
}

/** The index of the first character at or after `i` that is neither white space nor comment, or -1. */
function nextCode(src, kind, i) {
  for (; i < src.length; i++) if (kind[i] !== 'm' && !/\s/.test(src[i])) return i
  return -1
}
/** The same, walking back from `i`. */
function prevCode(src, kind, i) {
  for (; i >= 0; i--) if (kind[i] !== 'm' && !/\s/.test(src[i])) return i
  return -1
}

/* What a line may end with, or the next begin with, and the expression go on. */
const GOES_ON_AFTER = new Set([...'=<>+-*/%&|^!~?:.'])
const GOES_ON_BEFORE = new Set([...'.?:+-*/%&|^=<>(['])
const WORDS_GOING_ON = new Set(['await', 'typeof', 'new', 'in', 'of', 'instanceof', 'void', 'delete', 'yield'])

/*
 * Where the expression (or lone statement) starting at `from` ends: a `,` or
 * `;` at its own depth, a bracket closing one opened before it, or a line end
 * that neither the line nor the next one carries on past (the suites write no
 * semicolons). Brackets in strings, comments and template text do not count.
 */
function exprEnd(src, kind, from) {
  let depth = 0
  let last = -1
  for (let i = from; i < src.length; i++) {
    if (kind[i] === 'm') continue
    if (kind[i] !== 'c') {
      last = i
      continue
    }
    const c = src[i]
    if (c === '\n' && depth === 0) {
      if (last >= 0 && kind[last] === 'c') {
        if (GOES_ON_AFTER.has(src[last])) continue
        if (WORDS_GOING_ON.has(/[\w$]+$/.exec(src.slice(Math.max(0, last - 11), last + 1))?.[0])) continue
      }
      const n = nextCode(src, kind, i + 1)
      if (n < 0 || !(kind[n] === 't' || GOES_ON_BEFORE.has(src[n]))) return i
      continue
    }
    if (/\s/.test(c)) continue
    if (c === '(' || c === '[' || c === '{') depth += 1
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return i
      depth -= 1
    } else if (depth === 0 && (c === ',' || c === ';')) return i
    last = i
  }
  return src.length
}

/** `[start, end)` of every arrow whose body is an expression, not a block. */
function arrowBodies(src, kind) {
  const out = []
  for (let i = 0; i + 1 < src.length; i++) {
    if (src[i] !== '=' || src[i + 1] !== '>' || kind[i] !== 'c' || kind[i + 1] !== 'c') continue
    const b = nextCode(src, kind, i + 2)
    if (b < 0 || (src[b] === '{' && kind[b] === 'c')) continue
    out.push([b, exprEnd(src, kind, b)])
  }
  return out
}

/** The code bracket closing the one at `open`, or -1. */
function closing(src, kind, open) {
  const pair = { '(': ')', '{': '}', '[': ']' }[src[open]]
  let d = 0
  for (let k = open; k < src.length; k++) {
    if (kind[k] !== 'c') continue
    if (src[k] === src[open]) d += 1
    else if (src[k] === pair && --d === 0) return k
  }
  return -1
}
/** The code bracket opening the one at `close`, or -1. */
function opening(src, kind, close) {
  const pair = { ')': '(', '}': '{', ']': '[' }[src[close]]
  let d = 0
  for (let k = close; k >= 0; k--) {
    if (kind[k] !== 'c') continue
    if (src[k] === src[close]) d += 1
    else if (src[k] === pair && --d === 0) return k
  }
  return -1
}

/*
 * Every loop's body: `braced`, the index of each `{` that opens one; `bare`,
 * `[start, end)` of each that is one statement with no braces. The `while` of
 * `do { … } while (…)` is the end of a loop, not one of its own.
 */
function loopBodies(src, kind) {
  const braced = new Set()
  const bare = []
  for (const m of src.matchAll(/(?<![\w$.])(for|while|do)(?![\w$])/g)) {
    if (kind[m.index] !== 'c') continue
    let b
    if (m[1] === 'do') {
      b = nextCode(src, kind, m.index + 2)
      if (b < 0 || ':,()=;'.includes(src[b])) continue // a key or a name called `do`, not a loop
    } else {
      if (m[1] === 'while') {
        const p = prevCode(src, kind, m.index - 1)
        const o = p >= 0 && src[p] === '}' && kind[p] === 'c' ? opening(src, kind, p) : -1
        const w = o > 0 ? prevCode(src, kind, o - 1) : -1
        if (w >= 1 && src.slice(w - 1, w + 1) === 'do' && !/[\w$]/.test(src[w - 2] ?? '')) continue
      }
      let h = nextCode(src, kind, m.index + m[1].length)
      if (m[1] === 'for' && h >= 0 && src.startsWith('await', h)) h = nextCode(src, kind, h + 5)
      if (h < 0 || src[h] !== '(' || kind[h] !== 'c') continue
      const close = closing(src, kind, h)
      if (close < 0) continue
      b = nextCode(src, kind, close + 1)
    }
    if (b < 0) continue
    if (src[b] === '{' && kind[b] === 'c') braced.add(b)
    else bare.push([b, exprEnd(src, kind, b)])
  }
  return { braced, bare }
}

/*
 * Whether the block opening at `open` is a function's body: after `=>`, or
 * after a `)` whose `(` follows no `if`/`for`/`while`/`switch`/`catch`/`with`,
 * and not after `else`/`try`/`finally`/`do`.
 */
function isFunctionBody(src, kind, open) {
  let p = open - 1
  while (p >= 0 && (kind[p] === 'm' || /\s/.test(src[p]))) p -= 1
  if (p < 0) return false
  if (src[p] === '>' && src[p - 1] === '=') return true
  if (src[p] === ')') {
    let d = 0
    for (let k = p; k >= 0; k--) {
      if (kind[k] !== 'c') continue
      if (src[k] === ')') d += 1
      else if (src[k] === '(' && --d === 0) {
        const before = /([\w$]+)\s*$/.exec(src.slice(Math.max(0, k - 16), k))?.[1]
        return !['if', 'for', 'while', 'switch', 'catch', 'with'].includes(before)
      }
    }
    return false
  }
  const word = /[\w$]+$/.exec(src.slice(Math.max(0, p - 12), p + 1))?.[0]
  return !['else', 'try', 'finally', 'do'].includes(word)
}

/*
 * The innermost region holding `at`: a braced block (`block`), the body of an
 * arrow with no braces (`arrow`), with `bare` the lone statement of a loop with
 * no braces (`loop`), or the file. A registration's region is read without
 * `bare`: registering thirty in a brace-less loop, then inserting the thirty,
 * registers in the block the loop is in.
 */
function regionOf(ctx, at, withBare) {
  const { src, kind } = ctx
  let span = blockOf(src, kind, at)
  let type = span[0] === 0 && span[1] === src.length ? 'file' : 'block'
  for (const r of ctx.arrows) if (r[0] <= at && at < r[1] && r[0] > span[0]) [span, type] = [r, 'arrow']
  if (withBare) for (const r of ctx.bare) if (r[0] <= at && at < r[1] && r[0] > span[0]) [span, type] = [r, 'loop']
  return { span, type }
}

/**
 * The regions a registration may stand in for the site at `at`: the site's own
 * and each block around it, out to the function or loop whose body holds it
 * (the file, at the top level). Not a sibling's block, not another function,
 * not outside a loop or an arrow's expression. The last says which it was.
 */
function registeringBlocks(ctx, at) {
  const { src, kind } = ctx
  const chain = []
  let r = regionOf(ctx, at, true)
  for (;;) {
    chain.push(r)
    if (r.type !== 'block') break
    if (isFunctionBody(src, kind, r.span[0]) || ctx.loops.has(r.span[0])) {
      if (ctx.loops.has(r.span[0])) r.type = 'loop'
      break
    }
    r = regionOf(ctx, r.span[0] - 1, true)
  }
  return chain
}

/** Where `name(` is called as code, as indices. */
function callsOf(src, kind, name) {
  const at = []
  const re = new RegExp(`(?<![\\w$.])${name}\\s*\\(`, 'g')
  for (const m of src.matchAll(re)) if (kind[m.index] === 'c') at.push(m.index)
  return at
}

const lineOf = (src, i) => src.slice(0, i).split('\n').length

/** The sites of one suite, each with whether its block registers. */
export function sitesOf(src) {
  const { kind, clean } = classify(src)
  const loops = loopBodies(src, kind)
  const ctx = { src, kind, arrows: arrowBodies(src, kind), bare: loops.bare, loops: loops.braced }
  const registers = callsOf(src, kind, 'madeAccount').map((at) => ({ at, block: regionOf(ctx, at, false).span }))
  const sites = []
  // The last site seen in each function or loop (keyed by the outermost region of its chain).
  const lastIn = new Map()
  for (const m of src.matchAll(SITE)) {
    if (kind[m.index] !== 's' && kind[m.index] !== 't') continue
    const chain = registeringBlocks(ctx, m.index)
    const fn = chain[chain.length - 1].span.join(':')
    const after = lastIn.get(fn) ?? -1
    lastIn.set(fn, m.index)
    // Before the site, so a run killed while the account is on its way has said
    // whose it is; and after the site before it in the same function, so one
    // registration does not stand for every account a long block goes on to make.
    const registered = registers.some((r) => r.at > after && r.at < m.index && chain.some(({ span: [o, c] }) => r.block[0] === o && r.block[1] === c))
    sites.push({ line: lineOf(src, m.index), what: m[0], registered, inside: chain[chain.length - 1].type })
  }
  return { clean, sites }
}

const problems = []
const names = existsSync(SUITES)
  ? readdirSync(SUITES, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.mjs')).map((e) => e.name).sort()
  : []
if (!existsSync(SUITES)) problems.push(`there is no suite directory at ${SUITES}`)
else if (names.length < MIN_SUITES) problems.push(`only ${names.length} suite(s) read under ${SUITES}, below the floor of ${MIN_SUITES}`)

let making = 0
let siteCount = 0
for (const name of names) {
  const src = readFileSync(join(SUITES, name), 'utf8')
  const { clean, sites } = sitesOf(src)
  if (!clean) {
    problems.push(`${name} does not read to a clean end as JavaScript — its sites cannot be told from its sentences`)
    continue
  }
  if (sites.length) making += 1
  siteCount += sites.length
  for (const s of sites) {
    if (!s.registered) {
      const where = { arrow: ' (it is in an arrow’s expression, run once for each account it makes: give the arrow a body that registers)', loop: ' (it is in a loop, run once for each account it makes: register inside the loop)' }[s.inside] ?? ''
      problems.push(`${name}:${s.line} makes an account (\`${s.what}\`) with no madeAccount( in the block that holds it${where} — register the person (or use signUpApi), or the run leaves them`)
    }
  }
}

/*
 * THE ONE HELPER REGISTERS. `signUpApi` is how 120-odd suites make people; if
 * it stopped registering them every one of those suites would leave its people
 * again, and none of them names a site this gate could see.
 */
const SIGNIN = join(LIB, 'signin.mjs')
if (!existsSync(SIGNIN)) problems.push(`there is no ${SIGNIN} to read signUpApi from`)
else {
  const src = readFileSync(SIGNIN, 'utf8')
  const { kind } = classify(src)
  const at = src.search(/export\s+async\s+function\s+signUpApi\s*\(/)
  if (at < 0) problems.push('signin.mjs has no `export async function signUpApi(`')
  else {
    const open = src.indexOf('{', src.indexOf(')', at))
    const [, close] = blockOf(src, kind, open + 1)
    const reg = callsOf(src, kind, 'madeAccount').filter((i) => i > open && i < close)
    const fetches = callsOf(src, kind, 'fetch').filter((i) => i > open && i < close)
    if (!reg.length) problems.push('signUpApi calls no madeAccount( — every person it makes would be left')
    else if (fetches.length && reg[0] > fetches[0]) problems.push('signUpApi registers the person only after its fetch( — a run killed while the answer is on its way leaves them')
  }
}

if (problems.length) {
  console.log('\x1b[31mnot ok\x1b[0m a suite makes people it does not hand to the cleanup:')
  for (const p of problems) console.log(`  · ${p}`)
  process.exitCode = 1
} else {
  console.log(`\x1b[32mok\x1b[0m ${names.length} suite(s) read; ${making} make accounts by a route or SQL of their own, at ${siteCount} site(s), each registered; signUpApi registers before it asks`)
}
