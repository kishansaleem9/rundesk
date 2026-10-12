#!/usr/bin/env node
/*
 * A MESSAGES ENDPOINT, SO "NO PROVIDER KEY" STOPS BEING A VERDICT TOO.
 *
 * The ledger blocks a row of surfaces on `ANTHROPIC_API_KEY` being "empty here
 * and in CI" — the task-detail AI bar, the AI answer surfaces, the model
 * picker's live half — and the suites assert the REFUSAL: "AI features are not
 * configured", 503, never the status alone. That is the same shape the cover
 * picker's Upload tab was in this morning, and the same reason turned out to be
 * wrong there.
 *
 * IT IS WRONG HERE FOR THE SAME REASON. `ai.service.ts` constructs
 * `new Anthropic({ apiKey })` and passes no `baseURL` — so the SDK fills it in,
 * and the SDK's own default is `readEnv('ANTHROPIC_BASE_URL')`:
 *
 *     constructor({ baseURL = readEnv('ANTHROPIC_BASE_URL'),
 *                   apiKey  = readEnv('ANTHROPIC_API_KEY') ?? null, … })
 *
 * The seam is already there, documented, and needs NO product change — exactly
 * as `R2_ENDPOINT` was already there for storage. What was missing was not a
 * key. It was something to answer.
 *
 * WHAT THIS IS FOR, AND WHAT IT IS NOT FOR. A stub cannot tell you whether a
 * model writes a good summary, and no check should pretend otherwise. What it
 * CAN measure is everything the product does around the call, which is where
 * the product's own defects live: whether a prompt is built and sent at all,
 * whether the answer is parsed rather than echoed, whether a refusal is
 * reported in words, whether a failure is recorded, whether the rate limiter
 * counts. Those are the checks the refusal path could never reach.
 *
 * DETERMINISTIC BY CONSTRUCTION. The reply is chosen by matching the system
 * prompt, so one lane's suites do not have to agree about a shared script, and
 * a caller can stage an exact body for the next call. Nothing here is random:
 * a stub that varied would be a flake generator wearing a test double.
 *
 * NOT FOR PRODUCTION. Binds loopback, answers only `/v1/messages`, and refuses
 * to start without `RUNDESK_MODEL_STUB=1`.
 *
 *   RUNDESK_MODEL_STUB=1 node scripts/e2e-lanes/model-stub.mjs --port 9200
 *
 * Prints one line of JSON when listening, so callers wait on readiness rather
 * than sleeping.
 */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

if (process.env.RUNDESK_MODEL_STUB !== '1') {
  console.error('[model-stub] refusing to start without RUNDESK_MODEL_STUB=1 — this is a test double')
  process.exitCode = 1
  process.exit()
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}
const PORT = Number(arg('port', 9200))
/*
 * WHICH SOURCE THIS PROCESS IS RUNNING. A lane's stub lives for days and the
 * launcher leaves a running one alone, so a change to this file never reached
 * a lane that was already up. The object store met it first — its request log
 * was added and every lane went on serving the store from before it — and this
 * stub has the same launcher, so the same hazard. `lane-env.sh` compares this
 * with the file on disk and restarts a stub whose source has moved — the same
 * refusal `verify.sh` makes of an API built from older source.
 */
const SOURCE = createHash('sha1').update(readFileSync(new URL(import.meta.url))).digest('hex').slice(0, 12)

/*
 * WHAT THE STUB SAYS BACK, keyed on a phrase from the system prompt the
 * product builds. Matching on the PRODUCT'S OWN WORDS rather than on the route
 * means a prompt that stops being sent stops matching, and the suite sees the
 * fallback rather than a plausible answer — which is the failure worth seeing.
 */
const SCRIPTS = [
  {
    when: /generate a structured task definition/i,
    text: JSON.stringify({
      title: 'Stubbed task title',
      description: 'A description the stub returned.',
      subtasks: ['first', 'second'],
      priority: 'high',
      estimatedHours: 3,
    }),
  },
  /*
   * AN AI FIELD'S VALUE (`ledger-rows/row-719`), one answer per kind, in the
   * words `AiService.fillAiField` sends. A Dropdown's answer is the first of
   * the options the prompt lists, so a field that fills itself (autofill,
   * auto-update — nobody there to stage a reply) still names one of its own.
   */
  { when: /You write the Summary field of a task/, text: 'Stubbed summary: the task is under way.' },
  { when: /You write the Progress Updates field of a task/, text: 'Stubbed progress: the latest comment was read.' },
  { when: /You write the Action Items field of a task/, text: '- Stubbed first step\n- Stubbed second step' },
  { when: /You write the Translation field of a task/, text: 'Traduction factice de la tâche.' },
  { when: /You fill the Sentiment field of a task/, text: 'Positive' },
  { when: /You fill a custom AI field of a task/, text: 'Stubbed custom text.' },
  {
    when: /You fill (?:the Categorize field|a custom AI dropdown field) of a task/,
    text: (system) => (/as written, and nothing else: ([^|.]+)/.exec(system)?.[1] ?? 'no options').trim(),
  },
]
// Staged by `POST /__control/next`, consumed by the call it answers.
let staged = null
// Every request the product made, so a suite can assert the PROMPT rather than
// only the answer — "was the field list actually sent?" is a real question.
const seen = []

