#!/usr/bin/env node
/*
 * A MAILBOX SERVER, AS A PERSON'S OWN PROVIDER RUNS ONE (`found-12-oct/task-email-imap-unbuilt`).
 *
 * ClickUp links "another mailbox over IMAP" by its address, its password and
 * its IMAP and SMTP servers. No lane reaches a real one, so every lane runs
 * this beside `mail-stub.mjs` (the server's own outgoing mail), and a suite
 * makes mailboxes here, delivers the answers a client would write, and reads
 * back what was sent through it and how.
 *
 * WHAT IT SPEAKS
 *   IMAP4rev1 (RFC 3501), the part a client reading answers and leaving drafts
 *   uses: CAPABILITY, NOOP, LOGOUT, STARTTLS, LOGIN, AUTHENTICATE PLAIN (RFC
 *   4616), LIST (with RFC 6154's \Drafts and \Sent), SELECT, EXAMINE, UID
 *   SEARCH (ALL, HEADER, OR, NOT, UID), UID FETCH (UID, FLAGS, INTERNALDATE,
 *   BODY[], BODY.PEEK[], BODY.PEEK[HEADER.FIELDS (…)]) and APPEND; a literal
 *   `{n}` is asked for with "+" (`{n+}` is taken without asking). Nothing but
 *   CAPABILITY, STARTTLS, LOGIN, AUTHENTICATE, NOOP and LOGOUT before signing in.
 *   SMTP submission (RFC 5321, 4954, 3207): EHLO, HELO, STARTTLS, AUTH PLAIN and
 *   AUTH LOGIN against the mailboxes' passwords, MAIL FROM — the signed-in
 *   mailbox's own address and no other (553) — RCPT TO, DATA, RSET, NOOP, QUIT.
 *   Both offer STARTTLS on a certificate of their own for 127.0.0.1, made once
 *   by openssl into `--tls-dir`; a client trusts it by `MAILBOX_TLS_CA_FILE`.
 *
 * WHAT IT KEEPS, and the control seam on `--port`, for suites:
 *   POST /__control/mailbox/accounts {address, password}   make a mailbox, or change its password
 *   POST /__control/mailbox/deliver {to, from, subject, text, inReplyTo?, references?, raw?}
 *                                                          a message into its INBOX, as a client sent it
 *   GET  /__control/mailbox/sent?from=a                     what went out through SMTP signed in as `a`:
 *                                                          envelope, headers, words, and whether TLS carried it
 *   GET  /__control/mailbox/logins?user=a                   each sign-in, IMAP or SMTP: refused or not, over TLS or not
 *   GET  /__control/mailbox/fetches?user=a                  each whole message an IMAP client signed in as `a` was given
 *   GET  /__control/mailbox/folder?address=a&name=Drafts    what a folder holds
 *   POST /__control/mailbox/fail {address, code, count}     the next `count` emails from `address` refused at DATA
 *   POST /__control/mailbox/reset {address}                 forget the mailbox and everything about it
 *   GET  /__control/version                                which source this process runs
 *
 * NOT FOR PRODUCTION. Binds loopback, and refuses to start without
 * `RUNDESK_MAILBOX_STUB=1`. Prints one line of JSON when all three ports listen.
 *
 *   RUNDESK_MAILBOX_STUB=1 node scripts/e2e-lanes/mailbox-stub.mjs --port 9901 --imap-port 9801 --smtp-port 9851 --tls-dir /tmp/claude-0/mailbox-tls-1
 */
import { createServer as createTcpServer } from 'node:net'
import { createServer as createHttpServer } from 'node:http'
import { TLSSocket } from 'node:tls'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

