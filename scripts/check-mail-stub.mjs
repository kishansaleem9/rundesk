#!/usr/bin/env node
/*
 * THE MAIL SEAM, AND THAT THE DOUBLE ON THE END OF IT IS HONEST
 * (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`).
 *
 * `scripts/e2e-lanes/mail-stub.mjs` is the mail server of the lanes and of CI:
 * the comment box's Email sends there, and a suite reads back what went. A
 * stub that kept what no mail server keeps — a message with its blind copies
 * dropped, a sign-in it never checks, a file it never read — would let that
 * suite pass about a product whose mail goes wrong. So the product's OWN
 * sender (`EmailService.sendTaskEmail`, through nodemailer) is driven against
 * it here, a bare SMTP session beside it, and each rule of the stub is broken
 * in turn: a case must notice.
 *
 *   node scripts/check-mail-stub.mjs            # the cases
 *   node scripts/check-mail-stub.mjs --mutate   # and that each one bites
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { namedFailures } from './lib/mutate.mjs'
import { freePort } from './lib/free-port.mjs'
import { runMutant } from './lib/run-mutant.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const STUB = process.env.MAIL_STUB ?? join(HERE, 'e2e-lanes/mail-stub.mjs')
// Asked of the OS: a pid-chosen port could be a lane stub's (`scripts/lib/free-port.mjs`).
const CONTROL = await freePort()
const SMTP = await freePort()

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
    console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`)
  }
}

const FILE = 'quarterly figures, one line\nand a second\n'
const FILE_SHA1 = createHash('sha1').update(FILE).digest('hex')

/*
 * The probe sends as the API sends, through the product's EmailService, and
 * reads the stub's control seam; what it prints is all the cases read. Each
 * step is caught on its own, so one broken rule costs one answer, not the run.
 */
