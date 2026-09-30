import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { downloadName } from './download-name'

/*
 * ONE NAME RULE FOR EVERY DOWNLOAD THE API NAMES
 * (`found-30-sep/list-export-saved-as-list-csv`): a list's export, a doc's, a
 * task's Download all. The list's kept `[\w \-.]` and dropped the rest, so a
 * list named in Arabic went out as "list.csv"; the doc's turned everything but
 * `[a-zA-Z0-9._-]` into hyphens.
 */

/** The name `filename*` carries, decoded; null when there is none. */
const starName = (disposition: string) => {
  const m = /filename\*=UTF-8''([^;]+)$/.exec(disposition)
  return m ? decodeURIComponent(m[1]) : null
}
const plainName = (disposition: string) => /^attachment; filename="([^"]*)";/.exec(disposition)?.[1] ?? null

describe('downloadName — a download is named after what it is, in any script', () => {
  it('names a list or a doc after itself, whole in filename*, beside an ASCII filename', () => {
    const list = downloadName('Übersicht — قائمة', '.csv', 'list')
    assert.equal(list.fileName, 'Übersicht — قائمة.csv')
    assert.equal(starName(list.disposition), 'Übersicht — قائمة.csv')
    assert.equal(plainName(list.disposition), 'Ubersicht.csv')
    const doc = downloadName('Plan: Q3 review', '.md', 'document')
    assert.equal(doc.fileName, 'Plan_ Q3 review.md')
    assert.equal(doc.disposition, `attachment; filename="Plan_ Q3 review.md"; filename*=UTF-8''Plan_%20Q3%20review.md`)
  })

  it('falls back where a name leaves nothing, or nothing ASCII', () => {
    assert.equal(downloadName('', '.pdf', 'document').fileName, 'document.pdf')
    assert.equal(downloadName(null, '.csv', 'list').fileName, 'list.csv')
    const arabic = downloadName('قائمة التصدير', '.xlsx', 'list')
    assert.equal(arabic.fileName, 'قائمة التصدير.xlsx')
    assert.equal(plainName(arabic.disposition), 'list.xlsx')
    assert.equal(starName(arabic.disposition), 'قائمة التصدير.xlsx')
  })

  it('lets nothing in a name end the header early, start another, or name a path', () => {
    for (const title of ['a"; filename="evil.exe', 'line\r\nSet-Cookie: x=1', 'semi;colon%20', '../../etc/passwd']) {
      const { fileName, disposition } = downloadName(title, '.csv', 'list')
      assert.equal((disposition.match(/filename="/g) ?? []).length, 1, disposition)
      assert.equal((disposition.match(/filename\*=/g) ?? []).length, 1, disposition)
      assert.equal(/[\r\n]/.test(disposition), false, disposition)
      assert.equal(/^[\x20-\x7e]*$/.test(disposition), true, disposition)
      assert.equal(/[/\\]|\.\./.test(fileName), false, fileName)
      assert.equal(starName(disposition), fileName)
      assert.equal(/[";%]/.test(plainName(disposition) ?? '"'), false, disposition)
    }
  })
})