if (process.env.RUNDESK_MAILBOX_STUB !== '1') {
  console.error('[mailbox-stub] refusing to start without RUNDESK_MAILBOX_STUB=1 — this is a test double')
  process.exitCode = 1
  process.exit()
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const PORT = Number(arg('port', '9900'))
const IMAP_PORT = Number(arg('imap-port', '9800'))
const SMTP_PORT = Number(arg('smtp-port', '9850'))
const TLS_DIR = arg('tls-dir', `/tmp/claude-0/mailbox-tls-${PORT}`)
// Which source this process runs: `lane-env.sh` restarts a stub whose file has moved, as it does the mail stub.
const SOURCE = createHash('sha1').update(readFileSync(new URL(import.meta.url))).digest('hex').slice(0, 12)

/** Its certificate: made once, for 127.0.0.1 and localhost, and trusted by whoever reads `cert.pem`. */
function certificate() {
  mkdirSync(TLS_DIR, { recursive: true })
  const key = join(TLS_DIR, 'key.pem')
  const cert = join(TLS_DIR, 'cert.pem')
  if (!existsSync(key) || !existsSync(cert)) {
    execFileSync(
      'openssl',
      ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '3650', '-subj', '/CN=rundesk-mailbox-stub', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'],
      { stdio: 'ignore' },
    )
  }
  return { key: readFileSync(key), cert: readFileSync(cert), certPath: cert }
}
const TLS = certificate()

// ── WHAT IT KEEPS ──────────────────────────────────────────────────────────
const boxes = new Map() // address → { password, uidValidity, nextUid, folders: Map(name → { special, messages: [{ uid, raw, flags:Set, at }] }) }
const sent = [] // { user, tls, envelope: { from, to }, raw, at }
const logins = [] // { protocol, user, tls, ok, at }
const fetches = [] // { user, uid, at }: each whole message an IMAP client was given
const failing = new Map() // address → { code, count }
const KEEP = 500
const keep = (list, item) => {
  list.push(item)
  if (list.length > KEEP) list.splice(0, list.length - KEEP)
}

function makeBox(address, password) {
  const folders = new Map([
    ['INBOX', { special: null, messages: [] }],
    ['Drafts', { special: '\\Drafts', messages: [] }],
    ['Sent', { special: '\\Sent', messages: [] }],
  ])
  return { password, uidValidity: Math.floor(Date.now() / 1000) % 2147483647, nextUid: 1, folders }
}
const addressOf = (s) => String(s ?? '').trim().toLowerCase()

/** Headers by lower-case name, each a list of its values, folded lines joined. */
function headersOf(raw) {
  const text = raw.toString('latin1')
  const end = text.search(/\r?\n\r?\n/)
  const head = (end >= 0 ? text.slice(0, end) : text).replace(/\r?\n[ \t]+/g, ' ')
  const out = new Map()
  for (const line of head.split(/\r?\n/)) {
    const m = /^([^:\s]+):\s*(.*)$/.exec(line)
    if (m) out.set(m[1].toLowerCase(), [...(out.get(m[1].toLowerCase()) ?? []), m[2]])
  }
  return out
}

/** The words a client shows: the first text/plain part, its transfer encoding undone. */
function wordsOf(raw) {
  const text = raw.toString('latin1')
  const end = text.search(/\r?\n\r?\n/)
  const h = headersOf(raw)
  const body = end >= 0 ? text.slice(end).replace(/^\r?\n\r?\n/, '') : ''
  const type = (h.get('content-type')?.[0] ?? 'text/plain').toLowerCase()
  const boundary = /boundary="?([^";]+)"?/i.exec(h.get('content-type')?.[0] ?? '')?.[1]
  if (type.startsWith('multipart/') && boundary) {
    for (const part of body.split(`--${boundary}`).slice(1)) {
      const words = wordsOf(Buffer.from(part.replace(/^\r?\n/, ''), 'latin1'))
      if (words !== null) return words
    }
    return null
  }
  if (!type.startsWith('text/plain')) return null
  const cte = (h.get('content-transfer-encoding')?.[0] ?? '').toLowerCase()
  if (cte === 'base64') return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8')
  if (cte === 'quoted-printable') return Buffer.from(body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, x) => String.fromCharCode(parseInt(x, 16))), 'latin1').toString('utf8')
  return Buffer.from(body, 'latin1').toString('utf8')
}

