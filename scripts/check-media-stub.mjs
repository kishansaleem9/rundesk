#!/usr/bin/env node
/*
 * THE PHOTO LIBRARY SEAM, AND THAT THE DOUBLE ON THE END OF IT IS HONEST
 * (`commit-log/log-601eacc-1`, `ledger-rows/row-739`).
 *
 * `scripts/e2e-lanes/media-stub.mjs` answers what the product asks Unsplash on
 * the lanes and in CI, so a suite can search a cover's photos and set one. A
 * stub that answered in shapes Unsplash does not — a page two that repeats page
 * one, a key it never checks, a download it never counts — would let that suite
 * pass about a product that fails against the real library. So the product's
 * OWN client (`photo-library.ts`) is driven against it here, and each rule of
 * the stub is broken in turn: a case must notice. And since 14 October the
 * same for ChatGPT answering a Brain turn (`commit-log/log-39863ff-1`): the
 * product's own `streamChat` against the stub's Chat Completions.
 *
 *   node scripts/check-media-stub.mjs            # the cases
 *   node scripts/check-media-stub.mjs --mutate   # and that each one bites
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { namedFailures } from './lib/mutate.mjs'
import { freePort } from './lib/free-port.mjs'
import { runMutant } from './lib/run-mutant.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const STUB = process.env.MEDIA_STUB ?? join(HERE, 'e2e-lanes/media-stub.mjs')
// Asked of the OS: a pid-chosen port could be a lane stub's (`scripts/lib/free-port.mjs`).
const PORT = await freePort()

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
 * The probe calls the product's own client, as the API calls it, against the
 * stub; what it prints is all the cases read. Each step is caught on its own,
 * so one broken rule costs one answer, not the run.
 */
