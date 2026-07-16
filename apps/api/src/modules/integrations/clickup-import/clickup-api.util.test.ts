import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ClickUpApiClient,
  extractCommentText,
  clickupDate,
  safeAttachmentName,
  type FetchLike,
} from './clickup-api.util'

/**
 * §12.5 gap-closer — the ClickUp REST client that fetches the comments +
 * attachments a CSV export cannot carry. All HTTP is mocked via an injected
 * `fetchImpl` (real `Response` objects), so parsing, cursor pagination, 429
 * backoff, and defensive download behaviour are exercised without a network.
 */

const json = (obj: unknown, status = 200): Response =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } })

describe('clickup-api pure helpers', () => {
  it('extractCommentText prefers comment_text, falls back to segments', () => {
    assert.equal(extractCommentText({ id: '1', comment_text: 'flat' }), 'flat')
    assert.equal(extractCommentText({ id: '1', comment: [{ text: 'a' }, { text: 'b' }] }), 'ab')
    assert.equal(extractCommentText({ id: '1' }), '')
  })

  it('clickupDate parses epoch-ms strings and rejects junk', () => {
    assert.ok(clickupDate('1700000000000') instanceof Date)
    assert.equal(clickupDate(undefined), undefined)
    assert.equal(clickupDate('not-a-number'), undefined)
    assert.equal(clickupDate('0'), undefined)
  })

  it('safeAttachmentName strips unsafe chars and never yields empty', () => {
    assert.equal(safeAttachmentName('my file (1).png'), 'my_file_1_.png')
    // Empty (or all-stripped-to-empty) input falls back to a stable default.
    assert.equal(safeAttachmentName(''), 'attachment')
    // A non-empty run of unsafe chars collapses to a single underscore.
    assert.equal(safeAttachmentName('***'), '_')
  })
})

describe('ClickUpApiClient.getTaskComments', () => {
  it('parses one page and returns comments oldest-first', async () => {
    const calls: string[] = []
    const fetchImpl: FetchLike = async (input) => {
      calls.push(String(input))
      // ClickUp returns newest-first.
      return json({
        comments: [
          { id: 'c2', comment_text: 'second', date: '200' },
          { id: 'c1', comment_text: 'first', date: '100' },
        ],
      })
    }
    const client = new ClickUpApiClient({ apiToken: 'tok', fetchImpl })
    const comments = await client.getTaskComments('task-1')

    assert.deepEqual(
      comments.map((c) => c.id),
      ['c1', 'c2'],
    )
    assert.equal(calls.length, 1)
    assert.match(calls[0], /\/task\/task-1\/comment$/)
  })

  it('follows the start/start_id cursor across pages', async () => {
    const calls: string[] = []
    const page1 = Array.from({ length: 25 }, (_, i) => ({
      id: `p1-${i}`,
      comment_text: `c${i}`,
      date: String(1000 + i),
    }))
    const fetchImpl: FetchLike = async (input) => {
      const url = String(input)
      calls.push(url)
      if (!url.includes('start')) return json({ comments: page1 })
      return json({ comments: [{ id: 'p2-0', comment_text: 'last', date: '2000' }] })
    }
    const client = new ClickUpApiClient({ apiToken: 'tok', fetchImpl })
    const comments = await client.getTaskComments('task-1')

    assert.equal(comments.length, 26)
    assert.equal(calls.length, 2)
    // The oldest comment of page 1 (id p1-24, date 1024) drives page 2's cursor.
    assert.match(calls[1], /start=1024/)
    assert.match(calls[1], /start_id=p1-24/)
  })

  it('throws on a hard HTTP error (caller collects it)', async () => {
    const fetchImpl: FetchLike = async () => new Response('nope', { status: 500 })
    const client = new ClickUpApiClient({ apiToken: 'tok', fetchImpl })
    await assert.rejects(() => client.getTaskComments('task-1'), /HTTP 500/)
  })
})

describe('ClickUpApiClient.getTaskAttachments', () => {
  it('reads attachments[] off the task object', async () => {
    const fetchImpl: FetchLike = async () =>
      json({ attachments: [{ id: 'a1', title: 'x.png', mimetype: 'image/png', size: 9, url: 'u' }] })
    const client = new ClickUpApiClient({ apiToken: 'tok', fetchImpl })
    const atts = await client.getTaskAttachments('task-1')
    assert.equal(atts.length, 1)
    assert.equal(atts[0].title, 'x.png')
  })

  it('tolerates a task with no attachments field', async () => {
    const fetchImpl: FetchLike = async () => json({})
    const client = new ClickUpApiClient({ apiToken: 'tok', fetchImpl })
    assert.deepEqual(await client.getTaskAttachments('t'), [])
  })
})

describe('ClickUpApiClient.downloadAttachment', () => {
  it('streams bytes on success', async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(Buffer.from('hello'), { status: 200, headers: { 'content-type': 'image/png' } })
    const client = new ClickUpApiClient({ apiToken: 'tok', fetchImpl })
    const dl = await client.downloadAttachment({
      id: 'a',
      url: 'https://attachments.clickup.com/a.png',
      mimetype: 'image/png',
    })
    assert.ok(dl)
    assert.equal(dl.buffer.toString(), 'hello')
    assert.equal(dl.contentType, 'image/png')
  })

  it('returns null (never throws) on http error, network throw, or missing url', async () => {
    const notFound = new ClickUpApiClient({ apiToken: 'tok', fetchImpl: async () => new Response('', { status: 404 }) })
    assert.equal(await notFound.downloadAttachment({ id: 'a', url: 'https://x/a' }), null)

    const throwing = new ClickUpApiClient({
      apiToken: 'tok',
      fetchImpl: async () => {
        throw new Error('network down')
      },
    })
    assert.equal(await throwing.downloadAttachment({ id: 'a', url: 'https://x/a' }), null)

    const ok = new ClickUpApiClient({ apiToken: 'tok', fetchImpl: async () => new Response('x') })
    assert.equal(await ok.downloadAttachment({ id: 'a' }), null)
  })
})

describe('ClickUpApiClient rate limiting', () => {
  it('retries a 429 with bounded backoff then succeeds', async () => {
    let n = 0
    const fetchImpl: FetchLike = async () => {
      n++
      if (n === 1) return new Response('', { status: 429, headers: { 'retry-after': '0' } })
      return json({ attachments: [] })
    }
    const sleeps: number[] = []
    const client = new ClickUpApiClient({
      apiToken: 'tok',
      fetchImpl,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
    })
    assert.deepEqual(await client.getTaskAttachments('t'), [])
    assert.equal(n, 2)
    assert.equal(sleeps.length, 1)
  })
})