const view = (raw) => {
  const h = headersOf(raw)
  const one = (n) => h.get(n)?.[0] ?? null
  return {
    headers: {
      messageId: one('message-id'),
      date: one('date'),
      from: one('from'),
      to: one('to'),
      cc: one('cc'),
      bcc: one('bcc'),
      subject: one('subject'),
      inReplyTo: one('in-reply-to'),
      references: one('references'),
    },
    text: wordsOf(raw),
  }
}

// ── IMAP ───────────────────────────────────────────────────────────────────

/** IMAP's arguments: atoms (brackets kept whole), quoted strings, literals, and parentheses. */
function tokensOf(s, lits) {
  const out = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === ' ') {
      i++
    } else if (c === '"') {
      let j = i + 1
      let v = ''
      while (j < s.length && s[j] !== '"') {
        if (s[j] === '\\') j++
        v += s[j++]
      }
      out.push(v)
      i = j + 1
    } else if (c === '(' || c === ')') {
      out.push(c)
      i++
    } else if (/^\{#\d+\}/.test(s.slice(i))) {
      const m = /^\{#(\d+)\}/.exec(s.slice(i))
      out.push(lits[Number(m[1])])
      i += m[0].length
    } else {
      let j = i
      let depth = 0
      while (j < s.length && (depth > 0 || (s[j] !== ' ' && s[j] !== '(' && s[j] !== ')'))) {
        if (s[j] === '[') depth++
        if (s[j] === ']') depth--
        j++
      }
      out.push(s.slice(i, j))
      i = j
    }
  }
  return out
}

function uidsIn(set, all) {
  const max = all.length ? all[all.length - 1] : 0
  const out = new Set()
  for (const part of String(set).split(',')) {
    const [a, b] = part.split(':')
    const lo = a === '*' ? max : Number(a)
    const hi = b === undefined ? lo : b === '*' ? max : Number(b)
    for (const u of all) if (u >= Math.min(lo, hi) && u <= Math.max(lo, hi)) out.add(u)
  }
  return all.filter((u) => out.has(u))
}

/** A search key, read off the front of the tokens: a test of one message. */
function criterion(toks, all) {
  const t = String(toks.shift() ?? '').toUpperCase()
  if (t === 'ALL') return () => true
  if (t === 'OR') {
    const a = criterion(toks, all)
    const b = criterion(toks, all)
    return (m) => a(m) || b(m)
  }
  if (t === 'NOT') {
    const a = criterion(toks, all)
    return (m) => !a(m)
  }
  if (t === 'HEADER') {
    const field = String(toks.shift() ?? '').toLowerCase()
    const want = String(toks.shift() ?? '').toLowerCase()
    return (m) => (headersOf(m.raw).get(field) ?? []).some((v) => v.toLowerCase().includes(want))
  }
  if (t === 'UID') {
    const set = new Set(uidsIn(toks.shift(), all))
    return (m) => set.has(m.uid)
  }
  if (t === 'SEEN') return (m) => m.flags.has('\\Seen')
  if (t === 'UNSEEN') return (m) => !m.flags.has('\\Seen')
  throw new Error(`no search key ${t}`)
}

