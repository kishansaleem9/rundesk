import assert from 'node:assert/strict'
import { createServer, type AddressInfo, type Socket } from 'node:net'
import { test } from 'node:test'
import { open, seal, secretBoxReadiness, SecretBoxRefused, SecretBoxUnavailable } from '../../common/security/secret-box'
import { astring, ImapSession, takeResponse } from './imap.client'
import { buildMime, decodeHeaderWords, parseRawMail } from './mail-message'
import { mailHostOf, mailPortOf, MailServerRefused, resolveMailServer } from './mail-server'

/**
 * A mailbox linked over IMAP and SMTP (`found-12-oct/task-email-imap-unbuilt`):
 * its password kept sealed, its servers checked before they are reached, IMAP
 * read as the RFC writes it, and a message read as a mail client reads it.
 */

const KEY = { TOKEN_ENCRYPTION_KEY: 'a'.repeat(64) } as NodeJS.ProcessEnv
const OTHER_KEY = { TOKEN_ENCRYPTION_KEY: 'b'.repeat(64) } as NodeJS.ProcessEnv

test('a sealed password opens for its own row under its own key, and nowhere else', () => {
  const boxed = seal('hunter2 ü', 'email_accounts.password:1', KEY)
  assert.ok(!boxed.includes('hunter2'), boxed)
  assert.equal(open(boxed, 'email_accounts.password:1', KEY), 'hunter2 ü')
  assert.notEqual(seal('hunter2 ü', 'email_accounts.password:1', KEY), boxed, 'a fresh nonce each time')
  assert.throws(() => open(boxed, 'email_accounts.password:2', KEY), SecretBoxRefused)
  assert.throws(() => open(boxed, 'email_accounts.password:1', OTHER_KEY), SecretBoxRefused)
  assert.throws(() => open(`${boxed.slice(0, -2)}AA`, 'email_accounts.password:1', KEY), SecretBoxRefused)
})

