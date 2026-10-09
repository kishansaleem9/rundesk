#!/usr/bin/env node
/*
 * A MAIL SERVER THAT KEEPS WHAT IT IS SENT (`resume-defects/s4-composer-email`,
 * `ledger-rows/row-1252`).
 *
 * The comment box posts as Email, as ClickUp's Email ClickApp does: the API
 * sends through the server's SMTP (`EmailService`, SMTP_HOST / SMTP_PORT /
 * SMTP_USER / SMTP_PASS), with the email's own address to reply to. No lane
 * reaches a real mail server, so every lane points its API here, the way
 * `s3-stub.mjs` is the store's and `media-stub.mjs` the photo library's — and
 * so every mail the API sends, a notification's too, is taken here.
 *
 * WHAT IT SPEAKS, the part of SMTP (RFC 5321) a sender uses: EHLO and HELO,
 * AUTH PLAIN and AUTH LOGIN (RFC 4954) — the lane's user and password, anything
 * else 535 — MAIL FROM, RCPT TO, DATA (ended by a lone ".", dot-stuffing
 * undone), RSET, NOOP and QUIT. A message is refused 530 until the sender has
 * signed in. No STARTTLS is offered, so a sender talks in the clear on loopback.
 *
 * WHAT IT KEEPS, for each message taken: the envelope (who it was from, and
 * every RCPT TO — the BCC recipients are there and in no header), the headers
 * by name (Subject, From, To, Cc, Reply-To, Message-ID, In-Reply-To,
 * References), the message read as a mail client reads it — its text and HTML
 * parts decoded, and each attached file's name, type, size and SHA-1 — and the
 * raw text.
 *
 * THE CONTROL SEAM, over HTTP on `--port` — the port the lane's scripts ask
 * every stub for its version — with SMTP on `--smtp-port`; for suites and for
 * `check-mail-stub.mjs`:
 *   GET  /__control/mail/messages[?to=a]           what was taken, in order: all, or what went to `a`
 *   POST /__control/mail/fail {code, count, to}    the next `count` messages to `to` are refused `code` at
 *                                                  the end of DATA. Aimed at one address, so a suite's staged
 *                                                  refusal never meets another suite's mail on the same lane.
 *   POST /__control/mail/reset {to?}               forget what went to `to` and any refusal staged for it;
 *                                                  with no `to`, everything
 *   GET  /__control/version                        which source this process runs
 *
 * It keeps the last 500 messages: a lane's stub runs for hours, and every
 * notification of every suite comes here.
 *
 * NOT FOR PRODUCTION. Binds loopback, and refuses to start without
 * `RUNDESK_MAIL_STUB=1`.
 *
 *   RUNDESK_MAIL_STUB=1 node scripts/e2e-lanes/mail-stub.mjs --port 9701 --smtp-port 9601
 *
 * Prints one line of JSON when both ports listen, so callers wait on readiness
 * rather than sleeping.
 */
import { createServer as createTcpServer } from 'node:net'
import { createServer as createHttpServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'

if (process.env.RUNDESK_MAIL_STUB !== '1') {
  console.error('[mail-stub] refusing to start without RUNDESK_MAIL_STUB=1 — this is a test double')
  process.exitCode = 1
  process.exit()
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}
const CONTROL_PORT = Number(arg('port', 9701))
const PORT = Number(arg('smtp-port', CONTROL_PORT - 100))
const KEEP = 500
/** The sign-in every lane gives the API (`lane_mail_env`, and CI's API step). Not a credential: the stub takes this one. */
const USER = arg('user', 'lane-mail')
const PASS = arg('pass', 'lane-mail-key')
// Which source this process runs: `lane-env.sh` restarts a stub whose file has moved.
const SOURCE = createHash('sha1').update(readFileSync(new URL(import.meta.url))).digest('hex').slice(0, 12)

const messages = []
let refusals = [] // [{ code, left, to }]

// ── reading a message ───────────────────────────────────────────────────────

/** Headers by lower-cased name, folded lines unfolded; the first of a repeated header. */
const headersOf = (head) => {
  const out = {}
  for (const line of head.replace(/\r\n[ \t]+/g, ' ').split('\r\n')) {
    const at = line.indexOf(':')
    if (at <= 0) continue
    const name = line.slice(0, at).trim().toLowerCase()
    if (!(name in out)) out[name] = line.slice(at + 1).trim()
  }
  return out
}
/** RFC 2047 encoded words (`=?UTF-8?Q?…?=`, `=?UTF-8?B?…?=`), as a mail client shows them. */
const decodeWords = (value) =>
  value.replace(/=\?([^?]+)\?([QqBb])\?([^?]*)\?=/g, (_, _charset, enc, text) => {
    const bytes = enc.toUpperCase() === 'B'
      ? Buffer.from(text, 'base64')
      : Buffer.from(text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16))), 'latin1')
    return bytes.toString('utf8')
  }).replace(/\?=\s+=\?/g, '')