const PROBE = `
import { searchPhotos, trackPhotoUse, photoLibraryConfig, PhotoLibraryFailed, PHOTOS_PER_PAGE } from './src/modules/cover-photos/photo-library'
import { generateImages, imagesConfig, ImagesFailed } from './src/modules/ai/image-generation'
import { streamChat, ProviderFailed } from './src/modules/ai/chat-providers'
import { geocode, geocoderConfigured, mapTilesTemplate } from './src/common/geo/geocoder'
const BASE = 'http://127.0.0.1:${PORT}'
const cfg = { base: BASE + '/unsplash', key: 'lane-photos' }
const control = (path: string, body?: unknown) =>
  fetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => r.json())
const status = (e: unknown) => (e instanceof PhotoLibraryFailed ? e.status : String(e))
const out: Record<string, unknown> = {}
;(async () => {
const step = async (name: string, fn: () => Promise<unknown>) => {
  try { out[name] = await fn() } catch (e) { out[name] = { threw: String(e) } }
}
await step('first', async () => {
  const p = await searchPhotos(cfg, 'mountain', 1)
  const one = p.photos[0]
  const img = one ? await fetch(one.thumbUrl) : null
  return {
    total: p.total, totalPages: p.totalPages, count: p.photos.length, perPage: PHOTOS_PER_PAGE,
    ids: p.photos.map((x) => x.id),
    every: p.photos.every((x) => /mountain/i.test(x.description) && x.url && x.thumbUrl && x.author.name && x.author.name !== 'Unsplash' && /^https:\\/\\/unsplash\\.com\\/@[a-z]+\\?utm_source=rundesk/.test(x.author.url) && x.pageUrl.includes('utm_source=rundesk')),
    image: img ? [img.status, img.headers.get('content-type')] : null,
  }
})
await step('second', async () => {
  const p = await searchPhotos(cfg, 'mountain', 2)
  return { count: p.photos.length, ids: p.photos.map((x) => x.id) }
})
await step('narrow', async () => {
  const p = await searchPhotos(cfg, 'mountain snow', 1)
  return { total: p.total, all: p.photos.every((x) => /snow/i.test(x.description) && /mountain/i.test(x.description)) }
})
await step('nothing', async () => (await searchPhotos(cfg, 'zebra crossing', 1)).total)
await step('wrongKey', async () => {
  try { await searchPhotos({ ...cfg, key: 'not-the-key' }, 'mountain', 1); return 'answered' } catch (e) { return status(e) }
})
await step('download', async () => {
  await control('/__control/photos/reset', {})
  const p = await searchPhotos(cfg, 'ocean', 1)
  await trackPhotoUse(cfg, p.photos[0].id)
  const held = (await control('/__control/photos/downloads')) as { downloads: { id: string }[] }
  return { used: p.photos[0].id, held: held.downloads.map((d) => d.id) }
})
await step('unknown', async () => {
  try { await trackPhotoUse(cfg, 'AAAAAAAAAAA'); return 'answered' } catch (e) { return status(e) }
})
await step('failure', async () => {
  await control('/__control/photos/fail', { status: 503, count: 1 })
  const answers: unknown[] = []
  for (let i = 0; i < 2; i++) {
    try { answers.push((await searchPhotos(cfg, 'city', 1)).total) } catch (e) { answers.push(status(e)) }
  }
  return answers
})
const icfg = { base: BASE + '/openai/v1', key: 'lane-images', model: 'gpt-image-1' }
const istatus = (e: unknown) => (e instanceof ImagesFailed ? e.status : String(e))
await step('images', async () => {
  await control('/__control/images/reset', {})
  const made = await generateImages(icfg, 'a lighthouse at dusk', 2, '1024x1024')
  const again = await generateImages(icfg, 'a lighthouse at dusk', 1, '1024x1024')
  const held = (await control('/__control/images/requests')) as { requests: { prompt: string; n: number; model: string; size: string }[] }
  const png = (b64: string) => Buffer.from(b64, 'base64').subarray(0, 8).toString('hex')
  return {
    count: made.length,
    pngs: made.map((m) => png(m.b64)),
    differ: made.length === 2 && made[0].b64 !== made[1].b64,
    same: again[0]?.b64 === made[0]?.b64,
    held: held.requests.map((r) => [r.prompt, r.n, r.model, r.size]),
  }
})
await step('imagesWrongKey', async () => {
  try { await generateImages({ ...icfg, key: 'not-the-key' }, 'x', 1, '1024x1024'); return 'answered' } catch (e) { return istatus(e) }
})
await step('imagesTooMany', async () => {
  try { await generateImages(icfg, 'x', 11, '1024x1024'); return 'answered' } catch (e) { return istatus(e) }
})
await step('imagesFailure', async () => {
  await control('/__control/images/fail', { status: 429, count: 1 })
  const answers: unknown[] = []
  for (let i = 0; i < 2; i++) {
    try { answers.push((await generateImages(icfg, 'a kite', 1, '1024x1024')).length) } catch (e) { answers.push(istatus(e)) }
  }
  return answers
})
const ccfg = { id: 'openai' as const, base: BASE + '/openai/v1', key: 'lane-chatgpt', model: 'gpt-5.4' }
const cstatus = (e: unknown) => (e instanceof ProviderFailed ? e.status : String(e))
const ask = async (c: typeof ccfg, messages: any[], tools?: any[]) => {
  const stream = streamChat(c, { system: 'You are Brain.', messages, tools })
  let text = ''
  for await (const e of stream) text += e.delta.text
  return { text, final: await stream.finalMessage() }
}
await step('chat', async () => {
  await control('/__control/chat/reset', {})
  const { text, final } = await ask(ccfg, [{ role: 'user', content: 'What is due this week?' }])
  const held = (await control('/__control/chat/requests')) as { requests: { model: string; stream: boolean; roles: string[]; asked: string; system: string }[] }
  return {
    text,
    blocks: final.content.map((b: any) => b.type),
    usage: [final.usage.input_tokens > 0, final.usage.output_tokens > 0],
    held: held.requests.map((r) => [r.model, r.stream, r.roles.join(','), r.asked, r.system]),
  }
})
await step('chatTool', async () => {
  await control('/__control/chat/reset', {})
  await control('/__control/chat/stage', { replies: [{ tool_calls: [{ name: 'create_list', arguments: { name: 'Launch plan', spaceName: 'Marketing' } }] }, { content: 'Made it.' }] })
  const tools = [{ name: 'create_list', input_schema: { type: 'object' } }]
  const first = await ask(ccfg, [{ role: 'user', content: 'Make a list' }], tools)
  const use = first.final.content.find((b: any) => b.type === 'tool_use') as any
  const second = await ask(ccfg, [
    { role: 'user', content: 'Make a list' },
    { role: 'assistant', content: first.final.content },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: use?.id, content: '{"ok":true}' }] },
  ], tools)
  const held = (await control('/__control/chat/requests')) as { requests: { tools: string[]; toolResults: { id: string; content: string }[] }[] }
  return {
    call: use ? [use.name, use.input] : null,
    after: second.text,
    tools: held.requests[0]?.tools,
    result: held.requests[1]?.toolResults?.map((r) => [r.id === use?.id, r.content]),
  }
})
await step('chatWrongKey', async () => {
  try { await ask({ ...ccfg, key: 'not-the-key' }, [{ role: 'user', content: 'hi' }]); return 'answered' } catch (e) { return cstatus(e) }
})
await step('chatFailure', async () => {
  await control('/__control/chat/fail', { status: 429, count: 1 })
  const answers: unknown[] = []
  for (let i = 0; i < 2; i++) {
    try { answers.push((await ask(ccfg, [{ role: 'user', content: 'again' }])).text.length > 0) } catch (e) { answers.push(cstatus(e)) }
  }
  return answers
})
await step('imagesConfig', async () => [
  imagesConfig({}),
  imagesConfig({ OPENAI_API_KEY: 'o' }),
  imagesConfig({ OPENAI_API_KEY: 'o', IMAGES_API_KEY: 'i', IMAGES_API_URL: 'http://x.test/v1/', IMAGES_MODEL: 'm' }),
])
await step('geocode', async () => {
  const env = { GEOCODER_URL: BASE + '/geocode' } as NodeJS.ProcessEnv
  await control('/__control/geocode/reset', {})
  const known = await geocode('Eiffel Tower, Paris', env)
  const again = await geocode('12 Some Street, Springfield', env)
  const twice = await geocode('12 Some Street, Springfield', env)
  const lost = await geocode('Nowhere Lane 1', env)
  const unset = await geocode('Eiffel Tower, Paris', {} as NodeJS.ProcessEnv)
  const held = (await control('/__control/geocode/requests')) as { requests: { q: string }[] }
  return {
    known, again, same: JSON.stringify(again) === JSON.stringify(twice), lost, unset,
    held: held.requests.map((r) => r.q),
    configured: [geocoderConfigured({} as NodeJS.ProcessEnv), geocoderConfigured(env)],
  }
})
await step('tiles', async () => {
  const one = await fetch(BASE + '/tiles/2/1/1.svg')
  const off = await fetch(BASE + '/tiles/2/9/1.svg')
  return {
    one: [one.status, one.headers.get('content-type')],
    off: off.status,
    template: [mapTilesTemplate({} as NodeJS.ProcessEnv), mapTilesTemplate({ MAP_TILES_URL: BASE + '/tiles/{z}/{x}/{y}.svg' } as NodeJS.ProcessEnv), mapTilesTemplate({ MAP_TILES_URL: BASE + '/tiles' } as NodeJS.ProcessEnv)],
  }
})
await step('config', async () => [
  photoLibraryConfig({}),
  photoLibraryConfig({ UNSPLASH_ACCESS_KEY: 'k' }),
  photoLibraryConfig({ UNSPLASH_ACCESS_KEY: 'k', UNSPLASH_API_URL: 'http://x.test/unsplash/' }),
])
console.log('RESULT ' + JSON.stringify(out))
})()
`