const json = (res, status, body) => {
  const s = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) })
  res.end(s)
}
const readBody = (req) =>
  new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'))
      } catch {
        resolve({})
      }
    })
  })

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)

  if (url.pathname === '/__control/next' && req.method === 'POST') {
    staged = await readBody(req)
    return json(res, 200, { staged: true })
  }
  if (url.pathname === '/__control/version' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ source: SOURCE }))
  }
  if (url.pathname === '/__control/seen' && req.method === 'GET') {
    return json(res, 200, { calls: seen })
  }
  /*
   * Reset clears BOTH the staging and the record, and a section calls it at its
   * START. The stub outlives a run, and `s3-stub.mjs` learnt the expensive
   * version of this lesson: something armed and never fired stays armed, and
   * the next run reads a leftover with nothing in it to explain the result.
   */
  if (url.pathname === '/__control/reset' && req.method === 'POST') {
    staged = null
    seen.length = 0
    return json(res, 200, { staged: false, calls: 0 })
  }

  if (url.pathname !== '/v1/messages' || req.method !== 'POST') {
    return json(res, 404, { type: 'error', error: { type: 'not_found_error', message: `no route ${req.method} ${url.pathname}` } })
  }

  const body = await readBody(req)
  seen.push({ model: body.model, system: body.system, messages: body.messages })

  if (staged?.status && staged.status >= 400) {
    /*
     * READ BEFORE CLEARING, and the order is the whole bug.
     *
     * This was `staged = null` and then `json(res, staged?.status ?? 400, err)`
     * — the staging is gone by the time the status is read, so EVERY arranged
     * failure came back 400 whatever the caller asked for. A suite staging a
     * 503 to exercise "the provider is down" would have been handed a 400 and
     * its check would have failed about the product.
     *
     * `check-model-stub.mjs` could not see it: the case stages a 500 and
     * asserts the error's CLASS NAME, which is the same whichever status
     * arrives. It asserted that an error reached the product, under a sentence
     * about the error the caller arranged. It asserts the status now.
     */
    const status = staged.status
    const err = { type: 'error', error: { type: staged.type ?? 'api_error', message: staged.message ?? 'the stub was asked to fail' } }
    /*
     * AND IT CAN FAIL MORE THAN ONCE, because the SDK RETRIES.
     *
     * Found the moment the status above became truthful. A staged 500 was
     * consumed by the first attempt, the Anthropic client retried, the retry
     * found nothing staged and answered normally — so the call SUCCEEDED and
     * the arranged failure reached nobody. The old 400 hid this: 400 is not
     * retried, so one staging made one failure and the case passed for the
     * wrong reason twice over.
     *
     * `count` is how many calls a staging survives, default one. A suite
     * arranging a refusal through the PRODUCT — which builds its client with
     * the SDK's default retries — stages `count` high enough to outlast them,
     * and a probe that wants exactly one failure sets `maxRetries: 0` instead.
     */
    const left = Number(staged.count ?? 1) - 1
    staged = left > 0 ? { ...staged, count: left } : null
    return json(res, status, err)
  }

  const system = typeof body.system === 'string' ? body.system : JSON.stringify(body.system ?? '')
  /*
   * AND AS SLOW AS A REAL ONE, WHEN ASKED (`found-7-oct/a-call-ended-twice-keeps-two-records`).
   * A model takes seconds and this answers at once, so what the product does
   * while it waits had no time here to go wrong in: a second end of a call
   * wrote a second record only in a 20 ms window. A staging's `delayMs` holds
   * its answer back that long (at most 30 s). Read before the staging is
   * cleared, as the status above is.
   */
  const delayMs = Math.min(Math.max(Number(staged?.delayMs ?? 0) || 0, 0), 30_000)
  const scripted = SCRIPTS.find((s) => s.when.test(system))?.text
  const text = staged?.text ?? (typeof scripted === 'function' ? scripted(system) : scripted) ?? 'A stubbed reply.'
  staged = null
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
  // The product meters on these; zeroes would make a usage check pass on a
  // call that never happened, so they are derived from the exchange.
  const usage = { input_tokens: Math.max(1, Math.ceil(system.length / 4)), output_tokens: Math.max(1, Math.ceil(text.length / 4)) }
  const id = `msg_stub_${seen.length}`

  /*
   * STREAMED WHEN ASKED (`found-29-sep/model-stub-never-streams`). The chat
   * dock and the other streamed routes call `messages.stream`, which sends
   * `stream: true` and reads server-sent events. Answered with the JSON below,
   * the SDK found no event in it, and every streamed turn on a model lane ended
   * in "request ended without sending any chunks", so no streamed answer was
   * ever measured here. These are the Messages API's own events in its order,
   * and the text goes out in several deltas: a reader that kept only the last
   * one is caught.
   */
  if (body.stream === true) {
    const words = text.split(/(?<= )/)
    const per = Math.max(1, Math.ceil(words.length / 3))
    const parts = []
    for (let i = 0; i < words.length; i += per) parts.push(words.slice(i, i + per).join(''))
    const events = [
      ['message_start', { type: 'message_start', message: { id, type: 'message', role: 'assistant', model: body.model ?? 'claude-stub', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: usage.input_tokens, output_tokens: 1 } } }],
      ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
      ...parts.map((part) => ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: part } }]),
      ['content_block_stop', { type: 'content_block_stop', index: 0 }],
      ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: usage.output_tokens } }],
      ['message_stop', { type: 'message_stop' }],
    ]
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    for (const [event, data] of events) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    return res.end()
  }

  return json(res, 200, {
    id,
    type: 'message',
    role: 'assistant',
    model: body.model ?? 'claude-stub',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage,
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(JSON.stringify({ ready: true, port: PORT, endpoint: `http://127.0.0.1:${PORT}`, source: SOURCE }))
})

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)))
