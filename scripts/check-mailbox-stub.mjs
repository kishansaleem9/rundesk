#!/usr/bin/env node
/*
 * THE MAILBOX SEAM, AND THAT THE DOUBLE ON THE END OF IT IS HONEST
 * (`found-12-oct/task-email-imap-unbuilt`).
 *
 * `scripts/e2e-lanes/mailbox-stub.mjs` is the IMAP and SMTP server of a
 * mailbox linked over IMAP, on every lane and in CI; `task-email-imap.mjs`
 * reads what was signed in, sent and fetched there. A stub that took any
 * password, encrypted nothing it said it did, let a mailbox send as another,
 * found every message for every search or dropped a draft's flag would let that
 * suite pass about a product that does all of those wrong. So the product's OWN
 * client (`imap-mailbox.ts`) is driven against it here, bare IMAP and SMTP
 * sessions beside it, and each rule of the stub is broken in turn: a case must
 * notice.
 *
 *   node scripts/check-mailbox-stub.mjs            # the cases
 *   node scripts/check-mailbox-stub.mjs --mutate   # and that each one bites
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { namedFailures } from './lib/mutate.mjs'
import { freePort } from './lib/free-port.mjs'
import { runMutant } from './lib/run-mutant.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const STUB = process.env.MAILBOX_STUB ?? join(HERE, 'e2e-lanes/mailbox-stub.mjs')
// Asked of the OS: a pid-chosen port could be a lane stub's (`scripts/lib/free-port.mjs`).
const CONTROL = await freePort()
const IMAP = await freePort()
const SMTP = await freePort()
const TLS_DIR = mkdtempSync(join(tmpdir(), 'mailbox-stub-check-'))

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

/*
 * The probe speaks as the API speaks, through the product's own client, and
 * reads the stub's control seam; what it prints is all the cases read. Each
 * step is caught on its own, so one broken rule costs one answer, not the run.
 */