test('with no key, or a key that is not 32 bytes, nothing is sealed and the reason is said', () => {
  assert.throws(() => seal('x', 'c', {} as NodeJS.ProcessEnv), SecretBoxUnavailable)
  assert.deepEqual(secretBoxReadiness({} as NodeJS.ProcessEnv), { available: false, reason: 'Not set up on this server — missing TOKEN_ENCRYPTION_KEY' })
  const short = secretBoxReadiness({ TOKEN_ENCRYPTION_KEY: 'abcd' } as NodeJS.ProcessEnv)
  assert.equal(short.available, false)
  assert.match((short as { reason: string }).reason, /not 32 bytes/)
  assert.deepEqual(secretBoxReadiness({ TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') } as NodeJS.ProcessEnv), { available: true })
})

test('a mail server on a private network is refused unless the operator names it; one on the internet is reached at the address checked', async () => {
  const lookup = (answers: Record<string, string>) => async (host: string) => (answers[host] ? [{ address: answers[host], family: 4 }] : [])
  await assert.rejects(resolveMailServer('127.0.0.1', 993, { env: {} as NodeJS.ProcessEnv }), MailServerRefused)
  await assert.rejects(resolveMailServer('169.254.169.254', 993, { env: {} as NodeJS.ProcessEnv }), MailServerRefused)
  await assert.rejects(
    resolveMailServer('mail.inside.test', 143, { env: {} as NodeJS.ProcessEnv, lookup: lookup({ 'mail.inside.test': '10.0.0.5' }) }),
    /private network/,
  )
  await assert.rejects(resolveMailServer('nowhere.test', 993, { env: {} as NodeJS.ProcessEnv, lookup: lookup({}) }), /was not found/)
  const named = await resolveMailServer('127.0.0.1', 9811, { env: { MAILBOX_PRIVATE_SERVERS: '127.0.0.1:9811, 127.0.0.1:9861' } as NodeJS.ProcessEnv })
  assert.deepEqual(named, { host: '127.0.0.1', port: 9811, address: '127.0.0.1' })
  // Named for one port, not for every port of that host.
  await assert.rejects(resolveMailServer('127.0.0.1', 5432, { env: { MAILBOX_PRIVATE_SERVERS: '127.0.0.1:9811' } as NodeJS.ProcessEnv }), MailServerRefused)
  const out = await resolveMailServer('IMAP.Example.com', 993, { env: {} as NodeJS.ProcessEnv, lookup: lookup({ 'imap.example.com': '93.184.216.34' }) })
  assert.deepEqual(out, { host: 'imap.example.com', port: 993, address: '93.184.216.34', servername: 'imap.example.com' })
})

test('a server name and a port are read as typed, and refused when they are not one', () => {
  assert.equal(mailHostOf(' smtp.mail.yahoo.com '), 'smtp.mail.yahoo.com')
  assert.equal(mailHostOf('[::1]'), '::1')
  for (const bad of ['', 'imap example.com', 'imap.example.com/path', 'http://imap.example.com', '-x.com', 7]) assert.equal(mailHostOf(bad), null, String(bad))
  assert.equal(mailPortOf('993'), 993)
  assert.equal(mailPortOf(465), 465)
  for (const bad of [0, 65536, 99.5, '99a', null]) assert.equal(mailPortOf(bad), null, String(bad))
})

test('an IMAP response is taken whole, literals and all, only once all of it has come', () => {
  const full = Buffer.from('* 3 FETCH (UID 7 BODY[] {11}\r\nhello\r\nyou!)\r\nR1 OK done\r\n')
  assert.equal(takeResponse(full.subarray(0, 30)), null)
  const got = takeResponse(full)!
  assert.equal(got.response.text, '* 3 FETCH (UID 7 BODY[] {#0})')
  assert.equal(got.response.literals[0].toString(), 'hello\r\nyou!')
  assert.equal(takeResponse(got.rest)!.response.text, 'R1 OK done')
  assert.equal(astring('pa"ss\\word'), '"pa\\"ss\\\\word"')
  assert.deepEqual(astring('пароль'), { literal: Buffer.from('пароль', 'utf8') })
})

test('a message is read as a mail client reads it: the plain part, in its charset, its subject decoded, and the ids it threads by', () => {
  const raw = Buffer.from(
    [
      'Message-ID: <answer.1@client.test>',
      'In-Reply-To: <rd.root@mail.test>',
      'References: <rd.root@mail.test>',
      ' <rd.second@mail.test>',
      'From: =?UTF-8?Q?Ren=C3=A9e?= <Renee@Client.test>',
      'To: "Olga" <olga@mail.test>, b@x.test',
      'Subject: =?UTF-8?B?UmU6IHF1YXJ0ZXJseSDwn5OI?=',
      'Date: Tue, 13 Oct 2026 12:00:00 +0000',
      'MIME-Version: 1.0',
      'Content-Type: multipart/alternative; boundary="b1"',
      '',
      '--b1',
      'Content-Type: text/plain; charset="iso-8859-1"',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      'Merci, c=E9 parfait.=',
      ' Envoy=E9.',
      '',
      'On Tue, Olga wrote:',
      '> the plan',
      '--b1',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>ignored</p>',
      '--b1--',
      '',
    ].join('\r\n'),
    'latin1',
  )
  const m = parseRawMail(raw)
  assert.equal(m.messageId, '<answer.1@client.test>')
  assert.equal(m.inReplyTo, '<rd.root@mail.test>')
  assert.deepEqual(m.references, ['<rd.root@mail.test>', '<rd.second@mail.test>'])
  assert.equal(m.from, 'renee@client.test')
  assert.deepEqual(m.to, ['olga@mail.test', 'b@x.test'])
  assert.equal(m.subject, 'Re: quarterly 📈')
  assert.equal(m.at, Date.parse('2026-10-13T12:00:00Z'))
  assert.match(m.text, /^Merci, cé parfait. Envoyé\.\n\nOn Tue, Olga wrote:/)
  assert.equal(decodeHeaderWords('=?utf-8?q?a_b?= =?utf-8?q?c?='), 'a bc')
  const html = parseRawMail(Buffer.from('Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + Buffer.from('<p>Héllo</p><p>two</p>').toString('base64')))
  assert.equal(html.text, 'Héllo\n\ntwo')
})

test('a message sent over SMTP names its own Message-ID and Date, and carries no Bcc header when given none', () => {
  const raw = buildMime({
    fromName: 'Olga',
    fromAddress: 'olga@mail.test',
    to: ['a@x.test'],
    cc: [],
    bcc: [],
    subject: 'Hello',
    text: 'Hi',
    attachments: [],
    messageId: '<rd.1@mail.test>',
    date: new Date('2026-10-13T12:00:00Z'),
    references: ['<rd.root@mail.test>', '<a.1@x.test>'],
    inReplyTo: '<a.1@x.test>',
  })
  assert.match(raw, /^Date: Tue, 13 Oct 2026 12:00:00 \+0000\r\nMessage-ID: <rd\.1@mail\.test>\r\n/)
  assert.match(raw, /\r\nReferences: <rd\.root@mail\.test> <a\.1@x\.test>\r\n/)
  assert.doesNotMatch(raw, /\r\nBcc:/)
})

/**
 * A SERVER THAT SAYS ONLY WHAT RFC 3501 SAYS, scripted line by line, so the
 * client is held to the protocol and not to the lane's stub (which this file
 * did not write).
 */
async function scripted(onLine: (line: string, say: (s: string | Buffer) => void, sock: Socket) => void) {
  const seen: string[] = []
  const server = createServer((sock) => {
    sock.write('* OK [CAPABILITY IMAP4rev1 AUTH=PLAIN] ready\r\n')
    let buf = ''
    sock.on('data', (d) => {
      buf += d.toString('latin1')
      for (let i = buf.indexOf('\r\n'); i >= 0; i = buf.indexOf('\r\n')) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 2)
        seen.push(line)
        onLine(line, (s) => sock.write(s), sock)
      }
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return { port: (server.address() as AddressInfo).port, seen, close: () => new Promise<void>((r) => server.close(() => r())) }
}

test('the client signs in, searches, fetches and appends as RFC 3501 has it; a password a quoted string cannot carry goes by AUTHENTICATE PLAIN', async () => {
  const srv = await scripted((line, say) => {
    const [tag, cmd] = line.split(' ')
    if (line === 'kept') say('R6 OK [APPENDUID 42 10] kept\r\n')
    else if (cmd === 'CAPABILITY') say(`* CAPABILITY IMAP4rev1 AUTH=PLAIN\r\n${tag} OK done\r\n`)
    else if (cmd === 'AUTHENTICATE') say('+ \r\n')
    else if (/^[A-Za-z0-9+/=]+$/.test(line)) say(Buffer.from(line, 'base64').toString('utf8') === '\0olga@mail.test\0пароль' ? 'R2 OK signed in\r\n' : 'R2 NO [AUTHENTICATIONFAILED] wrong\r\n')
    else if (cmd === 'EXAMINE') say(`* 2 EXISTS\r\n* OK [UIDVALIDITY 42] ok\r\n${tag} OK [READ-ONLY] done\r\n`)
    else if (cmd === 'UID' && line.includes('SEARCH')) say(`* SEARCH 5 9\r\n${tag} OK done\r\n`)
    else if (cmd === 'UID' && line.includes('FETCH')) say(`* 1 FETCH (UID 5 BODY[] {5}\r\nfirst)\r\n* 2 FETCH (BODY[] {6}\r\nsecond UID 9)\r\n${tag} OK done\r\n`)
    else if (cmd === 'APPEND') say('+ go on\r\n')
    else if (cmd === 'LOGOUT') say(`* BYE\r\n${tag} OK bye\r\n`)
  })
  try {
    const s = await ImapSession.open({ server: { host: '127.0.0.1', port: srv.port, address: '127.0.0.1' }, useSsl: false, user: 'olga@mail.test', password: 'пароль' })
    assert.equal((await s.examine('INBOX')).uidValidity, '42')
    assert.deepEqual(await s.uidSearch('OR HEADER References "rd.root@mail.test" HEADER In-Reply-To "rd.root@mail.test"'), [5, 9])
    const got = await s.uidFetch([5, 9], 'BODY.PEEK[]')
    assert.equal(got.get(5)?.toString(), 'first')
    assert.equal(got.get(9)?.toString(), 'second')
    await s.append('Drafts', ['\\Draft'], Buffer.from('kept'))
    await s.logout()
    assert.ok(srv.seen.includes('R2 AUTHENTICATE PLAIN'), srv.seen.join(' | '))
    assert.ok(!srv.seen.some((l) => l.includes('пароль')), 'the password never crossed as text')
    assert.ok(srv.seen.some((l) => /^R\d+ APPEND "Drafts" \(\\Draft\) \{4\}$/.test(l)), srv.seen.join(' | '))
  } finally {
    await srv.close()
  }
})

test('a sign-in the server refuses is a refusal of the sign-in, in its words; and "Requires SSL" with no STARTTLS offered is refused before any password is sent', async () => {
  const refusing = await scripted((line, say) => {
    const [tag, cmd] = line.split(' ')
    if (cmd === 'CAPABILITY') say(`* CAPABILITY IMAP4rev1\r\n${tag} OK done\r\n`)
    else if (cmd === 'LOGIN') say(`${tag} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n`)
  })
  try {
    await assert.rejects(
      ImapSession.open({ server: { host: '127.0.0.1', port: refusing.port, address: '127.0.0.1' }, useSsl: false, user: 'olga@mail.test', password: 'wrong' }),
      (err: { said?: string; signIn?: boolean }) => err.signIn === true && /refused the sign-in: \[AUTHENTICATIONFAILED\] Invalid credentials/.test(err.said ?? ''),
    )
    await assert.rejects(
      ImapSession.open({ server: { host: '127.0.0.1', port: refusing.port, address: '127.0.0.1' }, useSsl: true, user: 'olga@mail.test', password: 'secret-pass' }),
      (err: { said?: string; signIn?: boolean }) => err.signIn === false && /offers no TLS/.test(err.said ?? ''),
    )
    assert.ok(!refusing.seen.some((l) => l.includes('secret-pass')), refusing.seen.join(' | '))
  } finally {
    await refusing.close()
  }
})
