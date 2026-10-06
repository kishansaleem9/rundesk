import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BadRequestException } from '@nestjs/common'
import { DocsService, DOC_IMPORT_ACCEPTS } from './docs.service'

/*
 * A FILE THAT IS NOT TEXT IS REFUSED IN THE PAGE'S OWN WORDS
 * (`found-6-oct/doc-import-answers-500-to-a-binary-file`). An .xlsx's bytes or a
 * legacy .xls's, sent as a .md, reached the database and answered 500. Here the
 * database is a stand-in that records whether anything was asked of it, and the
 * permission rules are stubbed: what is checked is what the import refuses
 * before either. `doc-import.mjs` sends both files on a lane.
 */
function service() {
  let asked = 0
  const db = new Proxy({}, { get: () => () => { asked += 1; throw new Error('the database was asked') } })
  const docs = new DocsService(db as any, {} as any, {} as any, {} as any)
  ;(docs as any).assertMayMakeDocIn = async () => { asked += 1; throw new Error('the permission rules were asked') }
  return { docs, asked: () => asked }
}
const XLSX = 'PK\u0003\u0004\u0014\u0000\u0006\u0000[Content_Types].xml'
const XLS = 'ÐÏ\u0011à¡±\u001aá\u0000\u0000\u0000\u0000'

describe('DocsService.importDocFromMarkdown — a file that is not text', () => {
  it('refuses a zip and a file holding a NUL, named .md, in the import panel’s words, before anything is asked', async () => {
    for (const markdown of [XLSX, XLS, '# Notes\n\nA line\u0000 with a NUL in it\n']) {
      const { docs, asked } = service()
      await assert.rejects(
        () => docs.importDocFromMarkdown('w1', 'u1', { fileName: 'notes.md', markdown }),
        (e: unknown) => e instanceof BadRequestException && e.message === DOC_IMPORT_ACCEPTS,
      )
      assert.equal(asked(), 0, JSON.stringify(markdown.slice(0, 12)))
    }
  })

  it('takes Markdown on to the rules that ask where it may go', async () => {
    const { docs, asked } = service()
    await assert.rejects(() => docs.importDocFromMarkdown('w1', 'u1', { fileName: 'notes.md', markdown: '# Notes\n\nPK is a column name here.\n' }), /the permission rules were asked/)
    assert.equal(asked(), 1)
  })
})