function imapSession(socket) {
  let sock = socket
  let tls = false
  let user = null
  let selected = null
  let readOnly = true
  let buf = Buffer.alloc(0)
  let text = ''
  let lits = []
  let need = -1
  let authTag = null
  let paused = false
  const say = (s) => {
    if (!sock.destroyed) sock.write(s)
  }
  const capability = () => `IMAP4rev1 ${tls ? '' : 'STARTTLS '}AUTH=PLAIN`

  const signIn = (tag, name, password, how) => {
    const box = boxes.get(addressOf(name))
    const ok = !!box && box.password === password
    keep(logins, { protocol: 'imap', how, user: addressOf(name), tls, ok, at: Date.now() })
    if (!ok) return say(`${tag} NO [AUTHENTICATIONFAILED] Invalid credentials (Failure)\r\n`)
    user = addressOf(name)
    say(`${tag} OK [CAPABILITY ${capability()}] ${user} authenticated (Success)\r\n`)
  }

  const handle = (line, literals) => {
    const sp = line.indexOf(' ')
    if (sp < 0) return say(`* BAD no command\r\n`)
    const tag = line.slice(0, sp)
    let rest = line.slice(sp + 1)
    let word = rest.split(' ')[0].toUpperCase()
    rest = rest.slice(word.length).trim()
    if (word === 'UID') {
      const sub = rest.split(' ')[0].toUpperCase()
      word = `UID ${sub}`
      rest = rest.slice(sub.length).trim()
    }
    const args = () => tokensOf(rest, literals)
    if (word === 'CAPABILITY') return say(`* CAPABILITY ${capability()}\r\n${tag} OK CAPABILITY completed\r\n`)
    if (word === 'NOOP') return say(`${tag} OK NOOP completed\r\n`)
    if (word === 'LOGOUT') {
      say(`* BYE logging out\r\n${tag} OK LOGOUT completed\r\n`)
      return sock.end()
    }
    if (word === 'STARTTLS') {
      if (tls) return say(`${tag} BAD TLS is already on\r\n`)
      say(`${tag} OK Begin TLS negotiation now\r\n`)
      paused = true
      sock.removeAllListeners('data')
      const secured = new TLSSocket(sock, { isServer: true, key: TLS.key, cert: TLS.cert })
      secured.on('secure', () => {
        tls = true
        sock = secured
        buf = Buffer.alloc(0)
        paused = false
        secured.on('data', onData)
      })
      secured.on('error', () => secured.destroy())
      return
    }
    if (word === 'LOGIN') {
      const [name, password] = args()
      return signIn(tag, String(name ?? ''), String(password ?? ''), 'LOGIN')
    }
    if (word === 'AUTHENTICATE') {
      if (rest.toUpperCase() !== 'PLAIN') return say(`${tag} NO [CANNOT] only PLAIN\r\n`)
      authTag = tag
      return say('+ \r\n')
    }
    if (!user) return say(`${tag} NO Not signed in\r\n`)
    const box = boxes.get(user)
    if (!box) return say(`${tag} NO [UNAVAILABLE] this mailbox is gone\r\n`)
    if (word === 'LIST') {
      for (const [name, f] of box.folders) say(`* LIST (\\HasNoChildren${f.special ? ` ${f.special}` : ''}) "/" "${name}"\r\n`)
      return say(`${tag} OK LIST completed\r\n`)
    }
    if (word === 'SELECT' || word === 'EXAMINE') {
      const [name] = args()
      const f = box.folders.get(name === undefined ? '' : String(name).toUpperCase() === 'INBOX' ? 'INBOX' : String(name))
      if (!f) return say(`${tag} NO [NONEXISTENT] no folder ${name}\r\n`)
      selected = String(name).toUpperCase() === 'INBOX' ? 'INBOX' : String(name)
      readOnly = word === 'EXAMINE'
      say(`* FLAGS (\\Seen \\Draft \\Answered \\Flagged \\Deleted)\r\n* ${f.messages.length} EXISTS\r\n* 0 RECENT\r\n`)
      say(`* OK [UIDVALIDITY ${box.uidValidity}] UIDs valid\r\n* OK [UIDNEXT ${box.nextUid}] Predicted next UID\r\n`)
      return say(`${tag} OK [${readOnly ? 'READ-ONLY' : 'READ-WRITE'}] ${word} completed\r\n`)
    }
    if (word === 'APPEND') {
      const toks = args()
      const name = String(toks.shift() ?? '')
      const f = box.folders.get(name.toUpperCase() === 'INBOX' ? 'INBOX' : name)
      if (!f) return say(`${tag} NO [TRYCREATE] no folder ${name}\r\n`)
      const flags = new Set()
      if (toks[0] === '(') {
        toks.shift()
        while (toks.length && toks[0] !== ')') flags.add(String(toks.shift()))
        toks.shift()
      }
      const raw = toks.find((x) => Buffer.isBuffer(x))
      if (!raw) return say(`${tag} BAD APPEND takes the message as a literal\r\n`)
      const uid = box.nextUid++
      f.messages.push({ uid, raw: Buffer.from(raw), flags, at: Date.now() })
      return say(`${tag} OK [APPENDUID ${box.uidValidity} ${uid}] APPEND completed\r\n`)
    }
    if (!selected) return say(`${tag} BAD No folder selected\r\n`)
    const folder = box.folders.get(selected)
    if (word === 'UID SEARCH') {
      const all = folder.messages.map((m) => m.uid)
      let tests
      try {
        const toks = args()
        tests = []
        while (toks.length) tests.push(criterion(toks, all))
      } catch (err) {
        return say(`${tag} BAD ${err.message}\r\n`)
      }
      const found = folder.messages.filter((m) => tests.every((t) => t(m))).map((m) => m.uid)
      return say(`* SEARCH${found.length ? ` ${found.join(' ')}` : ''}\r\n${tag} OK SEARCH completed\r\n`)
    }
    if (word === 'UID FETCH') {
      const m = /^(\S+)\s+\((.*)\)$/s.exec(rest)
      if (!m) return say(`${tag} BAD FETCH takes a set and its items\r\n`)
      const items = m[2].toUpperCase()
      const all = folder.messages.map((x) => x.uid)
      for (const uid of uidsIn(m[1], all)) {
        const seq = folder.messages.findIndex((x) => x.uid === uid) + 1
        const msg = folder.messages[seq - 1]
        const parts = [`UID ${uid}`]
        if (items.includes('FLAGS')) parts.push(`FLAGS (${[...msg.flags].join(' ')})`)
        if (items.includes('INTERNALDATE')) parts.push(`INTERNALDATE "${new Date(msg.at).toUTCString()}"`)
        let literal = null
        const fields = /BODY\.PEEK\[HEADER\.FIELDS \(([^)]*)\)\]/.exec(items)
        if (fields) {
          const names = fields[1].toLowerCase().split(/\s+/)
          const h = headersOf(msg.raw)
          const lines = names.flatMap((n) => (h.get(n) ?? []).map((v) => `${n.replace(/(^|-)([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace('Message-Id', 'Message-ID')}: ${v}\r\n`))
          literal = { name: `BODY[HEADER.FIELDS (${fields[1]})]`, bytes: Buffer.from(`${lines.join('')}\r\n`, 'latin1') }
        } else if (/BODY(\.PEEK)?\[\]/.test(items)) {
          if (!items.includes('PEEK') && !readOnly) msg.flags.add('\\Seen')
          literal = { name: 'BODY[]', bytes: msg.raw }
          keep(fetches, { user, uid, at: Date.now() })
        }
        if (literal) {
          say(`* ${seq} FETCH (${parts.join(' ')} ${literal.name} {${literal.bytes.length}}\r\n`)
          say(literal.bytes)
          say(')\r\n')
        } else {
          say(`* ${seq} FETCH (${parts.join(' ')})\r\n`)
        }
      }
      return say(`${tag} OK FETCH completed\r\n`)
    }
    say(`${tag} BAD Unknown command ${word}\r\n`)
  }

  const onData = (chunk) => {
    buf = Buffer.concat([buf, chunk])
    while (!paused) {
      if (need >= 0) {
        if (buf.length < need) return
        lits.push(Buffer.from(buf.subarray(0, need)))
        text += `{#${lits.length - 1}}`
        buf = buf.subarray(need)
        need = -1
        continue
      }
      const eol = buf.indexOf('\r\n')
      if (eol < 0) return
      const line = buf.subarray(0, eol).toString('utf8')
      buf = buf.subarray(eol + 2)
      if (authTag) {
        const tag = authTag
        authTag = null
        const [, name = '', password = ''] = Buffer.from(line, 'base64').toString('utf8').split('\0')
        signIn(tag, name, password, 'AUTHENTICATE')
        continue
      }
      const lit = /\{(\d+)(\+?)\}$/.exec(line)
      if (lit) {
        text += line.slice(0, -lit[0].length)
        need = Number(lit[1])
        if (!lit[2]) say('+ Ready for literal data\r\n')
        continue
      }
      const whole = text + line
      const literals = lits
      text = ''
      lits = []
      handle(whole, literals)
    }
  }
  sock.on('data', onData)
  sock.on('error', () => sock.destroy())
  say(`* OK [CAPABILITY ${capability()}] Rundesk mailbox stub ready\r\n`)
}

