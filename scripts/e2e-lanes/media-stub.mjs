#!/usr/bin/env node
/*
 * A STOCK PHOTO LIBRARY, IN UNSPLASH'S SHAPES (`commit-log/log-601eacc-1`,
 * `ledger-rows/row-739`).
 *
 * A cover's Search tab searches a library of free stock photos — ClickUp's
 * covers have "Search images", a large library of free stock photographs — and
 * the API asks Unsplash's: its base address from UNSPLASH_API_URL, its key from
 * UNSPLASH_ACCESS_KEY. No lane reaches Unsplash, so every lane points there,
 * the way `s3-stub.mjs` is the store's, `model-stub.mjs` the model's and
 * `calendar-stub.mjs` the calendars'.
 *
 * WHAT IT ANSWERS, in Unsplash's own shapes (unsplash.com/documentation):
 *   GET /unsplash/search/photos?query=&page=&per_page=   { total, total_pages, results: [photo] }
 *   GET /unsplash/photos/:id/download                    { url } — the download Unsplash asks
 *                                                        an app to trigger when a photo is used
 *   GET /unsplash/img/:id.svg                            the photograph itself (a drawn stand-in)
 * Every call but the image's carries `Authorization: Client-ID <key>`, and a key
 * that is not the lane's is refused 401 in Unsplash's words. A photo is
 * `{ id, width, height, color, description, alt_description, urls: { raw, full,
 * regular, small, thumb }, links: { html, download_location }, user: { name,
 * username, links: { html } } }`.
 *
 * THE LIBRARY IS FIXED: the same photos on every lane and every run, so a suite
 * can say how many "mountain" holds and what page two is. A query matches a
 * photo whose description, alt text or tags hold every one of its words.
 *
 * AND IMAGES MADE TO ORDER, in OpenAI's shapes (`ledger-rows/row-870`): the API
 * asks IMAGES_API_URL with IMAGES_API_KEY for a prompt's pictures —
 *   POST /openai/v1/images/generations {model, prompt, n, size}   { created, data: [{ b64_json }] }
 * with `Authorization: Bearer <key>`, a key that is not the lane's refused 401
 * in OpenAI's words. Each picture is a PNG drawn here from the prompt and its
 * place in the answer, so the same prompt draws the same pictures and two
 * pictures of one answer differ.
 *
 * AND CHATGPT ANSWERING A BRAIN TURN, in OpenAI's Chat Completions shapes
 * (`commit-log/log-39863ff-1`): the API asks CHATGPT_API_URL with CHATGPT_API_KEY —
 *   POST /openai/v1/chat/completions {model, messages, tools?, stream?}
 * with `Authorization: Bearer <key>`, a key that is not the lane's refused 401
 * in OpenAI's words. Streamed, it answers as OpenAI streams: a role chunk, the
 * text in pieces, each tool call's id and name and then its arguments in pieces
 * under its `index`, the finish reason, the usage when `stream_options` asks for
 * it, then `[DONE]`. Unstreamed, one `chat.completion`. What it says is the
 * next STAGED reply when a suite staged one — text, or tool calls with their
 * arguments — and otherwise one sentence naming the model and repeating the
 * question, so a page shows which provider answered what.
 *
 * AND THE AI NOTETAKER'S MEETING BOT, in Recall.ai's shapes (`commit-log/log-39863ff-1`): the
 * API asks RECALL_API_URL with RECALL_API_KEY —
 *   POST   /recall/api/v1/bot/                  {meeting_url, bot_name, join_at?, recording_config}  → {id, …}
 *   GET    /recall/api/v1/bot/:id/              the bot: {id, meeting_url, join_at, status_changes, recordings}
 *   DELETE /recall/api/v1/bot/:id/              a bot that has not joined; 400 for one that has
 *   POST   /recall/api/v1/bot/:id/leave_call/   a bot in its call leaves it (`call_ended`)
 *   GET    /recall/media/:id/transcript.json    a done bot's transcript, by the address its recording gives
 * with `Authorization: Token <key>`, a key that is not the lane's refused 401 in
 * Recall's words, and a link that is no Zoom, Meet or Teams meeting refused 400.
 * A bot's life is the suite's to move: it stays as made until the control seam
 * says it joined, recorded, ended or failed — and once `done`, its recording
 * carries the transcript's address.
 *
 * AND A MAP'S TWO OUTSIDE SERVICES (`commit-log/log-68bc188-1`, `ledger-rows/row-777`):
 * ClickUp's Map view places a task by its Location field's address, which the
 * API turns into coordinates through a geocoder at GEOCODER_URL, and draws the
 * map from a tile server at MAP_TILES_URL. In OpenStreetMap's shapes:
 *   GET /geocode?q=&format=json&limit=1     Nominatim's search: [{ lat, lon, display_name }],
 *                                           [] for an address it cannot place
 *   GET /tiles/:z/:x/:y.svg                 one 256-pixel tile, drawn here
 * The places are FIXED: a known address always lands on the same point, so a
 * suite can say where a marker must be; any other address lands on a point
 * drawn from its words, and one naming "nowhere" is not found.
 *
 * THE CONTROL SEAM, for suites and for `check-media-stub.mjs`:
 *   GET  /__control/photos/downloads      the downloads triggered, in order
 *   POST /__control/photos/fail {status, count}   the next `count` calls answer `status`
 *   POST /__control/photos/reset          forget the downloads and any failure
 *   GET  /__control/images/requests       the image requests made, in order
 *   POST /__control/images/fail {status, count}   the next `count` image requests answer `status`
 *   POST /__control/images/reset          forget them and any failure
 *   GET  /__control/recall/bots           every bot made, with what it was asked and where it stands
 *   POST /__control/recall/bots/:id {code, sub_code?, transcript?}   the bot's next status change, and
 *                                         with `done` the transcript its recording carries
 *   POST /__control/recall/reset          forget every bot
 *   GET  /__control/chat/requests         the chat requests made, in order
 *   POST /__control/chat/stage {replies}  the next asks' replies: [{content?, tool_calls?: [{name, arguments}]}]
 *   POST /__control/chat/fail {status, count}   the next `count` chat requests answer `status`
 *   POST /__control/chat/reset            forget them, any staged reply and any failure
 *   GET  /__control/geocode/requests      the addresses asked, in order
 *   POST /__control/geocode/reset         forget them
 *   GET  /__control/version               which source this process runs
 *
 * NOT FOR PRODUCTION. Binds loopback, and refuses to start without
 * `RUNDESK_MEDIA_STUB=1`.
 *
 *   RUNDESK_MEDIA_STUB=1 node scripts/e2e-lanes/media-stub.mjs --port 9501
 *
 * Prints one line of JSON when listening, so callers wait on readiness rather
 * than sleeping.
 */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { deflateSync, crc32 } from 'node:zlib'

