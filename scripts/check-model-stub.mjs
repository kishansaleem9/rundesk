#!/usr/bin/env node
/*
 * THE SEAM, AND THAT THE DOUBLE ON THE END OF IT IS HONEST.
 *
 * `scripts/e2e-lanes/model-stub.mjs` exists to retire a second recorded reason.
 * The ledger blocks a row of AI surfaces on `ANTHROPIC_API_KEY` being "empty
 * here and in CI", and their suites assert the REFUSAL — "AI features are not
 * configured", 503 — because the live path was held to be unreachable. It is
 * the same shape the cover picker's Upload tab was in, and the reason fails the
 * same way.
 *
 * THE FIRST CASE IS THE WHOLE ARGUMENT. `ai.service.ts` writes
 * `new Anthropic({ apiKey })` and passes NO `baseURL`, so the SDK supplies its
 * own default — and that default is `readEnv('ANTHROPIC_BASE_URL')`. The seam
 * is already in the product, needs no change to it, and is asserted here
 * against the REAL SDK rather than read out of its source: a future SDK that
 * stopped honouring the variable would silently send these suites at the live
 * API, and this is what would catch it.
 *
 * WHAT A MODEL STUB CAN AND CANNOT MEASURE. It cannot say whether a model
 * writes a good summary, and no check built on it should pretend to. It can say
 * whether the product builds a prompt and sends it, parses the answer rather
 * than echoing it, reports a refusal in words, and meters what came back —
 * which is where the product's own defects live, and which the refusal path
 * could never reach.
 *
 *   node scripts/check-model-stub.mjs            # the cases
 *   node scripts/check-model-stub.mjs --mutate   # and that each one bites
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
// The shared counter, and `lib/mutate.mjs` records why it is not `FAIL`
// and not `includes('FAIL')` — both were tried here and both were wrong.
import { namedFailures } from './lib/mutate.mjs'

const ROOT = join(HERE, '..')
const STUB = process.env.MODEL_STUB ?? join(HERE, 'e2e-lanes/model-stub.mjs')
const PORT = 9500 + (process.pid % 300)

let pass = 0
let fail = 0
const failures = []
const chk = (cond, good, bad) => {
  if (cond) {
    pass += 1
    console.log(`  \x1b[32mPASS\x1b[0m ${good}`)
  } else {
    fail += 1
    failures.push(bad ?? good)
    console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`)
  }
}

/*
 * The probe constructs the client EXACTLY as `ai.service.ts` does — apiKey and
 * nothing else — so that what is measured is the product's construction and not
 * a convenient one. If that line in the service ever grows an explicit
 * `baseURL`, this stops being a faithful probe and the comment beside it there
 * should say so.
 */
const PROBE = `
import Anthropic from '@anthropic-ai/sdk'
const BASE = 'http://127.0.0.1:${PORT}'
async function main() {
  const out: Record<string, unknown> = {}
  try {
    process.env.ANTHROPIC_BASE_URL = BASE
    const client = new Anthropic({ apiKey: 'stub-key' })
    out.baseURL = (client as unknown as { baseURL: string }).baseURL
    const sys = 'You are a project management assistant for Rundesk.\\nWhen given a natural language description, generate a structured task definition.'
    const r = await client.messages.create({
      model: 'claude-stub-1', max_tokens: 256, system: sys,
      messages: [{ role: 'user', content: 'ship the thing' }],
    })
    const first = r.content[0]
    out.replyText = first?.type === 'text' ? first.text : null
    out.usage = r.usage
    const seen = await (await fetch(BASE + '/__control/seen')).json()
    out.calls = seen.calls.length
    out.promptArrived = /structured task definition/.test(seen.calls[0]?.system ?? '')
    // A staged body is what lets a suite drive one exact answer.
    await fetch(BASE + '/__control/next', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'STAGED' }) })
    const staged = await client.messages.create({ model: 'claude-stub-1', max_tokens: 16, system: 'x', messages: [{ role: 'user', content: 'y' }] })
    out.staged = staged.content[0]?.type === 'text' ? staged.content[0].text : null
    // And it does not latch: the call after it is scripted again, not STAGED.
    const after = await client.messages.create({ model: 'claude-stub-1', max_tokens: 256, system: sys, messages: [{ role: 'user', content: 'again' }] })
    out.afterStaged = after.content[0]?.type === 'text' ? after.content[0].text : null
    // An arranged API error must reach the product as an ERROR, not as text.
    await fetch(BASE + '/__control/next', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 500, message: 'arranged' }) })
    out.arranged = await client.messages
      .create({ model: 'claude-stub-1', max_tokens: 16, system: 'x', messages: [{ role: 'user', content: 'y' }] })
      .then(() => 'answered-anyway')
      .catch((e: Error) => e.constructor.name)
    await fetch(BASE + '/__control/reset', { method: 'POST' })
    out.afterReset = (await (await fetch(BASE + '/__control/seen')).json()).calls.length
  } catch (err) {
    out.threw = err instanceof Error ? \`\${err.name}: \${err.message}\` : String(err)
  }
  console.log('RESULT ' + JSON.stringify(out))
}
void main()
`