// ── SMTP SUBMISSION ────────────────────────────────────────────────────────

function smtpSession(socket) {
  let sock = socket
  let tls = false
  let user = null
  let from = null
  let rcpts = []
  let buf = ''
  let data = null
  let authStep = null
  let paused = false
  const say = (s) => {
    if (!sock.destroyed) sock.write(`${s}\r\n`)
  }
  const signIn = (name, password, how) => {
    const box = boxes.get(addressOf(name))
    const ok = !!box && box.password === password
    keep(logins, { protocol: 'smtp', how, user: addressOf(name), tls, ok, at: Date.now() })
    if (!ok) return say('535 5.7.8 Authentication credentials invalid')
    user = addressOf(name)
    say('235 2.7.0 Authentication successful')
  }
  const line = (l) => {
    if (data !== null) {
      if (l === '.') {
        const raw = Buffer.from(data.join('\r\n') + '\r\n', 'utf8')
        data = null
        const fail = failing.get(user)
        if (fail && fail.count > 0) {
          fail.count -= 1
          return say(`${fail.code} 5.7.1 Message refused by the mailbox's provider`)
        }
        keep(sent, { user, tls, envelope: { from, to: rcpts }, raw, at: Date.now() })
        from = null
        rcpts = []
        return say('250 2.0.0 Ok: queued')
      }
      data.push(l.startsWith('..') ? l.slice(1) : l)
      return
    }
    if (authStep) {
      const step = authStep
      authStep = null
      if (step.how === 'PLAIN') {
        const [, name = '', password = ''] = Buffer.from(l, 'base64').toString('utf8').split('\0')
        return signIn(name, password, 'PLAIN')
      }
      if (step.stage === 'user') {
        authStep = { how: 'LOGIN', stage: 'pass', name: Buffer.from(l, 'base64').toString('utf8') }
        return say('334 UGFzc3dvcmQ6')
      }
      return signIn(step.name, Buffer.from(l, 'base64').toString('utf8'), 'LOGIN')
    }
    const [verb, ...rest] = l.split(' ')
    const cmd = verb.toUpperCase()
    const tail = rest.join(' ')
    if (cmd === 'EHLO') {
      say('250-rundesk-mailbox-stub')
      if (!tls) say('250-STARTTLS')
      say('250-AUTH PLAIN LOGIN')
      return say('250 8BITMIME')
    }
    if (cmd === 'HELO') return say('250 rundesk-mailbox-stub')
    if (cmd === 'STARTTLS') {
      if (tls) return say('503 5.5.1 TLS is already on')
      say('220 2.0.0 Ready to start TLS')
      paused = true
      sock.removeAllListeners('data')
      const secured = new TLSSocket(sock, { isServer: true, key: TLS.key, cert: TLS.cert })
      secured.on('secure', () => {
        tls = true
        sock = secured
        buf = ''
        user = null
        paused = false
        secured.on('data', onData)
      })
      secured.on('error', () => secured.destroy())
      return
    }
    if (cmd === 'AUTH') {
      const [how, initial] = tail.split(' ')
      if (how?.toUpperCase() === 'PLAIN') {
        if (initial) {
          const [, name = '', password = ''] = Buffer.from(initial, 'base64').toString('utf8').split('\0')
          return signIn(name, password, 'PLAIN')
        }
        authStep = { how: 'PLAIN' }
        return say('334 ')
      }
      if (how?.toUpperCase() === 'LOGIN') {
        if (initial) {
          authStep = { how: 'LOGIN', stage: 'pass', name: Buffer.from(initial, 'base64').toString('utf8') }
          return say('334 UGFzc3dvcmQ6')
        }
        authStep = { how: 'LOGIN', stage: 'user' }
        return say('334 VXNlcm5hbWU6')
      }
      return say('504 5.5.4 Unrecognized authentication type')
    }
    if (cmd === 'MAIL') {
      if (!user) return say('530 5.7.0 Authentication required')
      const addr = addressOf(/<([^>]*)>/.exec(tail)?.[1])
      if (addr !== user) return say(`553 5.7.1 <${addr}>: Sender address rejected: not owned by user ${user}`)
      from = addr
      rcpts = []
      return say('250 2.1.0 Ok')
    }
    if (cmd === 'RCPT') {
      if (!from) return say('503 5.5.1 Need MAIL first')
      rcpts.push(addressOf(/<([^>]*)>/.exec(tail)?.[1]))
      return say('250 2.1.5 Ok')
    }
    if (cmd === 'DATA') {
      if (!rcpts.length) return say('503 5.5.1 Need RCPT first')
      data = []
      return say('354 End data with <CR><LF>.<CR><LF>')
    }
    if (cmd === 'RSET') {
      from = null
      rcpts = []
      return say('250 2.0.0 Ok')
    }
    if (cmd === 'NOOP') return say('250 2.0.0 Ok')
    if (cmd === 'QUIT') {
      say('221 2.0.0 Bye')
      return sock.end()
    }
    say('502 5.5.2 Command not recognized')
  }
  const onData = (chunk) => {
    buf += chunk.toString('utf8')
    for (let i = buf.indexOf('\r\n'); i >= 0 && !paused; i = buf.indexOf('\r\n')) {
      const l = buf.slice(0, i)
      buf = buf.slice(i + 2)
      line(l)
    }
  }
  sock.on('data', onData)
  sock.on('error', () => sock.destroy())
  say('220 rundesk-mailbox-stub ESMTP')
}