if (process.env.RUNDESK_MEDIA_STUB !== '1') {
  console.error('[media-stub] refusing to start without RUNDESK_MEDIA_STUB=1 — this is a test double')
  process.exitCode = 1
  process.exit()
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}
const PORT = Number(arg('port', 9501))
/** The keys every lane gives the API (`lane_media_env`, and CI's API step). */
const KEY = arg('key', 'lane-photos')
const IMAGES_KEY = arg('images-key', 'lane-images')
const CHAT_KEY = arg('chat-key', 'lane-chatgpt')
const RECALL_KEY = arg('recall-key', 'lane-recall')
// Which source this process runs: `lane-env.sh` restarts a stub whose file has moved.
const SOURCE = createHash('sha1').update(readFileSync(new URL(import.meta.url))).digest('hex').slice(0, 12)
const BASE = `http://127.0.0.1:${PORT}`

// ── the library ──────────────────────────────────────────────────────────────

const PEOPLE = [
  ['Aiko Tanaka', 'aikotanaka'], ['Mateo Silva', 'mateosilva'], ['Noor Haddad', 'noorhaddad'],
  ['Lena Fischer', 'lenafischer'], ['Kwame Mensah', 'kwamemensah'], ['Sofia Rossi', 'sofiarossi'],
]
const THEMES = [
  { word: 'mountain', count: 30, colour: '#5b7083', scenes: ['ridge at dawn', 'lake under peaks', 'snow summit', 'valley mist', 'trail above clouds'], tags: ['mountain', 'landscape', 'nature'] },
  { word: 'ocean', count: 8, colour: '#1f6f8b', scenes: ['waves at dusk', 'calm bay', 'surf break', 'reef from above'], tags: ['ocean', 'sea', 'water'] },
  { word: 'city', count: 8, colour: '#3d3d5c', scenes: ['skyline at night', 'street crossing', 'rooftops in rain', 'bridge lights'], tags: ['city', 'urban', 'architecture'] },
  { word: 'forest', count: 6, colour: '#2f5d3a', scenes: ['pines in fog', 'path through birches', 'mossy floor'], tags: ['forest', 'trees', 'nature'] },
  { word: 'desk', count: 4, colour: '#8a6d4b', scenes: ['laptop and coffee', 'notebook and pen'], tags: ['desk', 'office', 'work'] },
]
/** Unsplash's ids are 11 characters of base64url; these are made from the theme and the number, so they stay put. */
const idOf = (word, n) => createHash('sha1').update(`${word}:${n}`).digest('base64url').slice(0, 11)
const LIBRARY = THEMES.flatMap((t) =>
  Array.from({ length: t.count }, (_, i) => {
    const [name, username] = PEOPLE[i % PEOPLE.length]
    const scene = t.scenes[i % t.scenes.length]
    return {
      id: idOf(t.word, i),
      width: 4000,
      height: 2667,
      color: t.colour,
      description: `${t.word[0].toUpperCase()}${t.word.slice(1)} — ${scene} (${i + 1})`,
      alt_description: `a ${t.word} ${scene}`,
      tags: t.tags,
      user: { name, username },
    }
  }),
)
const byId = new Map(LIBRARY.map((p) => [p.id, p]))