const startStub = () => {
  const child = spawn(process.execPath, [STUB, '--port', String(PORT)], {
    env: { ...process.env, RUNDESK_MEDIA_STUB: '1' },
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
const probeFileOf = (pid) => join(ROOT, 'apps/api', `.media-stub-probe-${pid}.ts`)
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
const refused = spawnSync(process.execPath, [STUB, '--port', String(PORT)], { encoding: 'utf8', timeout: 20_000, env: { ...process.env, RUNDESK_MEDIA_STUB: '' } })
chk(refused.status !== 0 && /RUNDESK_MEDIA_STUB=1/.test(refused.stderr ?? ''), 'the stub refuses to start without RUNDESK_MEDIA_STUB=1', `exit ${refused.status}: ${(refused.stderr ?? '').trim().slice(0, 120)}`)

const stub = await startStub()
let out
try {
  console.log('\n▶ the product’s photo library client, against the stub')
  out = probe()
} finally {
  stub.kill('SIGTERM')
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
if (out.none !== undefined) {
  console.error(`\n[media-stub] the probe printed no result:\n${out.none}`)
  process.exitCode = 1
} else {
  const f = out.first ?? {}
  chk(
    f.total === 30 && f.totalPages === 2 && f.count === f.perPage && f.every === true,
    'a search answers Unsplash’s page of photos: the total, the pages, a full first page, each a photo of what was asked with its renditions and its photographer, credited with the app’s referral',
    `answered ${JSON.stringify({ total: f.total, totalPages: f.totalPages, count: f.count, every: f.every })}`,
  )
  chk(same(f.image, [200, 'image/svg+xml']), 'and a result’s picture is there to draw, with no key', `the picture answered ${JSON.stringify(f.image)}`)
  const s = out.second ?? {}
  chk(
    s.count === 6 && Array.isArray(s.ids) && Array.isArray(f.ids) && s.ids.every((id) => !f.ids.includes(id)),
    'page two holds the rest, none of page one again',
    `page two ${JSON.stringify(s)}`,
  )
  chk(out.narrow?.all === true && out.narrow?.total > 0 && out.narrow.total < 30, 'two words find the photos holding both', `answered ${JSON.stringify(out.narrow)}`)
  chk(out.nothing === 0, 'and words no photo holds find nothing', `answered ${JSON.stringify(out.nothing)}`)
  chk(out.wrongKey === 401, 'a key that is not the lane’s is refused 401, as Unsplash refuses one it does not know', `answered ${JSON.stringify(out.wrongKey)}`)
  chk(
    out.download?.used && same(out.download?.held, [out.download.used]),
    'a photo put to use is counted as downloaded, as Unsplash asks an app to trigger',
    `used ${JSON.stringify(out.download)}`,
  )
  chk(out.unknown === 404, 'and a photo the library does not hold is not found', `answered ${JSON.stringify(out.unknown)}`)
  chk(same(out.failure, [503, 8]), 'a staged failure answers the calls it was asked to, and then the library answers again', `answered ${JSON.stringify(out.failure)}`)
  chk(
    same(out.config, [null, { base: 'https://api.unsplash.com', key: 'k' }, { base: 'http://x.test/unsplash', key: 'k' }]),
    'with no key there is no library, and the address is Unsplash’s unless one is given',
    `read ${JSON.stringify(out.config)}`,
  )
  const im = out.images ?? {}
  chk(
    im.count === 2 && same(im.pngs, ['89504e470d0a1a0a', '89504e470d0a1a0a']) && im.differ === true && im.same === true &&
      same(im.held, [['a lighthouse at dusk', 2, 'gpt-image-1', '1024x1024'], ['a lighthouse at dusk', 1, 'gpt-image-1', '1024x1024']]),
    'images are made to order in OpenAI’s shape: as many PNGs as asked, each its own, the same prompt drawing the same first picture, and every request kept with its model and size',
    `made ${JSON.stringify({ count: im.count, pngs: im.pngs, differ: im.differ, same: im.same, held: im.held })}`,
  )
  chk(out.imagesWrongKey === 401, 'a key that is not the lane’s is refused 401, as OpenAI refuses one it does not know', `answered ${JSON.stringify(out.imagesWrongKey)}`)
  chk(out.imagesTooMany === 400, 'and more than ten pictures for one prompt are refused 400, as OpenAI refuses them', `answered ${JSON.stringify(out.imagesTooMany)}`)
  chk(same(out.imagesFailure, [429, 1]), 'a staged failure answers the requests it was asked to, and then pictures come again', `answered ${JSON.stringify(out.imagesFailure)}`)
  chk(
    same(out.imagesConfig, [null, { base: 'https://api.openai.com/v1', key: 'o', model: 'gpt-image-1' }, { base: 'http://x.test/v1', key: 'i', model: 'm' }]),
    'with no key images are not set up; OpenAI’s address and model unless others are given, and IMAGES_API_KEY before OPENAI_API_KEY',
    `read ${JSON.stringify(out.imagesConfig)}`,
  )
  // ChatGPT answering a Brain turn (`commit-log/log-39863ff-1`): the product's own client against the stub.
  const c = out.chat ?? {}
  chk(
    c.text === 'ChatGPT (gpt-5.4) here. You asked: “What is due this week?”' && same(c.blocks, ['text']) && same(c.usage, [true, true]) &&
      same(c.held, [['gpt-5.4', true, 'system,user', 'What is due this week?', 'You are Brain.']]),
    'ChatGPT answers a turn in OpenAI’s chat shape, streamed: its pieces joined into one answer, the tokens counted, and the request kept with its model, its roles and what was asked',
    `answered ${JSON.stringify(c)}`,
  )
  const ct = out.chatTool ?? {}
  chk(
    same(ct.call, ['create_list', { name: 'Launch plan', spaceName: 'Marketing' }]) && ct.after === 'Made it.' &&
      same(ct.tools, ['create_list']) && same(ct.result, [[true, '{"ok":true}']]),
    'a staged tool call comes back as one call with its whole arguments, and the next ask carries its result under the call’s id',
    `answered ${JSON.stringify(ct)}`,
  )
  chk(out.chatWrongKey === 401, 'a chat key that is not the lane’s is refused 401, in OpenAI’s words', `answered ${JSON.stringify(out.chatWrongKey)}`)
  chk(same(out.chatFailure, [429, true]), 'a staged chat failure answers the requests it was asked to, and then ChatGPT answers again', `answered ${JSON.stringify(out.chatFailure)}`)
  // A map's two services (`ledger-rows/row-777`): the product's geocoder client and the tiles, against the stub.
  const g = out.geocode ?? {}
  chk(
    same(g.known, { lat: 48.8584, lng: 2.2945 }) && g.again && g.same === true && g.lost === null &&
      same(g.held, ['Eiffel Tower, Paris', '12 Some Street, Springfield', '12 Some Street, Springfield', 'Nowhere Lane 1']),
    'the geocoder answers in Nominatim’s shape: a known place at its point, any other address at the same point every time, “nowhere” not found — and every address asked is kept',
    `answered ${JSON.stringify(g)}`,
  )
  chk(
    g.unset === null && same(g.configured, [false, true]),
    'and with no GEOCODER_URL nothing is asked and nothing is placed',
    `answered ${JSON.stringify({ unset: g.unset, configured: g.configured })}`,
  )
  const t = out.tiles ?? {}
  chk(
    same(t.one, [200, 'image/svg+xml']) && t.off === 404 &&
      same(t.template, [null, 'http://127.0.0.1:' + PORT + '/tiles/{z}/{x}/{y}.svg', null]),
    'a tile inside the world is drawn and one outside it is not; MAP_TILES_URL is taken only as a {z}/{x}/{y} template',
    `answered ${JSON.stringify(t)}`,
  )
}

if (process.argv.includes('--mutate')) {
  // Each mutant runs this whole file again, a probe included.
  const MUTANT_TIMEOUT_MS = Number(process.env.STUB_GATE_MUTANT_TIMEOUT_MS) || 300_000
  const ORIGINAL = readFileSync(STUB, 'utf8')
  let blind = 0
  const MUTATIONS = [
    ['any key is taken', "if (auth !== `Client-ID ${KEY}`) return json(res, 401", "if (auth === 'never') return json(res, 401"],
    ['page two repeats page one', 'const results = found.slice((page - 1) * perPage, page * perPage).map(asUnsplash)', 'const results = found.slice(0, perPage).map(asUnsplash)'],
    ['any one word matches', 'return words.every((w) => hay.includes(w))', 'return words.some((w) => hay.includes(w))'],
    ['a download is answered and not counted', "    downloads.push({ id: p.id, at: new Date().toISOString() })\n", ''],
    ['an unknown photo is downloaded', "  const dl = /^\\/unsplash\\/photos\\/([A-Za-z0-9_-]+)\\/download$/.exec(path)\n  if (dl && req.method === 'GET') {\n    const p = byId.get(dl[1])\n    if (!p) return json(res, 404", "  const dl = /^\\/unsplash\\/photos\\/([A-Za-z0-9_-]+)\\/download$/.exec(path)\n  if (dl && req.method === 'GET') {\n    const p = byId.get(dl[1]) ?? LIBRARY[0]\n    if (!p) return json(res, 404"],
    ['a staged failure never runs out', '    failure.left -= 1\n', ''],
    ['the picture is not there', "  if (img && req.method === 'GET') {", "  if (img && req.method === 'NEVER') {"],
    ['the photographer is nobody', "user: { id: p.user.username, username: p.user.username, name: p.user.name, links: { html: `https://unsplash.com/@${p.user.username}` } },", 'user: {},'],
    ['any images key is taken', "if ((req.headers.authorization ?? '') !== `Bearer ${IMAGES_KEY}`) {", "if ((req.headers.authorization ?? '') === 'never') {"],
    ['one picture whatever is asked', '    const data = Array.from({ length: n }, (_, i) => ({ b64_json: pictureFor(prompt, i).toString(\'base64\') }))', '    const data = [{ b64_json: pictureFor(prompt, 0).toString(\'base64\') }]'],
    ['every picture of an answer the same', "  const h = createHash('sha1').update(`${prompt}#${index}`).digest()", "  const h = createHash('sha1').update(`${prompt}#${index * 0}`).digest()"],
    ['a staged image failure never runs out', '      imageFailure.left -= 1\n', ''],
    ['an image request is answered and not kept', "    imageRequests.push({ model: body.model ?? null, prompt, n, size: body.size ?? null, at: new Date().toISOString() })\n", ''],
    ['nowhere is somewhere', "    if (!q || /\\bnowhere\\b/i.test(q)) return json(res, 200, [])\n", "    if (!q) return json(res, 200, [])\n"],
    ['a known place lands where its words say', "    const known = PLACES.find((p) => q.toLowerCase().includes(p.match))\n", "    const known = undefined\n"],
    ['a tile outside the world is drawn', "    if (x >= 2 ** z || y >= 2 ** z) return json(res, 404, { error: 'no such tile' })\n", ''],
    ['any chat key is taken', "if ((req.headers.authorization ?? '') !== `Bearer ${CHAT_KEY}`) {", "if ((req.headers.authorization ?? '') === 'never') {"],
    ['a tool call is sent without its arguments', "      send([{ index: 0, delta: { tool_calls: [{ index: i, function: { arguments: c.args.slice(half) } }] }, finish_reason: null }])\n", ''],
    ['the tokens are never counted', "    if (body.stream_options?.include_usage === true) send([], { usage })\n", ''],
    ['a staged chat failure never runs out', '      chatFailure.left -= 1\n', ''],
    ['a chat request is answered and not kept', '    chatRequests.push({\n', '    ;({\n'],
  ]
  console.log('\n▶ and each mutation of the stub reddens a case')
  for (const [label, from, to] of MUTATIONS) {
    if (ORIGINAL.split(from).length - 1 !== 1) {
      console.log(`  \x1b[31mANCHOR MISS\x1b[0m ${label}`)
      blind += 1
      continue
    }
    // Beside the original, never over it.
    const mutant = join(dirname(STUB), `.media-stub-mutant-${label.replace(/\W+/g, '-')}.mjs`)
    try {
      writeFileSync(mutant, ORIGINAL.split(from).join(to))
      const r = runMutant([fileURLToPath(import.meta.url)], {
        timeout: MUTANT_TIMEOUT_MS,
        env: { ...process.env, MEDIA_STUB: mutant },
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
  console.error(`\n[media-stub] ${fail} case(s) did not hold:`)
  for (const f of failures) console.error(`  · ${f}`)
  process.exitCode = 1
}
