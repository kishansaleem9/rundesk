import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError, downloadFile, downloadFilePost, refusalMessage } from './api'

/*
 * A DOWNLOAD, REFUSED OR SAVED, AS THE SERVER SAID IT.
 *
 * `found-30-sep/download-refusals-say-no-reason`: `downloadFile` threw
 * "Download failed (<status>)" and never read the refusal, so Download all past
 * its cap said only "Could not download the attachments".
 * `found-30-sep/list-export-saved-as-list-csv`: a list's export was saved as
 * "list.csv" whatever the server named it; with no name given, a download is
 * saved under the response's `Content-Disposition`.
 *
 * `fetch` answers what each test sets; the page's anchor is a stand-in that
 * records the name it was told to save under.
 */
let answer: () => Response = () => new Response('')
globalThis.fetch = (async () => answer()) as typeof fetch
const saved: string[] = []
;(globalThis as unknown as { document: unknown }).document = {
  cookie: '',
  createElement: () => {
    const a = { href: '', download: '', click: () => saved.push(a.download), remove: () => {} }
    return a
  },
  body: { appendChild: () => {} },
}
URL.createObjectURL = () => 'blob:stand-in'
URL.revokeObjectURL = () => {}

const envelope = (status: number, message: string, details?: unknown) =>
  new Response(JSON.stringify({ data: null, error: { status, message, details } }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
const refusal = async (run: () => Promise<void>) => {
  try {
    await run()
  } catch (err) {
    return err
  }
  throw new Error('the download was not refused')
}
const CAP = "This task's files come to 2048 MB, and a zip of them holds 1024 MB at most: download them one at a time"

test('a refused download carries the refusal’s own words, and a 4xx shows them to its reader', async () => {
  answer = () => envelope(400, CAP)
  const err = await refusal(() => downloadFile('/tasks/t1/attachments/zip'))
  assert.ok(err instanceof ApiError)
  assert.equal(err.status, 400)
  assert.equal(err.message, CAP)
  assert.equal(err.said, true)
  assert.equal(refusalMessage(err, 'Could not download the attachments'), CAP)

  answer = () => envelope(403, 'Board view download is part of a paid plan', { feature: 'boardExport' })
  const posted = await refusal(() => downloadFilePost('/workspaces/w1/reports/custom/export.pdf', {}, 'report.pdf'))
  assert.equal(refusalMessage(posted, 'fallback'), 'Board view download is part of a paid plan')
  assert.deepEqual((posted as ApiError).details, { feature: 'boardExport' })
  assert.deepEqual(saved, [])
})

test('the caller’s words stand for a refusal not meant for the reader: a server error, a lapsed session, a page that is not the API’s', async () => {
  answer = () => envelope(500, 'Internal server error')
  assert.equal(refusalMessage(await refusal(() => downloadFile('/docs/d1/export')), 'Could not export'), 'Could not export')
  answer = () => envelope(401, 'Unauthorized')
  assert.equal(refusalMessage(await refusal(() => downloadFile('/docs/d1/export')), 'Could not export'), 'Could not export')
  answer = () => new Response('<html>502 Bad Gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } })
  const page = await refusal(() => downloadFile('/docs/d1/export'))
  assert.equal((page as ApiError).message, 'Download failed (502)')
  assert.equal((page as ApiError).said, false)
  assert.equal(refusalMessage(page, 'Could not export'), 'Could not export')
  answer = () => new Response('', { status: 404 })
  assert.equal(refusalMessage(await refusal(() => downloadFile('/docs/d1/export')), 'Could not export'), 'Could not export')
  assert.equal(refusalMessage(new Error('network'), 'Could not export'), 'Could not export')
  assert.equal(refusalMessage(new ApiError(400, 'made up here'), 'Could not export'), 'Could not export')
})

test('with no name given, a download is saved under the name the response gives; with one, under that', async () => {
  saved.length = 0
  answer = () =>
    new Response('Name\r\n', {
      status: 200,
      headers: {
        'content-type': 'text/csv',
        'content-disposition': `attachment; filename="Ubersicht.csv"; filename*=UTF-8''${encodeURIComponent('Übersicht — قائمة.csv')}`,
      },
    })
  await downloadFile('/tasks/list/l1/export')
  await downloadFile('/tasks/list/l1/export', 'chosen.csv')
  assert.deepEqual(saved, ['Übersicht — قائمة.csv', 'chosen.csv'])
})
