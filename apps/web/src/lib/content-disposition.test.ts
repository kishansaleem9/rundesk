import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filenameFromContentDisposition } from './content-disposition'

/*
 * A download is saved under the name the server gives it
 * (`found-30-sep/attachments-have-no-download-all`): the whole name from
 * `filename*` when there is one, else the plain `filename`.
 */
test('a download takes its name from Content-Disposition, preferring the UTF-8 filename*', () => {
  assert.equal(
    filenameFromContentDisposition(`attachment; filename="task-attachments.zip"; filename*=UTF-8''%D9%85%D8%B1%D8%A7%D8%AC%D8%B9%D8%A9-attachments.zip`),
    'مراجعة-attachments.zip',
  )
  assert.equal(filenameFromContentDisposition('attachment; filename="Q3_ _final__review-attachments.zip"'), 'Q3_ _final__review-attachments.zip')
  assert.equal(filenameFromContentDisposition('attachment; filename=plain.csv'), 'plain.csv')
  // A broken encoding falls back to the plain name; no header, or no name, is no name.
  assert.equal(filenameFromContentDisposition(`attachment; filename="safe.zip"; filename*=UTF-8''%E0%A4%A`), 'safe.zip')
  assert.equal(filenameFromContentDisposition(null), null)
  assert.equal(filenameFromContentDisposition('inline'), null)
})