const startStub = () => {
  const child = spawn(process.execPath, [STUB, '--port', String(PORT)], {
    env: { ...process.env, RUNDESK_MODEL_STUB: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return new Promise((resolve, reject) => {
    let seen = ''
    const bail = setTimeout(() => reject(new Error(`the stub never announced itself: ${seen}`)), 15_000)
    child.stdout.on('data', (d) => {
      seen += d
      if (/"ready":true/.test(seen)) {
        clearTimeout(bail)
        resolve(child)
      }
    })
    child.stderr.on('data', (d) => (seen += d))
    child.on('exit', (code) => {
      clearTimeout(bail)
      reject(new Error(`the stub exited with ${code}: ${seen}`))
    })
  })
}

const probe = () => {
  const file = join(ROOT, 'apps/api', `.model-stub-probe-${process.pid}.ts`)
  try {
    writeFileSync(file, PROBE)
    const r = spawnSync('pnpm', ['exec', 'tsx', file], {
      cwd: join(ROOT, 'apps/api'),
      encoding: 'utf8',
      timeout: 120_000,
    })
    const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('RESULT '))
    if (!line) return { none: `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim().slice(-400) }
    return JSON.parse(line.slice(7))
  } finally {
    rmSync(file, { force: true })
  }
}

const stub = await startStub()
let out
try {
  console.log('\n▶ the real Anthropic SDK, constructed as the service constructs it')
  out = probe()
} finally {
  stub.kill('SIGTERM')
}

if (out.none !== undefined) {
  console.error(`\n[model-stub] the probe printed no result:\n${out.none}`)
  process.exitCode = 1
} else {
  chk(!out.threw, 'the probe ran to the end', `it threw: ${out.threw}`)
  chk(
    out.baseURL === `http://127.0.0.1:${PORT}`,
    'ANTHROPIC_BASE_URL alone redirects a client built with an apiKey and nothing else — the seam needs no product change',
    `the SDK chose ${out.baseURL}, so this seam is not what the service's construction gives us`,
  )
  chk(out.calls === 1, 'and the call really left the SDK', `the stub saw ${out.calls} call(s)`)
  chk(
    out.promptArrived === true,
    "and the PRODUCT'S OWN system prompt is what arrived — a prompt that stops being sent stops matching",
    'the system prompt did not reach the stub',
  )
  /*
   * PARSED INSIDE A GUARD, because a case that THROWS is not a case that
   * fails. Written as a bare `JSON.parse`, the mutation that makes the stub
   * answer its fallback whatever the prompt said fed it "A stubbed reply." —
   * this file died on the SyntaxError, exited non-zero with no FAIL line, and
   * the mutation pass called it reddened while naming zero cases. "0 case(s)" was
   * the tell, exactly as a uniform count was in `check-suite-enders.mjs`.
   */
  const parsedReply = (() => {
    try {
      return JSON.parse(String(out.replyText))
    } catch {
      return null
    }
  })()
  chk(
    parsedReply?.title === 'Stubbed task title',
    'the scripted reply comes back as text the product can parse',
    `the reply was ${JSON.stringify(out.replyText)}`,
  )
  chk(
    out.usage?.input_tokens > 0 && out.usage?.output_tokens > 0,
    'with usage derived from the exchange, so a metering check cannot pass on a call that never happened',
    `usage came back ${JSON.stringify(out.usage)}`,
  )
  chk(out.staged === 'STAGED', 'a staged body answers the next call exactly', `the staged call returned ${JSON.stringify(out.staged)}`)
  chk(
    out.afterStaged !== 'STAGED',
    'and it does NOT latch — the call after it is scripted again, so one suite cannot poison the next',
    'the staged reply latched and answered twice',
  )
  chk(
    out.arranged === 'APIError' || /Error$/.test(String(out.arranged ?? '')),
    'an arranged API error reaches the product as an ERROR, not as an answer that happens to say "error"',
    `the arranged failure came back as ${JSON.stringify(out.arranged)}`,
  )
  chk(out.afterReset === 0, 'and reset clears the record, so a section can establish its own starting state', `after reset the stub still held ${out.afterReset} call(s)`)
}

console.log(
  `\n${fail === 0 && out.none === undefined ? '\x1b[32mok\x1b[0m' : '\x1b[31mnot ok\x1b[0m'} model-stub: ` +
    `${pass} case(s) held, ${fail} did not`,
)

if (process.argv.includes('--mutate')) {
  const ORIGINAL = readFileSync(STUB, 'utf8')
  let blind = 0
  const MUTATIONS = [
    ['the stub forgets every call it was made', 'seen.push({ model: body.model, system: body.system, messages: body.messages })', 'void body'],
    ['it answers the fallback whatever the prompt said', "SCRIPTS.find((s) => s.when.test(system))?.text ?? 'A stubbed reply.'", "'A stubbed reply.'"],
    ['a staged body LATCHES into the next call', "const text = staged?.text ?? SCRIPTS.find((s) => s.when.test(system))?.text ?? 'A stubbed reply.'\n  staged = null", "const text = staged?.text ?? SCRIPTS.find((s) => s.when.test(system))?.text ?? 'A stubbed reply.'"],
    ['an arranged error comes back as a 200 that says "error"', 'if (staged?.status && staged.status >= 400) {', 'if (false) {'],
    ['usage is zeroes, so a metering check passes on nothing', 'usage: { input_tokens: Math.max(1, Math.ceil(system.length / 4)), output_tokens: Math.max(1, Math.ceil(text.length / 4)) }', 'usage: { input_tokens: 0, output_tokens: 0 }'],
    ['reset keeps the record of the run before', 'seen.length = 0', 'void seen'],
  ]
  console.log('\n▶ and each mutation of the stub reddens a case')
  for (const [label, from, to] of MUTATIONS) {
    if (ORIGINAL.split(from).length - 1 !== 1) {
      console.log(`  \x1b[31mANCHOR MISS\x1b[0m ${label}`)
      blind += 1
      continue
    }
    // Beside the original, never over it — `check-suite-enders.mjs` records
    // what both halves of that rule cost to learn.
    const mutant = join(dirname(STUB), `.model-stub-mutant-${label.replace(/\W+/g, '-')}.mjs`)
    try {
      writeFileSync(mutant, ORIGINAL.split(from).join(to))
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
        encoding: 'utf8',
        timeout: 180_000,
        env: { ...process.env, MODEL_STUB: mutant },
      })
      if (/the probe printed no result/.test(r.stderr ?? '')) {
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — the mutant never got a result back`)
        blind += 1
        continue
      }
      const named = namedFailures(r.stdout)
      if (r.status === 0) {
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — every case still passes`)
        blind += 1
      } else if (named === 0) {
        /*
         * NON-ZERO WITH NOTHING NAMED IS NOT A REDDEN. It means this file
         * stopped before it could report — a throw in a case, an unparseable
         * result — and the exit code is then about the harness rather than
         * about the rule. Crediting it would be the same mistake as crediting
         * a mutant that never ran.
         */
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — it exited non-zero but named no case`)
        blind += 1
      } else {
        console.log(`  \x1b[32mreddens\x1b[0m ${label} (${named} case(s))`)
      }
    } finally {
      rmSync(mutant, { force: true })
    }
  }
  console.log(
    `\n${blind === 0 ? '\x1b[32mok\x1b[0m' : '\x1b[31mnot ok\x1b[0m'} mutations: ` +
      `${MUTATIONS.length - blind} of ${MUTATIONS.length} bite`,
  )
  if (blind) fail += blind
}

if (fail) {
  console.error(`\n[model-stub] ${fail} case(s) did not hold:`)
  for (const f of failures) console.error(`  · ${f}`)
  process.exitCode = 1
}