const PROBE = `
import { connect } from 'node:net'
import { EmailService, TaskEmailRefused } from './src/modules/email/email.service'
const CONTROL = 'http://127.0.0.1:${CONTROL}'
const env = (extra: Record<string, string>) => ({ get: (k: string) => extra[k] }) as never
const lane = { SMTP_HOST: '127.0.0.1', SMTP_PORT: '${SMTP}', SMTP_USER: 'lane-mail', SMTP_PASS: 'lane-mail-key', SMTP_SECURE: 'false', SMTP_FROM: '"Rundesk" <noreply@rundesk.test>' }
const mail = new EmailService(env(lane))
const control = (path: string, body?: unknown) =>
  fetch(CONTROL + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => r.json())
const messages = async (to?: string) => (await control('/__control/mail/messages' + (to ? '?to=' + encodeURIComponent(to) : ''))).messages
const refusal = (e: unknown) => (e instanceof TaskEmailRefused ? { code: e.code, said: e.said } : { other: String(e) })
const base = { fromName: 'Ana López', cc: [] as string[], bcc: [] as string[], subject: 's', text: 't', replyTo: 'reply-1@inbound.test', messageId: '<task-email.0@inbound.test>' }
/** A bare SMTP session: the lines sent, one at a time, and every reply. */
const session = (lines: string[]) => new Promise<string[]>((resolve) => {
  const said: string[] = []
  const s = connect(${SMTP}, '127.0.0.1')
  let buf = ''
  let i = -1
  const next = () => { i += 1; if (i < lines.length) s.write(lines[i] + '\\r\\n'); else s.end() }
  s.on('data', (d) => {
    buf += d.toString('latin1')
    let at
    while ((at = buf.indexOf('\\r\\n')) !== -1) {
      const line = buf.slice(0, at); buf = buf.slice(at + 2)
      said.push(line)
      if (!/^\\d{3}-/.test(line)) next()
    }
  })
  const stop = setTimeout(() => s.destroy(), 10_000)
  s.on('close', () => { clearTimeout(stop); resolve(said) })
  s.on('error', () => { clearTimeout(stop); resolve(said) })
})
const out: Record<string, unknown> = {}
;(async () => {
const step = async (name: string, fn: () => Promise<unknown>) => {
  try { out[name] = await fn() } catch (e) { out[name] = { threw: String(e) } }
}
await step('sent', async () => {
  await mail.sendTaskEmail({
    ...base,
    to: ['client@example.com'], cc: ['partner@example.com'], bcc: ['quiet@example.com'],
    subject: 'Quote for März',
    text: 'Hello Bea,\\n.dots begin this line\\nüber alles',
    messageId: '<task-email.1@inbound.test>',
    attachments: [{ filename: 'figures.txt', content: Buffer.from(${JSON.stringify(FILE)}), contentType: 'text/plain' }],
  })
  const [m] = await messages('client@example.com')
  return {
    envelope: m?.envelope,
    headers: m && { subject: m.headers.subject, from: m.headers.from, to: m.headers.to, cc: m.headers.cc, bcc: m.headers.bcc, replyTo: m.headers.replyTo, messageId: m.headers.messageId },
    text: m?.text,
    html: typeof m?.html === 'string' && m.html.includes('Hello Bea'),
    attachments: m?.attachments,
  }
})
await step('answer', async () => {
  await mail.sendTaskEmail({ ...base, to: ['client@example.com'], messageId: '<task-email.2@inbound.test>', inReplyTo: '<their-answer@example.com>' })
  const all = await messages('client@example.com')
  const m = all[all.length - 1]
  return { inReplyTo: m?.headers.inReplyTo, references: m?.headers.references }
})
await step('refused', async () => {
  await control('/__control/mail/fail', { code: 554, count: 1, to: 'client@example.com' })
  let first: unknown = 'sent'
  try { await mail.sendTaskEmail({ ...base, to: ['client@example.com'], messageId: '<task-email.3@inbound.test>' }) } catch (e) { first = refusal(e) }
  let other: unknown = 'sent'
  await control('/__control/mail/fail', { code: 451, count: 1, to: 'client@example.com' })
  try { await mail.sendTaskEmail({ ...base, to: ['someone-else@example.com'], messageId: '<task-email.4@inbound.test>' }) } catch (e) { other = refusal(e) }
  let again: unknown = 'sent'
  try { await mail.sendTaskEmail({ ...base, to: ['client@example.com'], messageId: '<task-email.5@inbound.test>' }) } catch (e) { again = refusal(e) }
  let after: unknown = 'sent'
  try { await mail.sendTaskEmail({ ...base, to: ['client@example.com'], messageId: '<task-email.6@inbound.test>' }) } catch (e) { after = refusal(e) }
  const ids = (await messages('client@example.com')).map((m: { headers: { messageId: string } }) => m.headers.messageId)
  return { first, other, again, after, kept: ids.filter((id: string) => /task-email\\.[3-6]@/.test(id)) }
})
await step('wrongPassword', async () => {
  try { await new EmailService(env({ ...lane, SMTP_PASS: 'not-the-key' })).sendTaskEmail({ ...base, to: ['client@example.com'] }); return 'sent' } catch (e) { return refusal(e) }
})
await step('bare', async () => session(['EHLO probe', 'MAIL FROM:<x@example.com>', 'QUIT']))
await step('unconfigured', async () => {
  const none = new EmailService(env({}))
  try { await none.sendTaskEmail({ ...base, to: ['client@example.com'] }); return [none.isConfigured(), 'sent'] } catch (e) { return [none.isConfigured(), refusal(e)] }
})
await step('unreachable', async () => {
  try { await new EmailService(env({ ...lane, SMTP_PORT: '1' })).sendTaskEmail({ ...base, to: ['client@example.com'] }); return 'sent' } catch (e) { return refusal(e) }
})
await step('seam', async () => {
  await mail.sendTaskEmail({ ...base, to: ['partner@example.com'], messageId: '<task-email.7@inbound.test>' })
  const partner = (await messages('partner@example.com')).length
  // Forgets what went to the client — the first message too, which the partner was copied on — and nothing else.
  await control('/__control/mail/reset', { to: 'client@example.com' })
  const left = (await messages()).map((m: { headers: { messageId: string } }) => m.headers.messageId)
  return { partner, client: (await messages('client@example.com')).length, partnerAfter: (await messages('partner@example.com')).length, left }
})
console.log('RESULT ' + JSON.stringify(out))
})()
`

