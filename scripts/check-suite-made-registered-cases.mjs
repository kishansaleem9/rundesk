#!/usr/bin/env node
/*
 * THE MADE-REGISTERED GATE, ON SUITES BUILT TO FOOL IT.
 *
 * `check-suite-made-registered.mjs` answers "ok" on the tree, and a gate whose
 * only observed answer is "ok" cannot be told from one that reads nothing. So
 * each case plants suites (and a `signin.mjs`) in a temp directory and runs the
 * real gate on them, and `--mutate` breaks the gate one rule at a time and
 * requires a case to notice.
 *
 * The cases are the ways a suite makes a person without registering them —
 * a raw sign-up, the fixture client's, an invitation claimed, a user inserted
 * by SQL, a registration after the request, in a sibling function, in a string
 * or outside the function that makes the account, braced or an arrow with no
 * braces, or outside a loop, braced or not — and the ways a registered suite
 * could be refused wrongly: a retry loop inside the registering block, a route
 * inside an object literal of routes, a route asked by an arrow that registers
 * in its body, thirty registered in a loop and then inserted, an arrow or a
 * `do … while` on the line before the site, a route named in a comment, the
 * retired register route, `signUpApi` itself. And the helper's own rule, and
 * the ways the gate could pass on nothing.
 *
 *   node scripts/check-suite-made-registered-cases.mjs [--mutate]
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { proveMutationsBite } from './lib/mutate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const GATE = process.env.GATE_UNDER_TEST ?? join(HERE, 'check-suite-made-registered.mjs')

let pass = 0
let fail = 0
const chk = (cond, good, bad) => {
  if (cond) { pass += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { fail += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad ? ` — ${bad}` : ''}`) }
}

const GOOD_SIGNIN = `export async function signUpApi(base, body) {
  if (body?.email) madeAccount({ email: body.email })
  const res = await fetch(\`\${base}/auth/signup\`, { method: 'POST', body: JSON.stringify(body) })
  return (await res.json()).data
}
`
const HEAD = "import { apiAs as apiAsAt, madeAccount } from './lib/fixture.mjs'\nconst apiAs = apiAsAt(API)\n"

/** Plant `suites` ({ name: source }) and a signin.mjs, run the gate there. */
const plant = ({ suites = {}, signin = GOOD_SIGNIN, noDir = false }) => {
  const dir = mkdtempSync(join(tmpdir(), 'made-registered-'))
  try {
    const sd = join(dir, 'suites')
    const ld = join(dir, 'lib')
    if (!noDir) mkdirSync(sd)
    mkdirSync(ld)
    for (const [name, src] of Object.entries(suites)) writeFileSync(join(sd, `${name}.mjs`), src)
    if (signin !== null) writeFileSync(join(ld, 'signin.mjs'), signin)
    const r = spawnSync(process.execPath, [GATE], { encoding: 'utf8', env: { ...process.env, SUITE_DIR: sd, LIB_DIR: ld } })
    return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
/** One planted suite, and whether the gate named it at `line`. */
const one = (src) => plant({ suites: { s: HEAD + src } })
const refused = (r, line) => r.code === 1 && new RegExp(`s\\.mjs:${line + 2} makes an account`).test(r.out)
const says = (r) => r.out.trim().split('\n').slice(0, 3).join(' | ')

console.log('\n▶ what a registered suite looks like')
{
  const r = one(`const email = 'a@rundesk.invalid'
madeAccount({ email })
const res = await fetch(\`\${B}/api/v1/auth/signup\`, { method: 'POST', body: JSON.stringify({ email }) })
`)
  chk(r.code === 0, 'a raw sign-up with madeAccount( before it, in its block, passes', says(r))
  chk(/1 make accounts by a route or SQL of their own, at 1 site\(s\)/.test(r.out), 'and the gate says what it read', says(r))
}
{
  const r = one(`const person = async (label) => {
  const email = \`p-\${label}@rundesk.invalid\`
  madeAccount({ email })
  let res = await apiAs(null)('/auth/signup', { method: 'POST', body: { email } })
  for (let i = 0; res.status === 429 && i < 2; i += 1) {
    madeAccount({ email })
    res = await apiAs(null)('/auth/signup', { method: 'POST', body: { email } })
  }
  return res
}
`)
  chk(r.code === 0, 'a retry that registers again, in a loop inside the registering function, passes', says(r))
}
{
  const r = one(`const person = async (email, invited) => {
  madeAccount({ email })
  if (invited) {
    return fetch(\`\${B}/api/v1/invitations/claim\`, { method: 'POST' })
  }
}
`)
  chk(r.code === 0, 'a registration in a block around the site, in the same function, counts for it', says(r))
}
{
  const r = one(`try {
  madeAccount({ email: mail('burst') })
  const ROUTES = {
    signup: { path: '/auth/signup', body: { email: mail('burst') } },
  }
} finally {}
`)
  chk(r.code === 0, 'a route inside an object literal of routes counts the block the object is made in', says(r))
}
{
  const r = one(`const ROUTES = {
  signup: {
    ask: () => {
      madeAccount({ email: mail('burst') })
      return visit('/auth/signup', { method: 'POST', body: { email: mail('burst') } })
    },
  },
}
`)
  chk(r.code === 0, 'a route asked by an arrow that registers in its own body passes, each time it is asked', says(r))
}
{
  const r = one(`for (let n = 1; n <= 30; n += 1) madeAccount({ email: \`t-\${n}@rundesk.invalid\` })
await sql\`insert into users (email) select 't-' || n || '@rundesk.invalid' from generate_series(1, 30) as n\`
`)
  chk(r.code === 0, 'thirty registered in a loop with no braces, then inserted by SQL after it, pass', says(r))
}
{
  const r = one(`madeAccount({ email: 'x@rundesk.invalid' })
const tidy = (s) => s.trim()
let i = 0
do { i += 1 } while (i < 3)
await fetch(\`\${B}/api/v1/auth/signup\`, { method: 'POST', body: tidy(' x ') })
`)
  chk(r.code === 0, 'an arrow with no braces, or a do … while, on the lines before a site does not take the site in', says(r))
}
{
  const r = one(`// Sign-up is \`POST /auth/signup\`, and a claim is /invitations/claim.
/* insert into users happens in the API */
const people = await signUpApi(API, { email: 'x@rundesk.invalid' })
const old = await apiAs(null)('/auth/register', { method: 'POST' })
`)
  chk(r.code === 0, 'a route named in a comment, signUpApi, and the retired register route are no sites', says(r))
}

console.log('\n▶ the ways a suite makes a person without registering them')
{
  const r = one(`const res = await fetch(\`\${B}/api/v1/auth/signup\`, { method: 'POST' })
`)
  chk(refused(r, 1), 'a raw fetch to /auth/signup with no registration is refused, by line', says(r))
}
{
  const r = one(`const res = await apiAs(null)('/auth/signup', { method: 'POST', body: {} })
`)
  chk(refused(r, 1), 'so is the fixture client’s sign-up', says(r))
}
{
  const r = one(`const claimed = await fetch(\`\${B}/api/v1/invitations/claim\`, { method: 'POST' })
`)
  chk(refused(r, 1), 'so is an invitation claimed into an account', says(r))
}
{
  const r = one(`await sql\`insert into users (email, display_name) values (\${e}, 'x')\`
`)
  chk(refused(r, 1), 'so is a user inserted by SQL', says(r))
}
{
  const r = one(`const res = await fetch(\`\${B}/api/v1/auth/signup\`, { method: 'POST' })
madeAccount({ id: res.id })
`)
  chk(refused(r, 1), 'a registration AFTER the request does not count: a run killed while it is on its way has said nothing', says(r))
}
{
  const r = one(`const other = () => {
  madeAccount({ email: 'b@rundesk.invalid' })
}
const person = async () => {
  return fetch(\`\${B}/api/v1/auth/signup\`, { method: 'POST' })
}
`)
  chk(refused(r, 5), 'a registration in a sibling function does not count', says(r))
}
{
  const r = one(`madeAccount({ email: 'c@rundesk.invalid' })
const person = async (label) => {
  return fetch(\`\${B}/api/v1/auth/signup\`, { method: 'POST', body: label })
}
`)
  chk(refused(r, 3), 'nor one outside the function that makes the account: a helper called for many people registers each', says(r))
}
{
  // The shape that got through the first cut: one registration, then a helper with no braces called for many.
  const r = one(`madeAccount({ email: 'only-this-one@rundesk.invalid' })
const signUp = (email) => fetch(\`\${B}/api/v1/auth/signup\`, { method: 'POST', body: JSON.stringify({ email }) })
await signUp('a@rundesk.invalid')
await signUp('b@rundesk.invalid')
`)
  chk(refused(r, 2) && /in an arrow’s expression/.test(r.out), 'nor one outside an arrow with no braces that makes the account: it is a helper as a braced one is', says(r))
}
{
  const r = one(`madeAccount({ email: 'one@rundesk.invalid' })
await Promise.all(['a', 'b', 'c'].map(async (w) => fetch(\`\${B}/api/v1/invitations/claim\`, { method: 'POST', body: w })))
`)
  chk(refused(r, 2), 'nor one outside a callback with no braces that claims an invitation for each', says(r))
}
{
  const r = one(`try {
  madeAccount({ email: mail('burst') })
  const ROUTES = {
    signup: { ask: () => visit('/auth/signup', { method: 'POST', body: { email: mail('burst') } }) },
  }
} finally {}
`)
  chk(refused(r, 4), 'nor one outside an object of routes whose ask is an arrow with no braces', says(r))
}
{
  const r = one(`madeAccount({ email: 'one@rundesk.invalid' })
for (const w of ['a', 'b']) await fetch(\`\${B}/api/v1/auth/signup\`, { method: 'POST', body: w })
`)
  chk(refused(r, 2) && /in a loop/.test(r.out), 'nor one before a loop with no braces that signs up each time round', says(r))
}
{
  const r = one(`madeAccount({ email: 'one@rundesk.invalid' })
for (const w of ['a', 'b']) {
  await fetch(\`\${B}/api/v1/auth/signup\`, { method: 'POST', body: w })
}
`)
  chk(refused(r, 3), 'nor one before a braced loop that does', says(r))
}
{
  const r = one(`const note = 'madeAccount({ email })'
// madeAccount({ email })
const res = await fetch(\`\${B}/api/v1/auth/signup\`, { method: 'POST' })
`)
  chk(refused(r, 3), 'nor madeAccount( written in a string or a comment', says(r))
}
{
  // The shape that got through: one registration, then two accounts made further down the same block.
  const r = one(`madeAccount({ email: 'first@rundesk.invalid' })
await visit('/auth/signup', { method: 'POST', body: { email: 'first@rundesk.invalid' } })
await visit('/invitations/claim', { method: 'POST', body: { token, fullName: 'Newcomer', password } })
`)
  chk(refused(r, 3), 'one registration does not stand for a second account made later in the same block', says(r))
}
{
  const r = plant({
    suites: {
      s: `${HEAD}madeAccount({ email: 'a@rundesk.invalid' })\nawait fetch(\`\${B}/api/v1/auth/signup\`)\n`,
      t: `${HEAD}await fetch(\`\${B}/api/v1/auth/signup\`)\n`,
    },
  })
  chk(r.code === 1 && /t\.mjs:3 makes an account/.test(r.out) && !/s\.mjs:/.test(r.out),
    'one suite that registers does not excuse another that does not', says(r))
}

console.log('\n▶ the helper every other suite makes its people with')
{
  const r = plant({ suites: { s: `${HEAD}await signUpApi(API, {})\n` }, signin: GOOD_SIGNIN.replace("  if (body?.email) madeAccount({ email: body.email })\n", '') })
  chk(r.code === 1 && /signUpApi calls no madeAccount\(/.test(r.out), 'a signUpApi that registers nobody is refused', says(r))
}
{
  const r = plant({
    suites: { s: `${HEAD}await signUpApi(API, {})\n` },
    signin: `export async function signUpApi(base, body) {
  const res = await fetch(\`\${base}/auth/signup\`, { method: 'POST' })
  madeAccount({ email: body.email })
  return res
}
`,
  })
  chk(r.code === 1 && /registers the person only after its fetch\(/.test(r.out), 'and so is one that registers only after it asks', says(r))
}

console.log('\n▶ the ways it could pass on nothing')
{
  const r = plant({ noDir: true })
  chk(r.code === 1 && /no suite directory/.test(r.out), 'no suite directory is a failure', says(r))
}
{
  const r = plant({ suites: {} })
  chk(r.code === 1 && /only 0 suite\(s\) read/.test(r.out), 'a directory with no suites is a failure, not "ok"', says(r))
}
{
  const r = one('const s = `never closed\n')
  chk(r.code === 1 && /does not read to a clean end/.test(r.out), 'a suite that does not read to a clean end is reported, not guessed at', says(r))
}

console.log(`\n${pass} passed, ${fail} failed`)
let blind = 0
if (process.argv.includes('--mutate') && !process.env.GATE_UNDER_TEST) {
  blind += proveMutationsBite({
    subject: GATE,
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'GATE_UNDER_TEST',
    label: 'the gate',
    // It ran if it gave a verdict, either one, on the tree: `ok` is printed after
    // a colour escape ending in `m`, so `\bok` would never match it.
    alive: (mutant) => {
      const r = spawnSync(process.execPath, [mutant], { encoding: 'utf8' })
      const said = (r.stdout ?? '').replace(/\x1b\[[0-9;]*m/g, '')
      return { ok: (r.status === 0 || r.status === 1) && /^(not )?ok /m.test(said), why: r.stderr || said.slice(0, 200) }
    },
    mutations: [
      ['comments-are-sites', "if (kind[m.index] !== 's' && kind[m.index] !== 't') continue", 'void 0'],
      ['strings-register', "for (const m of src.matchAll(re)) if (kind[m.index] === 'c') at.push(m.index)", 'for (const m of src.matchAll(re)) at.push(m.index)'],
      ['after-counts', 'r.at > after && r.at < m.index && chain', 'r.at > after && chain'],
      ['one-registration-covers-many', 'r.at > after && r.at < m.index', 'r.at < m.index'],
      ['any-block-registers', 'const registered = registers.some((r) => r.at > after && r.at < m.index && chain.some(({ span: [o, c] }) => r.block[0] === o && r.block[1] === c))', 'const registered = registers.length > 0'],
      ['objects-are-blocks', 'else if (!opensObject(src, kind, k)) {', 'else if (true) {'],
      ['no-enclosing-blocks', '    r = regionOf(ctx, r.span[0] - 1, true)\n', '    break\n'],
      ['no-function-boundary', 'if (isFunctionBody(src, kind, r.span[0]) || ctx', 'if (false || ctx'],
      ['arrows-no-boundary', 'for (const r of ctx.arrows) if', 'for (const r of []) if'],
      ['braced-loops-no-boundary', ' || ctx.loops.has(r.span[0])) {', ') {'],
      ['bare-loops-unseen', 'if (withBare) for (const r of ctx.bare)', 'if (false) for (const r of ctx.bare)'],
      ['bare-loops-register', 'at, block: regionOf(ctx, at, false).span', 'at, block: regionOf(ctx, at, true).span'],
      ['arrow-bodies-run-on', 'if (n < 0 || !(kind[n] === \'t\' || GOES_ON_BEFORE.has(src[n]))) return i', 'void n'],
      ['do-tails-are-loops', "if (w >= 1 && src.slice(w - 1, w + 1) === 'do' && !/[\\w$]/.test(src[w - 2] ?? '')) continue", 'void w'],
      ['helper-unread', "if (!reg.length) problems.push('signUpApi calls no madeAccount(", "if (false) problems.push('signUpApi calls no madeAccount("],
      ['helper-order-unread', 'else if (fetches.length && reg[0] > fetches[0])', 'else if (false)'],
      ['no-floor', 'else if (names.length < MIN_SUITES)', 'else if (false)'],
      ['unclean-read-anyway', '  if (!clean) {\n', '  if (false) {\n'],
      ['problems-pass', 'process.exitCode = 1', 'process.exitCode = 0'],
    ],
  })
}
process.exitCode = fail === 0 && blind === 0 ? 0 : 1
