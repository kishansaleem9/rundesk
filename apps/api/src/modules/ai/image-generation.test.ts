import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { generateImages, imageFileName, imagesConfig, ImagesFailed } from './image-generation'

/** A one-route stand-in for the images service: `answer` decides each reply, and every request is kept. */
const service = async (answer: (body: any, res: ServerResponse) => void) => {
  const asked: { auth: string | undefined; path: string | undefined; body: any }[] = []
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const body = JSON.parse(raw || 'null')
      asked.push({ auth: req.headers.authorization, path: req.url, body })
      answer(body, res)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
  return { base, asked, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
}
const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

test('with no key, image generation is not set up; IMAGES_API_KEY, else OPENAI_API_KEY, sets it up — at OpenAI and with gpt-image-1 unless told otherwise', () => {
  assert.equal(imagesConfig({}), null)
  assert.equal(imagesConfig({ IMAGES_API_KEY: '   ' }), null)
  assert.deepEqual(imagesConfig({ OPENAI_API_KEY: 'o' }), { base: 'https://api.openai.com/v1', key: 'o', model: 'gpt-image-1' })
  assert.deepEqual(
    imagesConfig({ IMAGES_API_KEY: 'i', OPENAI_API_KEY: 'o', IMAGES_API_URL: 'http://127.0.0.1:9500/openai/v1/', IMAGES_MODEL: 'dall-e-3' }),
    { base: 'http://127.0.0.1:9500/openai/v1', key: 'i', model: 'dall-e-3' },
  )
})

test('a picture is named after its description and its place: lower case, words joined by hyphens, forty characters at most, and “image” when no word is left', () => {
  assert.equal(imageFileName('A lighthouse, at dusk!', 0), 'a-lighthouse-at-dusk-1.png')
  assert.equal(imageFileName(`${'x'.repeat(39)} yz`, 1), `${'x'.repeat(39)}-2.png`)
  assert.equal(imageFileName('日本の山', 2), 'image-3.png')
})

test('the service is asked in OpenAI’s shape — the model, the description, how many and the size, with the key — and its pictures come back as PNGs', async () => {
  const s = await service((body, res) => send(res, 200, { created: 1, data: Array.from({ length: body.n }, (_, i) => ({ b64_json: `cGljdHVyZQ${i}` })) }))
  try {
    const made = await generateImages({ base: s.base, key: 'k', model: 'gpt-image-1' }, 'a red kite', 2, '1536x1024')
    assert.deepEqual(made, [{ mime: 'image/png', b64: 'cGljdHVyZQ0' }, { mime: 'image/png', b64: 'cGljdHVyZQ1' }])
    assert.deepEqual(s.asked, [{ auth: 'Bearer k', path: '/v1/images/generations', body: { model: 'gpt-image-1', prompt: 'a red kite', n: 2, size: '1536x1024' } }])
  } finally {
    await s.close()
  }
})

test('a refusal keeps the service’s status and words; an answer with no pictures, and no answer at all, are failures too', async () => {
  const s = await service((body, res) =>
    body.prompt === 'limited'
      ? send(res, 429, { error: { message: 'Rate limit reached for images' } })
      : send(res, 200, { created: 1, data: [] }),
  )
  try {
    const cfg = { base: s.base, key: 'k', model: 'gpt-image-1' }
    await assert.rejects(generateImages(cfg, 'limited', 1, '1024x1024'), (e: unknown) => e instanceof ImagesFailed && e.status === 429 && e.message === 'Rate limit reached for images')
    await assert.rejects(generateImages(cfg, 'nothing', 1, '1024x1024'), (e: unknown) => e instanceof ImagesFailed && e.status === 200)
  } finally {
    await s.close()
  }
  await assert.rejects(
    generateImages({ base: s.base, key: 'k', model: 'gpt-image-1' }, 'gone', 1, '1024x1024', 2000),
    (e: unknown) => e instanceof ImagesFailed && e.status === 0,
  )
})