const startStub = () => {
  const child = spawn(process.execPath, [STUB, '--port', String(CONTROL), '--smtp-port', String(SMTP)], {
    env: { ...process.env, RUNDESK_MAIL_STUB: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return new Promise((resolve, reject) => {
    let seen = ''
    const bail = setTimeout(() => reject(new Error(`the stub never announced itself: ${seen}`)), 60_000)
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

// Named after the process that writes it; a mutant's is removed by the gate that ran it.
const probeFileOf = (pid) => join(ROOT, 'apps/api', `.mail-stub-probe-${pid}.ts`)
const probe = () => {
  const file = probeFileOf(process.pid)
  try {
    writeFileSync(file, PROBE)
    const r = spawnSync('pnpm', ['exec', 'tsx', file], { cwd: join(ROOT, 'apps/api'), encoding: 'utf8', timeout: 120_000 })
    const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('RESULT '))
    if (!line) return { none: `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim().slice(-400) }
    return JSON.parse(line.slice(7))
  } finally {
    rmSync(file, { force: true })
  }
}

// Not without its switch: a test double that starts anywhere it is run is one that can be left running in production.
const refused = spawnSync(process.execPath, [STUB, '--port', String(CONTROL), '--smtp-port', String(SMTP)], { encoding: 'utf8', timeout: 20_000, env: { ...process.env, RUNDESK_MAIL_STUB: '' } })
chk(refused.status !== 0 && /RUNDESK_MAIL_STUB=1/.test(refused.stderr ?? ''), 'the stub refuses to start without RUNDESK_MAIL_STUB=1', `exit ${refused.status}: ${(refused.stderr ?? '').trim().slice(0, 120)}`)

const stub = await startStub()
let out
try {
  console.log('\n▶ the product’s mail sender, against the stub')
  out = probe()
} finally {
  stub.kill('SIGTERM')
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
if (out.none !== undefined) {
  console.error(`\n[mail-stub] the probe printed no result:\n${out.none}`)
  process.exitCode = 1
} else {
  const s = out.sent ?? {}
  chk(
    same(s.envelope, { from: 'noreply@rundesk.test', to: ['client@example.com', 'partner@example.com', 'quiet@example.com'] }),
    'a message is taken with its envelope: from the server’s address, to every recipient — the blind copy among them',
    `envelope ${JSON.stringify(s.envelope)}`,
  )
  chk(
    s.headers?.from === 'Ana López via Rundesk <noreply@rundesk.test>' && s.headers?.to === 'client@example.com' && s.headers?.cc === 'partner@example.com' && s.headers?.bcc === null,
    'its headers say who it is from, in the writer’s name, and who it is to and copied to — and no header names the blind copy',
    `headers ${JSON.stringify(s.headers)}`,
  )
  chk(
    s.headers?.replyTo === 'reply-1@inbound.test' && s.headers?.messageId === '<task-email.1@inbound.test>',
    'and the address an answer goes to, and the Message-ID an answer names',
    `headers ${JSON.stringify(s.headers)}`,
  )
  chk(s.headers?.subject === 'Quote for März', 'the subject reads as it was written, its encoded words undone', `subject ${JSON.stringify(s.headers?.subject)}`)
  chk(
    s.text === 'Hello Bea,\n.dots begin this line\nüber alles' && s.html === true,
    'the message reads as it was written — a line that begins with a dot kept as it was, the words outside ASCII decoded — with its HTML beside it',
    `text ${JSON.stringify(s.text)}, html ${JSON.stringify(s.html)}`,
  )
  chk(
    same(s.attachments, [{ filename: 'figures.txt', contentType: 'text/plain', size: Buffer.byteLength(FILE), sha1: FILE_SHA1 }]),
    'and its file is read as the one sent: its name, its type, its size and its bytes',
    `files ${JSON.stringify(s.attachments)}`,
  )
  chk(
    out.answer?.inReplyTo === '<their-answer@example.com>' && out.answer?.references === '<their-answer@example.com>',
    'an answer names the message it answers, In-Reply-To and References, so the other side’s client threads it',
    `answer ${JSON.stringify(out.answer)}`,
  )
  const r = out.refused ?? {}
  chk(
    r.first?.code === 554 && /^554 5\.7\.1/.test(r.first?.said ?? ''),
    'a refusal staged for an address refuses its next message, and the sender is told the server’s own words',
    `first ${JSON.stringify(r.first)}`,
  )
  chk(r.other === 'sent', 'a refusal staged for one address leaves every other address’s mail alone', `another address ${JSON.stringify(r.other)}`)
  chk(
    r.again?.code === 451 && r.after === 'sent' && same(r.kept, ['<task-email.6@inbound.test>']),
    'and a refusal runs out: the message after it is taken, and nothing refused was kept',
    `again ${JSON.stringify(r.again)}, after ${JSON.stringify(r.after)}, kept ${JSON.stringify(r.kept)}`,
  )
  chk(out.wrongPassword?.code === 535, 'a sign-in that is not the lane’s is refused 535, and the sender is told', `answered ${JSON.stringify(out.wrongPassword)}`)
  const bare = Array.isArray(out.bare) ? out.bare : []
  chk(bare.some((l) => /^530 /.test(l)), 'nobody who has not signed in may send: MAIL FROM is refused 530', `the session said ${JSON.stringify(bare)}`)
  chk(
    Array.isArray(out.unconfigured) && out.unconfigured[0] === false && out.unconfigured[1]?.said === 'Email is not set up on this server',
    'a server with no SMTP sends nothing, and says so rather than dropping the email',
    `answered ${JSON.stringify(out.unconfigured)}`,
  )
  chk(
    out.unreachable?.code === null && /could not be reached/.test(out.unreachable?.said ?? ''),
    'and a mail server that does not answer is said to be unreachable',
    `answered ${JSON.stringify(out.unreachable)}`,
  )
  const seam = out.seam ?? {}
  chk(
    seam.partner === 2 && seam.client === 0 && seam.partnerAfter === 1 && same(seam.left, ['<task-email.4@inbound.test>', '<task-email.7@inbound.test>']),
    'the seam reads one address’s mail, and forgets one address’s without touching the rest',
    `seam ${JSON.stringify(seam)}`,
  )
}

if (process.argv.includes('--mutate')) {
  // Each mutant runs this whole file again, a probe included.
  const MUTANT_TIMEOUT_MS = Number(process.env.STUB_GATE_MUTANT_TIMEOUT_MS) || 300_000
  const ORIGINAL = readFileSync(STUB, 'utf8')
  let blind = 0
  const MUTATIONS = [
    ['a second recipient is not kept', "        envelope.to.push(address(line.slice(line.indexOf(':') + 1)))\n", "        if (envelope.to.length === 0) envelope.to.push(address(line.slice(line.indexOf(':') + 1)))\n"],
    ['any password is taken', '          signedIn = parts[1] === USER && parts[2] === PASS\n', '          signedIn = true\n'],
    ['mail is taken without a sign-in', "        if (!signedIn) {\n          say('530 5.7.0 Authentication required')", "        if (false) {\n          say('530 5.7.0 Authentication required')"],
    ['the dots are left stuffed', ".map((l) => (l.startsWith('..') ? l.slice(1) : l))", '.map((l) => l)'],
    ['quoted-printable is left encoded', "  if (enc === 'quoted-printable') {", "  if (enc === 'never') {"],
    ['the subject is left encoded', "const pick = (name) => (h[name] === undefined ? null : decodeWords(h[name]))", "const pick = (name) => (h[name] === undefined ? null : h[name])"],
    ['a file is not read', "    attachments: leaves.filter(isFile).map((l) => ({", "    attachments: leaves.filter(() => false).map((l) => ({"],
    ['a refusal meets every address', '  const r = refusals.find((x) => envelope.to.some((t) => t.toLowerCase() === x.to))', '  const r = refusals[0]'],
    ['a refusal never runs out', '  r.left -= 1\n', ''],
    ['the seam reads every address as one', '    return json(res, 200, { messages: to ? messages.filter((m) => wentTo(m, to)) : messages })', '    return json(res, 200, { messages })'],
    ['a reset forgets every address', '    if (to) {\n      for (let i', '    if (false) {\n      for (let i'],
    ['the threading header is dropped', "      inReplyTo: pick('in-reply-to'),\n", "      inReplyTo: null,\n"],
  ]
  console.log('\n▶ and each mutation of the stub reddens a case')
  for (const [label, from, to] of MUTATIONS) {
    if (ORIGINAL.split(from).length - 1 !== 1) {
      console.log(`  \x1b[31mANCHOR MISS\x1b[0m ${label}`)
      blind += 1
      continue
    }
    // Beside the original, never over it.
    const mutant = join(dirname(STUB), `.mail-stub-mutant-${label.replace(/\W+/g, '-')}.mjs`)
    try {
      writeFileSync(mutant, ORIGINAL.split(from).join(to))
      const r = runMutant([fileURLToPath(import.meta.url)], {
        timeout: MUTANT_TIMEOUT_MS,
        env: { ...process.env, MAIL_STUB: mutant },
        leftBehind: (pid) => [probeFileOf(pid)],
      })
      if (/the probe printed no result/.test(r.stderr ?? '')) {
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — the mutant never got a result back`)
        blind += 1
        continue
      }
      if (r.error?.code === 'ETIMEDOUT' || r.signal) {
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — its run was ended after ${MUTANT_TIMEOUT_MS / 1000} s (${r.signal ?? r.error.code}): a loaded machine, not the rule; run it again`)
        blind += 1
        continue
      }
      const named = namedFailures(r.stdout)
      if (r.status === 0) {
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — every case still passes`)
        blind += 1
      } else if (named === 0) {
        const said = String(r.stderr ?? '').trim().split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 240)
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — it exited non-zero but named no case${said ? ` (it said: ${said})` : ''}`)
        blind += 1
      } else {
        console.log(`  \x1b[32mreddens\x1b[0m ${label} (${named} case(s))`)
      }
    } finally {
      rmSync(mutant, { force: true })
    }
  }
  console.log(`\n${blind === 0 ? '\x1b[32mok\x1b[0m' : '\x1b[31mnot ok\x1b[0m'} mutations: ${MUTATIONS.length - blind} of ${MUTATIONS.length} bite`)
  if (blind) fail += blind
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  console.error(`\n[mail-stub] ${fail} case(s) did not hold:`)
  for (const f of failures) console.error(`  · ${f}`)
  process.exitCode = 1
}