/** Head and body: split at the first blank line. */
const splitPart = (raw) => {
  const at = raw.indexOf('\r\n\r\n')
  return at === -1 ? { head: raw, body: '' } : { head: raw.slice(0, at), body: raw.slice(at + 4) }
}
/** A parameter of a header value (`boundary`, `filename`, `name`), quoted or not. */
const paramOf = (value, name) => {
  const m = new RegExp(`(?:^|;)\\s*${name}=(?:"([^"]*)"|([^;\\s]*))`, 'i').exec(value ?? '')
  return m ? (m[1] ?? m[2]) : null
}
/** A part's bytes, its transfer encoding undone. */
const bytesOf = (headers, body) => {
  const enc = (headers['content-transfer-encoding'] ?? '').trim().toLowerCase()
  if (enc === 'base64') return Buffer.from(body.replace(/\s+/g, ''), 'base64')
  if (enc === 'quoted-printable') {
    return Buffer.from(body.replace(/=\r\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16))), 'latin1')
  }
  return Buffer.from(body, 'latin1')
}
/** Every leaf of a message: a multipart split at its boundary, all the way down. */
const leavesOf = (head, body, out = []) => {
  const h = headersOf(head)
  const type = h['content-type'] ?? 'text/plain'
  const boundary = /^multipart\//i.test(type) ? paramOf(type, 'boundary') : null
  if (!boundary) {
    out.push({ headers: h, bytes: bytesOf(h, body) })
    return out
  }
  for (const part of body.split(`--${boundary}`).slice(1)) {
    if (part.startsWith('--')) break
    const { head: ph, body: pb } = splitPart(part.replace(/^\r\n/, ''))
    leavesOf(ph, pb.replace(/\r\n$/, ''), out)
  }
  return out
}
const isFile = (leaf) => /^\s*attachment/i.test(leaf.headers['content-disposition'] ?? '') || paramOf(leaf.headers['content-disposition'], 'filename') !== null
const take = (envelope, raw) => {
  const { head, body: rest } = splitPart(raw)
  const h = headersOf(head)
  const pick = (name) => (h[name] === undefined ? null : decodeWords(h[name]))
  const leaves = leavesOf(head, rest)
  const textOf = (type) => {
    const leaf = leaves.find((l) => !isFile(l) && new RegExp(`^\\s*${type}`, 'i').test(l.headers['content-type'] ?? 'text/plain'))
    // Lines end as a mail client shows them, not as SMTP carries them (CRLF).
    return leaf ? leaf.bytes.toString('utf8').replace(/\r\n/g, '\n') : null
  }
  const message = {
    id: randomUUID(),
    at: new Date().toISOString(),
    envelope: { from: envelope.from, to: [...envelope.to] },
    headers: {
      subject: pick('subject'),
      from: pick('from'),
      to: pick('to'),
      cc: pick('cc'),
      bcc: pick('bcc'),
      replyTo: pick('reply-to'),
      messageId: pick('message-id'),
      inReplyTo: pick('in-reply-to'),
      references: pick('references'),
      contentType: pick('content-type'),
    },
    text: textOf('text/plain'),
    html: textOf('text/html'),
    attachments: leaves.filter(isFile).map((l) => ({
      filename: decodeWords(paramOf(l.headers['content-disposition'], 'filename') ?? paramOf(l.headers['content-type'], 'name') ?? ''),
      contentType: (l.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase(),
      size: l.bytes.length,
      sha1: createHash('sha1').update(l.bytes).digest('hex'),
    })),
    raw,
  }
  messages.push(message)
  if (messages.length > KEEP) messages.splice(0, messages.length - KEEP)
  return message
}
/** The refusal staged for one of this message's recipients, spent by one. */
const refusalFor = (envelope) => {
  const r = refusals.find((x) => envelope.to.some((t) => t.toLowerCase() === x.to))
  if (!r) return null
  r.left -= 1
  if (r.left <= 0) refusals = refusals.filter((x) => x !== r)
  return r
}

// ── SMTP ─────────────────────────────────────────────────────────────────────

const address = (s) => /<([^>]*)>/.exec(s)?.[1]?.trim() ?? s.trim()
const smtp = createTcpServer((socket) => {
  socket.setEncoding('latin1')
  const say = (line) => socket.write(`${line}\r\n`)
  let signedIn = false
  let envelope = null // { from, to: [] }
  let data = null // the DATA being read, or null
  let login = null // the AUTH LOGIN step: 'user' | 'pass'
  let loginUser = ''
  let buffer = ''
  say('220 mail-stub ESMTP ready')
  socket.on('data', (chunk) => {
    buffer += chunk
    while (true) {
      if (data !== null) {
        const end = buffer.indexOf('\r\n.\r\n')
        // A message whose DATA is the lone dot at once: `\r\n` was the last line ending before it.
        const bare = data === '' && buffer.startsWith('.\r\n')
        if (end === -1 && !bare) return
        const body = bare ? '' : buffer.slice(0, end)
        buffer = buffer.slice(bare ? 3 : end + 5)
        const raw = (data + body).split('\r\n').map((l) => (l.startsWith('..') ? l.slice(1) : l)).join('\r\n')
        data = null
        const refused = refusalFor(envelope)
        if (refused) {
          const { code } = refused
          say(`${code} ${code >= 500 ? '5.7.1 The message was refused' : '4.3.0 Try again later'}`)
        } else {
          const m = take(envelope, raw)
          say(`250 2.0.0 Ok: queued as ${m.id}`)
        }
        envelope = null
        continue
      }
      const at = buffer.indexOf('\r\n')
      if (at === -1) return
      const line = buffer.slice(0, at)
      buffer = buffer.slice(at + 2)
      if (login === 'user') {
        loginUser = Buffer.from(line, 'base64').toString('utf8')
        login = 'pass'
        say('334 UGFzc3dvcmQ6')
        continue
      }
      if (login === 'pass') {
        const pass = Buffer.from(line, 'base64').toString('utf8')
        login = null
        signedIn = loginUser === USER && pass === PASS
        say(signedIn ? '235 2.7.0 Authentication successful' : '535 5.7.8 Authentication credentials invalid')
        continue
      }
      const verb = line.split(' ')[0].toUpperCase()
      if (verb === 'EHLO') {
        say('250-mail-stub')
        say('250-AUTH PLAIN LOGIN')
        say('250-8BITMIME')
        say('250 SIZE 26214400')
      } else if (verb === 'HELO') {
        say('250 mail-stub')
      } else if (verb === 'AUTH') {
        const [, mech, initial] = line.split(' ')
        if ((mech ?? '').toUpperCase() === 'PLAIN') {
          const parts = Buffer.from(initial ?? '', 'base64').toString('utf8').split('\u0000')
          signedIn = parts[1] === USER && parts[2] === PASS
          say(signedIn ? '235 2.7.0 Authentication successful' : '535 5.7.8 Authentication credentials invalid')
        } else if ((mech ?? '').toUpperCase() === 'LOGIN') {
          if (initial) {
            loginUser = Buffer.from(initial, 'base64').toString('utf8')
            login = 'pass'
            say('334 UGFzc3dvcmQ6')
          } else {
            login = 'user'
            say('334 VXNlcm5hbWU6')
          }
        } else {
          say('504 5.5.4 Unrecognized authentication type')
        }
      } else if (verb === 'MAIL') {
        if (!signedIn) {
          say('530 5.7.0 Authentication required')
          continue
        }
        envelope = { from: address(line.slice(line.indexOf(':') + 1)), to: [] }
        say('250 2.1.0 Ok')
      } else if (verb === 'RCPT') {
        if (!envelope) {
          say('503 5.5.1 Error: need MAIL command')
          continue
        }
        envelope.to.push(address(line.slice(line.indexOf(':') + 1)))
        say('250 2.1.5 Ok')
      } else if (verb === 'DATA') {
        if (!envelope || envelope.to.length === 0) {
          say('503 5.5.1 Error: need RCPT command')
          continue
        }
        data = ''
        say('354 End data with <CR><LF>.<CR><LF>')
      } else if (verb === 'RSET') {
        envelope = null
        say('250 2.0.0 Ok')
      } else if (verb === 'NOOP') {
        say('250 2.0.0 Ok')
      } else if (verb === 'QUIT') {
        say('221 2.0.0 Bye')
        socket.end()
        return
      } else {
        say('502 5.5.2 Error: command not recognized')
      }
    }
  })
  socket.on('error', () => {})
})

// ── the control seam ─────────────────────────────────────────────────────────

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
      try { resolve(JSON.parse(raw || '{}')) } catch { resolve(null) }
    })
  })