const PROBE = `
import { connect } from 'node:net'
import { draftInImap, readImapThreads, sendFromImap, verifyImapMailbox } from './src/modules/email-accounts/imap-mailbox'
const C = 'http://127.0.0.1:${CONTROL}'
const call = async (path: string, body?: unknown) => {
  const r = await fetch(C + path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return r.json()
}
const OLGA = 'olga@mail.test'
const g = (over: Record<string, unknown> = {}) => ({ provider: 'imap' as const, address: OLGA, password: 'olga-pw', imapHost: '127.0.0.1', imapPort: ${IMAP}, smtpHost: '127.0.0.1', smtpPort: ${SMTP}, useSsl: true, ...over })
const said = (e: unknown) => { const x = e as { said?: string; reconnect?: boolean; message?: string }; return { said: x.said ?? x.message ?? String(e), reconnect: x.reconnect ?? null } }
const out: Record<string, unknown> = {}
const step = async (name: string, fn: () => Promise<unknown>) => { try { out[name] = await fn() } catch (e) { out[name] = { threw: said(e) } } }
/** A bare session: the greeting, then each line written and what came back to it. */
const bare = (port: number, lines: string[]) => new Promise<string>((resolve) => {
  const s = connect(port, '127.0.0.1')
  let got = ''
  let i = 0
  s.on('data', (d) => {
    got += d.toString()
    if (i < lines.length && /\\r\\n$/.test(got)) setTimeout(() => s.write(lines[i++] + '\\r\\n'), 30)
  })
  setTimeout(() => { s.destroy(); resolve(got) }, 1500)
})
;(async () => {
await call('/__control/mailbox/accounts', { address: OLGA, password: 'olga-pw' })
await call('/__control/mailbox/accounts', { address: 'mia@mail.test', password: 'mia-pw' })
await step('signedIn', async () => {
  await verifyImapMailbox(g())
  return (await call('/__control/mailbox/logins?user=' + OLGA)).logins
})
await step('wrongImap', async () => { try { await verifyImapMailbox(g({ password: 'wrong' })); return 'linked' } catch (e) { return said(e) } })
await step('wrongSmtp', async () => {
  await call('/__control/mailbox/accounts', { address: 'mia@mail.test', password: 'mia-pw' })
  const r = await bare(${SMTP}, ['EHLO probe', 'AUTH PLAIN ' + Buffer.from('\\0mia@mail.test\\0wrong').toString('base64'), 'QUIT'])
  return r
})
await step('plain', async () => {
  // Afresh: the wrong password above is Mia's too.
  await call('/__control/mailbox/reset', { address: 'mia@mail.test' })
  await call('/__control/mailbox/accounts', { address: 'mia@mail.test', password: 'mia-pw' })
  await verifyImapMailbox(g({ address: 'mia@mail.test', password: 'mia-pw', useSsl: false }))
  return (await call('/__control/mailbox/logins?user=mia@mail.test')).logins
})
await step('sent', async () => {
  const s = await sendFromImap(g(), { fromName: 'Olga', fromAddress: OLGA, to: ['a@x.test'], cc: ['b@x.test'], bcc: ['c@x.test'], subject: 'Plan', text: 'The plan.', attachments: [] })
  return { s, sent: (await call('/__control/mailbox/sent?from=' + OLGA)).messages }
})
await step('sendAsAnother', async () => bare(${SMTP}, ['EHLO probe', 'AUTH PLAIN ' + Buffer.from('\\0mia@mail.test\\0mia-pw').toString('base64'), 'MAIL FROM:<olga@mail.test>', 'QUIT']))
await step('beforeLogin', async () => bare(${IMAP}, ['a1 SELECT INBOX', 'a2 LOGOUT']))
await step('threads', async () => {
  const root = '<rd.root@mail.test>'
  const a = await call('/__control/mailbox/deliver', { to: OLGA, from: 'a@x.test', subject: 'Re: Plan', text: 'Yes.', inReplyTo: root, references: [root] })
  await call('/__control/mailbox/deliver', { to: OLGA, from: 'z@x.test', subject: 'Unrelated', text: 'No.' })
  const first = await readImapThreads(g(), [root], async () => new Set())
  const fetched1 = (await call('/__control/mailbox/fetches?user=' + OLGA)).fetches.length
  const again = await readImapThreads(g(), [root], async (ids) => new Set(ids))
  const fetched2 = (await call('/__control/mailbox/fetches?user=' + OLGA)).fetches.length
  return { a, first: first.get(root), again: again.get(root), fetched1, fetched2 }
})
await step('draft', async () => {
  await draftInImap(g(), { fromName: 'Olga', fromAddress: OLGA, to: ['a@x.test'], cc: [], bcc: [], subject: 'Draft', text: 'draft words', attachments: [] })
  return (await call('/__control/mailbox/folder?address=' + OLGA + '&name=Drafts')).messages
})
await step('reset', async () => {
  await call('/__control/mailbox/reset', { address: 'mia@mail.test' })
  return { mia: (await call('/__control/mailbox/logins?user=mia@mail.test')).logins.length, olga: (await call('/__control/mailbox/logins?user=' + OLGA)).logins.length }
})
console.log('RESULT ' + JSON.stringify(out))
process.exit(0)
})()
`