const imageUrl = (id, w) => `${BASE}/unsplash/img/${id}.svg?w=${w}`
/** A photo as Unsplash answers it. */
const asUnsplash = (p) => ({
  id: p.id,
  created_at: '2024-01-01T00:00:00Z',
  width: p.width,
  height: p.height,
  color: p.color,
  description: p.description,
  alt_description: p.alt_description,
  urls: { raw: imageUrl(p.id, 4000), full: imageUrl(p.id, 4000), regular: imageUrl(p.id, 1080), small: imageUrl(p.id, 400), thumb: imageUrl(p.id, 200) },
  links: { self: `${BASE}/unsplash/photos/${p.id}`, html: `https://unsplash.com/photos/${p.id}`, download: imageUrl(p.id, 4000), download_location: `${BASE}/unsplash/photos/${p.id}/download` },
  user: { id: p.user.username, username: p.user.username, name: p.user.name, links: { html: `https://unsplash.com/@${p.user.username}` } },
})
const matches = (p, words) => {
  const hay = `${p.description} ${p.alt_description} ${p.tags.join(' ')}`.toLowerCase()
  return words.every((w) => hay.includes(w))
}

// ── images made to order ─────────────────────────────────────────────────────

const pngChunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([len, body, crc])
}
/** A 64×64 PNG: the prompt's colour, and a band in the colour of its place in the answer. */
const pictureFor = (prompt, index) => {
  const h = createHash('sha1').update(`${prompt}#${index}`).digest()
  const [r, g, b] = [h[0], h[1], h[2]]
  const W = 64
  const raw = Buffer.alloc((W * 4 + 1) * W)
  for (let y = 0; y < W; y++) {
    raw[y * (W * 4 + 1)] = 0
    for (let x = 0; x < W; x++) {
      const o = y * (W * 4 + 1) + 1 + x * 4
      const band = y >= 24 && y < 40
      raw[o] = band ? 255 - r : r
      raw[o + 1] = band ? 255 - g : g
      raw[o + 2] = band ? 255 - b : b
      raw[o + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(W, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))])
}