const wentTo = (m, to) => m.envelope.to.some((t) => t.toLowerCase() === to)
const control = createHttpServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${CONTROL_PORT}`)
  const path = url.pathname
  if (path === '/__control/version' && req.method === 'GET') return json(res, 200, { source: SOURCE })
  if (path === '/__control/mail/messages' && req.method === 'GET') {
    const to = url.searchParams.get('to')?.trim().toLowerCase()
    return json(res, 200, { messages: to ? messages.filter((m) => wentTo(m, to)) : messages })
  }
  if (path === '/__control/mail/reset' && req.method === 'POST') {
    const to = (await readBody(req))?.to?.trim?.().toLowerCase()
    if (to) {
      for (let i = messages.length - 1; i >= 0; i -= 1) if (wentTo(messages[i], to)) messages.splice(i, 1)
      refusals = refusals.filter((r) => r.to !== to)
    } else {
      messages.length = 0
      refusals = []
    }
    return json(res, 200, { reset: to ?? true })
  }
  if (path === '/__control/mail/fail' && req.method === 'POST') {
    const body = await readBody(req)
    const code = Number(body?.code ?? 451)
    const count = Math.max(1, Number(body?.count ?? 1))
    const to = typeof body?.to === 'string' ? body.to.trim().toLowerCase() : ''
    if (!Number.isInteger(code) || code < 400 || code > 599) return json(res, 400, { error: 'code is a refusal, 400 to 599' })
    if (!to) return json(res, 400, { error: 'to: the address whose messages are refused, so no other mail on the lane is' })
    refusals = [...refusals.filter((r) => r.to !== to), { code, left: count, to }]
    return json(res, 200, { failing: { code, left: count, to } })
  }
  return json(res, 404, { error: 'Not found' })
})

let up = 0
const ready = () => {
  up += 1
  if (up === 2) console.log(JSON.stringify({ ready: true, port: PORT, controlPort: CONTROL_PORT, source: SOURCE }))
}
smtp.listen(PORT, '127.0.0.1', ready)
control.listen(CONTROL_PORT, '127.0.0.1', ready)