// ── THE CONTROL SEAM ───────────────────────────────────────────────────────

function deliver(input) {
  const to = addressOf(input.to)
  const box = boxes.get(to)
  if (!box) throw new Error(`no mailbox ${to}`)
  let raw
  let messageId = input.messageId ?? `<stub.${box.nextUid}.${Date.now()}@client.test>`
  if (input.raw) {
    raw = Buffer.from(String(input.raw), 'utf8')
    messageId = headersOf(raw).get('message-id')?.[0] ?? null
  } else {
    const head = [
      `Message-ID: ${messageId}`,
      `Date: ${new Date().toUTCString().replace(/GMT$/, '+0000')}`,
      `From: ${input.from}`,
      `To: ${to}`,
      `Subject: ${input.subject ?? ''}`,
      input.inReplyTo ? `In-Reply-To: ${input.inReplyTo}` : null,
      input.references ? `References: ${[].concat(input.references).join(' ')}` : null,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
    ].filter(Boolean)
    raw = Buffer.from(`${head.join('\r\n')}\r\n\r\n${String(input.text ?? '').replace(/\r?\n/g, '\r\n')}\r\n`, 'utf8')
  }
  const uid = box.nextUid++
  box.folders.get('INBOX').messages.push({ uid, raw, flags: new Set(), at: Date.now() })
  return { uid, messageId }
}