// ── the seam ─────────────────────────────────────────────────────────────────

const downloads = []
let failure = null // { status, left }
const imageRequests = []
let imageFailure = null // { status, left }
const geocodeRequests = []
const chatRequests = []
/** The meeting bots made, by id: what each was asked, and its status changes. */
const recallBots = new Map()
const MEETING_LINK = /^https:\/\/(meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}|([a-z0-9-]+\.)?zoom\.us\/(j|w|my)\/|teams\.(microsoft\.com\/(l\/meetup-join|meet)\/|live\.com\/meet\/))/i
const botView = (b) => ({
  id: b.id,
  meeting_url: b.meetingUrl,
  bot_name: b.botName,
  join_at: b.joinAt,
  status_changes: b.statusChanges,
  recordings: b.done
    ? [{ id: `rec-${b.id}`, media_shortcuts: { transcript: { status: { code: 'done' }, data: { download_url: `${BASE}/recall/media/${b.id}/transcript.json` } } } }]
    : [],
})
const chatStaged = []
let chatFailure = null // { status, left }

/** The places every lane knows, by a word of their address. */
const PLACES = [
  { match: 'eiffel tower', lat: 48.8584, lon: 2.2945, name: 'Eiffel Tower, Paris, France' },
  { match: 'big ben', lat: 51.5007, lon: -0.1246, name: 'Big Ben, London, United Kingdom' },
  { match: 'sydney opera house', lat: -33.8568, lon: 151.2153, name: 'Sydney Opera House, Sydney, Australia' },
  { match: 'empire state building', lat: 40.7484, lon: -73.9857, name: 'Empire State Building, New York, United States' },
  { match: 'brandenburg gate', lat: 52.5163, lon: 13.3777, name: 'Brandenburg Gate, Berlin, Germany' },
]
/** Any other address: a point drawn from its words, the same every time. */
const pointFor = (q) => {
  const h = createHash('sha256').update(q.toLowerCase()).digest()
  return { lat: ((h.readUInt32BE(0) / 0xffffffff) * 120 - 60).toFixed(4), lon: ((h.readUInt32BE(4) / 0xffffffff) * 360 - 180).toFixed(4) }
}

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
const escapeXml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', BASE)
  const path = url.pathname

  if (path === '/__control/version' && req.method === 'GET') return json(res, 200, { source: SOURCE })
  if (path === '/__control/photos/downloads' && req.method === 'GET') return json(res, 200, { downloads })
  if (path === '/__control/photos/reset' && req.method === 'POST') {
    downloads.length = 0
    failure = null
    return json(res, 200, { reset: true })
  }
  if (path === '/__control/images/requests' && req.method === 'GET') return json(res, 200, { requests: imageRequests })
  if (path === '/__control/images/reset' && req.method === 'POST') {
    imageRequests.length = 0
    imageFailure = null
    return json(res, 200, { reset: true })
  }
  if (path === '/__control/images/fail' && req.method === 'POST') {
    const body = await readBody(req)
    const status = Number(body?.status)
    const count = Number(body?.count ?? 1)
    if (!Number.isInteger(status) || status < 400 || status > 599 || !Number.isInteger(count) || count < 1) {
      return json(res, 400, { error: 'status is 400–599 and count a whole number' })
    }
    imageFailure = { status, left: count }
    return json(res, 200, { failing: imageFailure })
  }
  if (path === '/__control/photos/fail' && req.method === 'POST') {
    const body = await readBody(req)
    const status = Number(body?.status)
    const count = Number(body?.count ?? 1)
    if (!Number.isInteger(status) || status < 400 || status > 599 || !Number.isInteger(count) || count < 1) {
      return json(res, 400, { error: 'status is 400–599 and count a whole number' })
    }
    failure = { status, left: count }
    return json(res, 200, { failing: failure })
  }

  if (path === '/__control/recall/bots' && req.method === 'GET') {
    return json(res, 200, { bots: [...recallBots.values()].map((b) => ({ ...botView(b), asked: b.asked, removed: b.removed })) })
  }
  if (path === '/__control/recall/reset' && req.method === 'POST') {
    recallBots.clear()
    return json(res, 200, { reset: true })
  }
  const moved = /^\/__control\/recall\/bots\/([A-Za-z0-9-]+)$/.exec(path)
  if (moved && req.method === 'POST') {
    const bot = recallBots.get(moved[1])
    if (!bot) return json(res, 404, { error: 'no such bot' })
    const body = await readBody(req)
    if (typeof body?.code !== 'string' || !body.code) return json(res, 400, { error: 'code is the status change' })
    bot.statusChanges.push({ code: body.code, sub_code: body.sub_code ?? null, created_at: new Date().toISOString() })
    if (body.code === 'done') {
      bot.done = true
      bot.transcript = Array.isArray(body.transcript) ? body.transcript : []
    }
    return json(res, 200, botView(bot))
  }

  if (path.startsWith('/recall/api/v1/bot/')) {
    // Recall's refusal of a key it does not know.
    if ((req.headers.authorization ?? '') !== `Token ${RECALL_KEY}`) {
      return json(res, 401, { detail: 'Invalid token.' })
    }
    if (path === '/recall/api/v1/bot/' && req.method === 'POST') {
      const body = await readBody(req)
      const meetingUrl = typeof body?.meeting_url === 'string' ? body.meeting_url : ''
      if (!MEETING_LINK.test(meetingUrl)) return json(res, 400, { meeting_url: ['Meeting URL is not a supported meeting link.'] })
      const id = createHash('sha1').update(`${meetingUrl}#${recallBots.size}#${Date.now()}`).digest('hex').slice(0, 8) + '-' + String(recallBots.size + 1).padStart(4, '0')
      const bot = { id, meetingUrl, botName: body.bot_name ?? null, joinAt: body.join_at ?? null, statusChanges: [], done: false, transcript: [], asked: body, removed: false }
      recallBots.set(id, bot)
      return json(res, 201, botView(bot))
    }
    const one = /^\/recall\/api\/v1\/bot\/([A-Za-z0-9-]+)\/(leave_call\/)?$/.exec(path)
    const bot = one ? recallBots.get(one[1]) : null
    if (!bot || bot.deleted) return json(res, 404, { detail: 'Not found.' })
    if (!one[2] && req.method === 'GET') return json(res, 200, botView(bot))
    if (!one[2] && req.method === 'DELETE') {
      // Only a bot that has not joined can be unscheduled; one in its call is asked to leave.
      if (bot.statusChanges.length) return json(res, 400, { detail: 'Cannot delete a bot that has already joined a call.' })
      bot.removed = true
      bot.deleted = true
      res.writeHead(204)
      return res.end()
    }
    if (one[2] && req.method === 'POST') {
      bot.statusChanges.push({ code: 'call_ended', sub_code: 'bot_received_leave_call', created_at: new Date().toISOString() })
      bot.removed = true
      return json(res, 200, botView(bot))
    }
    return json(res, 405, { detail: 'Method not allowed.' })
  }
  const media = /^\/recall\/media\/([A-Za-z0-9-]+)\/transcript\.json$/.exec(path)
  if (media && req.method === 'GET') {
    const bot = recallBots.get(media[1])
    if (!bot || !bot.done) return json(res, 404, { detail: 'Not found.' })
    return json(res, 200, bot.transcript)
  }

  if (path === '/__control/chat/requests' && req.method === 'GET') return json(res, 200, { requests: chatRequests })
  if (path === '/__control/chat/reset' && req.method === 'POST') {
    chatRequests.length = 0
    chatStaged.length = 0
    chatFailure = null
    return json(res, 200, { reset: true })
  }
  if (path === '/__control/chat/stage' && req.method === 'POST') {
    const body = await readBody(req)
    const replies = Array.isArray(body?.replies) ? body.replies : null
    const shaped = (r) =>
      r && typeof r === 'object' &&
      (r.content === undefined || typeof r.content === 'string') &&
      (r.tool_calls === undefined || (Array.isArray(r.tool_calls) && r.tool_calls.every((c) => typeof c?.name === 'string' && c.name)))
    if (!replies || !replies.length || !replies.every(shaped)) {
      return json(res, 400, { error: 'replies is a list of {content?, tool_calls?: [{name, arguments}]}' })
    }
    chatStaged.push(...replies)
    return json(res, 200, { staged: chatStaged.length })
  }
  if (path === '/__control/chat/fail' && req.method === 'POST') {
    const body = await readBody(req)
    const status = Number(body?.status)
    const count = Number(body?.count ?? 1)
    if (!Number.isInteger(status) || status < 400 || status > 599 || !Number.isInteger(count) || count < 1) {
      return json(res, 400, { error: 'status is 400–599 and count a whole number' })
    }
    chatFailure = { status, left: count }
    return json(res, 200, { failing: chatFailure })
  }

  if (path === '/openai/v1/chat/completions' && req.method === 'POST') {
    // OpenAI's refusal of a key it does not know.
    if ((req.headers.authorization ?? '') !== `Bearer ${CHAT_KEY}`) {
      return json(res, 401, { error: { message: 'Incorrect API key provided.', type: 'invalid_request_error', code: 'invalid_api_key' } })
    }
    if (chatFailure) {
      const { status } = chatFailure
      chatFailure.left -= 1
      if (chatFailure.left <= 0) chatFailure = null
      return json(res, status, { error: { message: status === 429 ? 'Rate limit reached for requests' : 'The server had an error while processing your request', type: status === 429 ? 'rate_limit_error' : 'server_error' } })
    }
    const body = await readBody(req)
    const model = typeof body?.model === 'string' ? body.model : ''
    const messages = Array.isArray(body?.messages) ? body.messages : []
    if (!model) return json(res, 400, { error: { message: 'you must provide a model parameter', type: 'invalid_request_error' } })
    if (!messages.length) return json(res, 400, { error: { message: "'messages' must contain at least one message", type: 'invalid_request_error' } })
    const textOf = (m) => (typeof m?.content === 'string' ? m.content : Array.isArray(m?.content) ? m.content.map((p) => (p?.type === 'text' ? p.text : '')).join(' ') : '')
    const lastUser = [...messages].reverse().find((m) => m?.role === 'user')
    const asked = textOf(lastUser).trim()
    chatRequests.push({
      model,
      stream: body.stream === true,
      roles: messages.map((m) => m?.role),
      system: textOf(messages.find((m) => m?.role === 'system')),
      asked,
      tools: Array.isArray(body.tools) ? body.tools.map((t) => t?.function?.name) : [],
      toolResults: messages.filter((m) => m?.role === 'tool').map((m) => ({ id: m.tool_call_id, content: m.content })),
      at: new Date().toISOString(),
    })
    const staged = chatStaged.shift()
    const content = staged ? (staged.content ?? '') : `ChatGPT (${model}) here. You asked: “${asked.slice(0, 120)}”`
    const calls = (staged?.tool_calls ?? []).map((c, i) => ({
      id: `call_${chatRequests.length}_${i + 1}`,
      name: c.name,
      args: typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments ?? {}),
    }))
    const finish = calls.length ? 'tool_calls' : 'stop'
    const usage = {
      prompt_tokens: Math.max(1, Math.ceil(JSON.stringify(messages).length / 4)),
      completion_tokens: Math.max(1, Math.ceil((content.length + calls.reduce((n, c) => n + c.args.length, 0)) / 4)),
    }
    usage.total_tokens = usage.prompt_tokens + usage.completion_tokens
    const id = `chatcmpl-${chatRequests.length}`
    const created = Math.floor(Date.now() / 1000)
    if (body.stream !== true) {
      return json(res, 200, {
        id, object: 'chat.completion', created, model,
        choices: [{ index: 0, message: { role: 'assistant', content: content || null, ...(calls.length ? { tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args } })) } : {}) }, finish_reason: finish }],
        usage,
      })
    }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    const send = (choices, extra = {}) => res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices, ...extra })}\n\n`)
    send([{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }])
    // The text in three pieces, as a model streams it: a reader joins them.
    const third = Math.ceil(content.length / 3)
    for (let at = 0; at < content.length; at += third) send([{ index: 0, delta: { content: content.slice(at, at + third) }, finish_reason: null }])
    calls.forEach((c, i) => {
      send([{ index: 0, delta: { tool_calls: [{ index: i, id: c.id, type: 'function', function: { name: c.name, arguments: '' } }] }, finish_reason: null }])
      const half = Math.ceil(c.args.length / 2)
      send([{ index: 0, delta: { tool_calls: [{ index: i, function: { arguments: c.args.slice(0, half) } }] }, finish_reason: null }])
      send([{ index: 0, delta: { tool_calls: [{ index: i, function: { arguments: c.args.slice(half) } }] }, finish_reason: null }])
    })
    send([{ index: 0, delta: {}, finish_reason: finish }])
    if (body.stream_options?.include_usage === true) send([], { usage })
    res.write('data: [DONE]\n\n')
    return res.end()
  }

  if (path === '/__control/geocode/requests' && req.method === 'GET') return json(res, 200, { requests: geocodeRequests })
  if (path === '/__control/geocode/reset' && req.method === 'POST') {
    geocodeRequests.length = 0
    return json(res, 200, { reset: true })
  }

  // Nominatim's search, as a geocoder answers an address.
  if (path === '/geocode' && req.method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').trim()
    geocodeRequests.push({ q, at: new Date().toISOString() })
    if (!q || /\bnowhere\b/i.test(q)) return json(res, 200, [])
    const known = PLACES.find((p) => q.toLowerCase().includes(p.match))
    if (known) return json(res, 200, [{ lat: String(known.lat), lon: String(known.lon), display_name: known.name }])
    const at = pointFor(q)
    return json(res, 200, [{ lat: at.lat, lon: at.lon, display_name: q }])
  }

  // One map tile: a square of the world, drawn with its own address so a page shows which it asked.
  const tile = /^\/tiles\/(\d{1,2})\/(\d+)\/(\d+)\.svg$/.exec(path)
  if (tile && req.method === 'GET') {
    const [z, x, y] = tile.slice(1).map(Number)
    if (x >= 2 ** z || y >= 2 ** z) return json(res, 404, { error: 'no such tile' })
    const shade = (x + y) % 2 ? '#e8f0e4' : '#eef4ea'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><rect width="256" height="256" fill="${shade}"/><path d="M0 0H256V256" fill="none" stroke="#c9d6c3"/><text x="8" y="20" font-family="sans-serif" font-size="11" fill="#7a8a74">${z}/${x}/${y}</text></svg>`
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'content-length': Buffer.byteLength(svg), 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' })
    return res.end(svg)
  }

  // The photograph itself: what an <img> on a cover or a result loads. No key, as Unsplash's image host asks none.
  const img = /^\/unsplash\/img\/([A-Za-z0-9_-]+)\.svg$/.exec(path)
  if (img && req.method === 'GET') {
    const p = byId.get(img[1])
    if (!p) return json(res, 404, { errors: ['Couldn\'t find Photo'] })
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800"><rect width="1200" height="800" fill="${p.color}"/><text x="600" y="420" font-family="sans-serif" font-size="48" fill="#fff" text-anchor="middle">${escapeXml(p.description)}</text></svg>`
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'content-length': Buffer.byteLength(svg), 'cache-control': 'public, max-age=3600' })
    return res.end(svg)
  }

  if (path === '/openai/v1/images/generations' && req.method === 'POST') {
    // OpenAI's refusal of a key it does not know.
    if ((req.headers.authorization ?? '') !== `Bearer ${IMAGES_KEY}`) {
      return json(res, 401, { error: { message: 'Incorrect API key provided.', type: 'invalid_request_error', code: 'invalid_api_key' } })
    }
    if (imageFailure) {
      const { status } = imageFailure
      imageFailure.left -= 1
      if (imageFailure.left <= 0) imageFailure = null
      return json(res, status, { error: { message: status === 429 ? 'Rate limit reached for images' : 'The server had an error processing your request', type: status === 429 ? 'rate_limit_error' : 'server_error' } })
    }
    const body = await readBody(req)
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
    const n = body?.n === undefined ? 1 : Number(body.n)
    if (!prompt) return json(res, 400, { error: { message: 'prompt is required', type: 'invalid_request_error' } })
    if (!Number.isInteger(n) || n < 1 || n > 10) return json(res, 400, { error: { message: 'n must be between 1 and 10', type: 'invalid_request_error' } })
    imageRequests.push({ model: body.model ?? null, prompt, n, size: body.size ?? null, at: new Date().toISOString() })
    const data = Array.from({ length: n }, (_, i) => ({ b64_json: pictureFor(prompt, i).toString('base64') }))
    return json(res, 200, { created: Math.floor(Date.now() / 1000), data })
  }

  if (!path.startsWith('/unsplash/')) return json(res, 404, { errors: ['Not found'] })

  // Unsplash's refusal of a key it does not know.
  const auth = req.headers.authorization ?? ''
  if (auth !== `Client-ID ${KEY}`) return json(res, 401, { errors: ['OAuth error: The access token is invalid'] })

  if (failure) {
    const { status } = failure
    failure.left -= 1
    if (failure.left <= 0) failure = null
    return json(res, status, { errors: [status === 403 ? 'Rate Limit Exceeded' : 'Something went wrong'] })
  }

  if (path === '/unsplash/search/photos' && req.method === 'GET') {
    const query = (url.searchParams.get('query') ?? '').trim().toLowerCase()
    if (!query) return json(res, 400, { errors: ['query is missing'] })
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const perPage = Math.min(30, Math.max(1, Number.parseInt(url.searchParams.get('per_page') ?? '10', 10) || 10))
    const words = query.split(/\s+/).filter(Boolean)
    const found = LIBRARY.filter((p) => matches(p, words))
    const results = found.slice((page - 1) * perPage, page * perPage).map(asUnsplash)
    return json(res, 200, { total: found.length, total_pages: Math.ceil(found.length / perPage), results })
  }

  const dl = /^\/unsplash\/photos\/([A-Za-z0-9_-]+)\/download$/.exec(path)
  if (dl && req.method === 'GET') {
    const p = byId.get(dl[1])
    if (!p) return json(res, 404, { errors: ['Couldn\'t find Photo'] })
    downloads.push({ id: p.id, at: new Date().toISOString() })
    return json(res, 200, { url: imageUrl(p.id, 4000) })
  }

  return json(res, 404, { errors: ['Not found'] })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(JSON.stringify({ ready: true, port: PORT, photos: LIBRARY.length, source: SOURCE }))
})