const startStub = () => {
  const child = spawn(process.execPath, [STUB, '--port', String(CONTROL), '--imap-port', String(IMAP), '--smtp-port', String(SMTP), '--tls-dir', TLS_DIR], {
    env: { ...process.env, RUNDESK_MAILBOX_STUB: '1' },
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
const probeFileOf = (pid) => join(ROOT, 'apps/api', `.mailbox-stub-probe-${pid}.ts`)
const probe = () => {
  const file = probeFileOf(process.pid)
  try {
    writeFileSync(file, PROBE)
    const r = spawnSync('pnpm', ['exec', 'tsx', file], {
      cwd: join(ROOT, 'apps/api'),
      encoding: 'utf8',
      timeout: 180_000,
      env: { ...process.env, MAILBOX_PRIVATE_SERVERS: `127.0.0.1:${IMAP} 127.0.0.1:${SMTP}`, MAILBOX_TLS_CA_FILE: join(TLS_DIR, 'cert.pem') },
    })
    const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('RESULT '))
    if (!line) {
      console.error('the probe printed no result')
      return { none: `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim().slice(-400) }
    }
    return JSON.parse(line.slice(7))
  } finally {
    rmSync(file, { force: true })
  }
}

// Not without its switch: a test double that starts anywhere it is run is one that can be left running in production.
const refused = spawnSync(process.execPath, [STUB, '--port', String(CONTROL)], { encoding: 'utf8', timeout: 20_000, env: { ...process.env, RUNDESK_MAILBOX_STUB: '' } })
chk(refused.status !== 0 && /RUNDESK_MAILBOX_STUB=1/.test(refused.stderr ?? ''), 'the stub refuses to start without RUNDESK_MAILBOX_STUB=1', `exit ${refused.status}: ${(refused.stderr ?? '').trim().slice(0, 120)}`)

const stub = await startStub()
let out = {}
try {
  console.log('\n▶ the product’s IMAP and SMTP client, against the stub')
  out = probe()
} finally {
  stub.kill()
  rmSync(TLS_DIR, { recursive: true, force: true })
}
const J = (v) => JSON.stringify(v ?? null).slice(0, 300)
const signedIn = Array.isArray(out.signedIn) ? out.signedIn : []
chk(
  signedIn.some((l) => l.protocol === 'imap' && l.ok && l.tls) && signedIn.some((l) => l.protocol === 'smtp' && l.ok && l.tls),
  'a mailbox that requires SSL is signed in to over STARTTLS on both IMAP and SMTP, and each sign-in is recorded so',
  `signedIn ${J(out.signedIn)}`,
)
chk(
  out.wrongImap?.reconnect === true && /^The IMAP server refused the sign-in/.test(out.wrongImap?.said ?? '') && /^235 /m.test(out.wrongSmtp ?? '') === false && /^535 /m.test(out.wrongSmtp ?? ''),
  'a wrong password is refused by IMAP, as a sign-in refused, and by SMTP (535)',
  `imap ${J(out.wrongImap)}; smtp ${J(out.wrongSmtp)}`,
)
const plain = Array.isArray(out.plain) ? out.plain : []
chk(plain.length >= 2 && plain.every((l) => l.ok && l.tls === false), 'a mailbox that does not require SSL is signed in to in the clear, and recorded so', `plain ${J(out.plain)}`)
const sent = out.sent?.sent?.[0]
chk(
  !!sent && sent.tls === true && JSON.stringify(sent.envelope?.to) === JSON.stringify(['a@x.test', 'b@x.test', 'c@x.test']) && sent.headers?.bcc === null
    && sent.headers?.subject === 'Plan' && sent.text === 'The plan.' && sent.headers?.messageId === out.sent?.s?.internetMessageId,
  'what is sent is kept as it went: every recipient of the envelope, the Bcc in no header, its words, its Message-ID, and over TLS',
  `sent ${J(out.sent)}`,
)
chk(/^553 /m.test(out.sendAsAnother ?? ''), 'a mailbox signed in to sends as itself only: another sender is refused (553)', `session ${J(out.sendAsAnother)}`)
chk(/^a1 NO Not signed in/m.test(out.beforeLogin ?? ''), 'nothing but signing in is answered before a sign-in', `session ${J(out.beforeLogin)}`)
const th = out.threads ?? {}
chk(
  Array.isArray(th.first) && th.first.length === 1 && th.first[0]?.internetMessageId === th.a?.messageId && th.first[0]?.text?.startsWith('Yes.')
    && Array.isArray(th.again) && th.again.length === 0 && th.fetched1 >= 1 && th.fetched2 === th.fetched1,
  'a search by References finds the answer and no other message, its whole is fetched once, and what is known is not fetched again',
  `threads ${J(th)}`,
)
const drafts = Array.isArray(out.draft) ? out.draft : []
chk(drafts.length === 1 && drafts[0].flags?.includes('\\Draft') && drafts[0].headers?.subject === 'Draft', 'a draft is kept in Drafts with its \\Draft flag', `drafts ${J(out.draft)}`)
chk(out.reset?.mia === 0 && out.reset?.olga > 0, 'the seam forgets one mailbox without touching another', `reset ${J(out.reset)}`)

if (process.argv.includes('--mutate')) {
  // Each mutant runs this whole file again, a probe included.
  const MUTANT_TIMEOUT_MS = Number(process.env.STUB_GATE_MUTANT_TIMEOUT_MS) || 300_000
  const ORIGINAL = readFileSync(STUB, 'utf8')
  let blind = 0
  const MUTATIONS = [
    ['IMAP takes any password', "    const ok = !!box && box.password === password\n    keep(logins, { protocol: 'imap',", "    const ok = !!box\n    keep(logins, { protocol: 'imap',"],
    ['SMTP takes any password', "    const ok = !!box && box.password === password\n    keep(logins, { protocol: 'smtp',", "    const ok = !!box\n    keep(logins, { protocol: 'smtp',"],
    ['IMAP offers no STARTTLS', "  const capability = () => `IMAP4rev1 ${tls ? '' : 'STARTTLS '}AUTH=PLAIN`", "  const capability = () => `IMAP4rev1 AUTH=PLAIN`"],
    ['a sign-in is recorded as over TLS whatever it was', "    keep(logins, { protocol: 'imap', how, user: addressOf(name), tls, ok, at: Date.now() })", "    keep(logins, { protocol: 'imap', how, user: addressOf(name), tls: true, ok, at: Date.now() })"],
    ['a mailbox sends as anybody', "      if (addr !== user) return say(", "      if (addr === 'never') return say("],
    ['the envelope keeps one recipient', '        keep(sent, { user, tls, envelope: { from, to: rcpts }, raw, at: Date.now() })', '        keep(sent, { user, tls, envelope: { from, to: rcpts.slice(0, 1) }, raw, at: Date.now() })'],
    ['IMAP answers before a sign-in', "    if (!user) return say(`${tag} NO Not signed in\\r\\n`)\n", ''],
    ['a header search finds every message', "    return (m) => (headersOf(m.raw).get(field) ?? []).some((v) => v.toLowerCase().includes(want))", '    return () => true'],
    ['a draft loses its flags', '        while (toks.length && toks[0] !== \')\') flags.add(String(toks.shift()))', "        while (toks.length && toks[0] !== ')') toks.shift()"],
    ['a whole message given is not counted', '          keep(fetches, { user, uid, at: Date.now() })\n', ''],
    ['a reset forgets every mailbox', '      boxes.delete(who)\n', '      boxes.clear()\n      for (const list of [sent, logins, fetches]) list.length = 0\n'],
  ]
  console.log('\n▶ and each mutation of the stub reddens a case')
  for (const [label, from, to] of MUTATIONS) {
    if (ORIGINAL.split(from).length - 1 !== 1) {
      console.log(`  \x1b[31mANCHOR MISS\x1b[0m ${label}`)
      blind += 1
      continue
    }
    // Beside the original, never over it.
    const mutant = join(dirname(STUB), `.mailbox-stub-mutant-${label.replace(/\W+/g, '-')}.mjs`)
    try {
      writeFileSync(mutant, ORIGINAL.split(from).join(to))
      const r = runMutant([fileURLToPath(import.meta.url)], {
        timeout: MUTANT_TIMEOUT_MS,
        env: { ...process.env, MAILBOX_STUB: mutant },
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
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — it exited non-zero but named no case`)
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
  console.error(`\n[mailbox-stub] ${fail} case(s) did not hold:`)
  for (const f of failures) console.error(`  · ${f}`)
  process.exitCode = 1
}