const body = (req) =>
  new Promise((resolve) => {
    let s = ''
    req.on('data', (d) => (s += d))
    req.on('end', () => {
      try {
        resolve(s ? JSON.parse(s) : {})
      } catch {
        resolve({})
      }
    })
  })

const control = createHttpServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const json = (code, v) => {
    res.writeHead(code, { 'content-type': 'application/json' })
    res.end(JSON.stringify(v))
  }
  try {
    if (req.method === 'GET' && url.pathname === '/__control/version') return json(200, { source: SOURCE })
    if (req.method === 'POST' && url.pathname === '/__control/mailbox/accounts') {
      const b = await body(req)
      const address = addressOf(b.address)
      if (!address || typeof b.password !== 'string') return json(400, { error: 'address and password' })
      const box = boxes.get(address) ?? makeBox(address, b.password)
      box.password = b.password
      boxes.set(address, box)
      return json(200, { address, uidValidity: box.uidValidity })
    }
    if (req.method === 'POST' && url.pathname === '/__control/mailbox/deliver') return json(200, deliver(await body(req)))
    if (req.method === 'GET' && url.pathname === '/__control/mailbox/sent') {
      const who = addressOf(url.searchParams.get('from'))
      return json(200, { messages: sent.filter((m) => m.user === who).map((m) => ({ envelope: m.envelope, tls: m.tls, ...view(m.raw) })) })
    }
    if (req.method === 'GET' && url.pathname === '/__control/mailbox/logins') {
      const who = addressOf(url.searchParams.get('user'))
      return json(200, { logins: logins.filter((l) => l.user === who) })
    }
    if (req.method === 'GET' && url.pathname === '/__control/mailbox/fetches') {
      const who = addressOf(url.searchParams.get('user'))
      return json(200, { fetches: fetches.filter((f) => f.user === who) })
    }
    if (req.method === 'GET' && url.pathname === '/__control/mailbox/folder') {
      const box = boxes.get(addressOf(url.searchParams.get('address')))
      const f = box?.folders.get(url.searchParams.get('name') ?? 'INBOX')
      if (!f) return json(404, { error: 'no such mailbox or folder' })
      return json(200, { messages: f.messages.map((m) => ({ uid: m.uid, flags: [...m.flags], ...view(m.raw) })) })
    }
    if (req.method === 'POST' && url.pathname === '/__control/mailbox/fail') {
      const b = await body(req)
      failing.set(addressOf(b.address), { code: Number(b.code ?? 554), count: Number(b.count ?? 1) })
      return json(200, { ok: true })
    }
    if (req.method === 'POST' && url.pathname === '/__control/mailbox/reset') {
      const who = addressOf((await body(req)).address)
      boxes.delete(who)
      failing.delete(who)
      for (const list of [sent, logins, fetches]) {
        for (let i = list.length - 1; i >= 0; i--) if (list[i].user === who) list.splice(i, 1)
      }
      return json(200, { ok: true })
    }
    json(404, { error: 'unknown control route' })
  } catch (err) {
    json(400, { error: err instanceof Error ? err.message : String(err) })
  }
})

const imap = createTcpServer(imapSession)
const smtp = createTcpServer(smtpSession)
let up = 0
const ready = () => {
  if (++up === 3) console.log(JSON.stringify({ ready: true, port: PORT, imapPort: IMAP_PORT, smtpPort: SMTP_PORT, ca: TLS.certPath, source: SOURCE }))
}
control.listen(PORT, '127.0.0.1', ready)
imap.listen(IMAP_PORT, '127.0.0.1', ready)
smtp.listen(SMTP_PORT, '127.0.0.1', ready)
