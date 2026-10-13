import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ImportFilesService, importFilePrefix, isOwnImportKey } from './import-files'

/**
 * A FILE TO IMPORT IS ITS UPLOADER'S (`commit-log/log-601eacc-2`): its key
 * says whose it is, and an import reads only its importer's own.
 */
const WS = '11111111-1111-4111-8111-111111111111'
const ME = '22222222-2222-4222-8222-222222222222'
const YOU = '33333333-3333-4333-8333-333333333333'

describe('isOwnImportKey', () => {
  it('is a key one segment under the importer’s own place, and nothing else', () => {
    const mine = `${importFilePrefix(WS, ME)}1760000000000-board.xlsx`
    assert.equal(isOwnImportKey(mine, WS, ME), true)
    assert.equal(isOwnImportKey(`${importFilePrefix(WS, YOU)}1760000000000-board.xlsx`, WS, ME), false, 'somebody else’s')
    assert.equal(isOwnImportKey(`${importFilePrefix(WS, ME)}../${YOU}/1-board.xlsx`, WS, ME), false, 'a way out of it')
    assert.equal(isOwnImportKey(`${importFilePrefix(WS, ME)}sub/1-board.xlsx`, WS, ME), false, 'a folder below it')
    assert.equal(isOwnImportKey(`workspaces/${WS}/tasks/x/attachments/1-board.xlsx`, WS, ME), false, 'a task’s file')
    assert.equal(isOwnImportKey(undefined, WS, ME), false)
    assert.equal(isOwnImportKey(42, WS, ME), false)
  })
})

describe('ImportFilesService', () => {
  type Row = { role: string }
  const db = (member: Row | undefined) =>
    ({
      select: () => ({ from: () => ({ where: () => ({ limit: async () => (member ? [member] : []) }) }) }),
    }) as never
  const r2 = (configured = true) => {
    const signed: Array<{ key: string; type: string }> = []
    return {
      signed,
      store: {
        configured,
        presignPutObject: async (key: string, type: string) => {
          signed.push({ key, type })
          return `https://store.test/${key}?sig=1`
        },
        listAllObjects: async () => [],
        deleteObject: async () => undefined,
        headObject: async () => ({ ContentLength: 10 }),
        getObject: async () => Buffer.from('Title\nA\n'),
      },
    }
  }

  it('signs an upload under the uploader’s own place, the dots run together made one', async () => {
    const { signed, store } = r2()
    const svc = new ImportFilesService(db({ role: 'admin' }), store as never)
    const made = await svc.createUpload(WS, ME, { fileName: 'Q3..board.xlsx', contentType: 'application/vnd.ms-excel', sizeBytes: 100, purpose: 'sheet' })
    assert.ok(isOwnImportKey(made.fileKey, WS, ME), made.fileKey)
    assert.match(made.fileKey, /-Q3\.board\.xlsx$/)
    assert.equal(signed[0].type, 'application/vnd.ms-excel')
  })

  it('refuses a guest anything but a document, a purpose it does not know, a size past the limit, and a server with no store', async () => {
    await assert.rejects(() => new ImportFilesService(db({ role: 'guest' }), r2().store as never).createUpload(WS, ME, { purpose: 'sheet' }), /Guests do not import/)
    await new ImportFilesService(db({ role: 'guest' }), r2().store as never).createUpload(WS, ME, { purpose: 'doc', fileName: 'a.docx' })
    await assert.rejects(() => new ImportFilesService(db({ role: 'admin' }), r2().store as never).createUpload(WS, ME, { purpose: 'video' }), /what the file is for/)
    await assert.rejects(() => new ImportFilesService(db({ role: 'admin' }), r2().store as never).createUpload(WS, ME, { purpose: 'sheet', sizeBytes: 26 * 1024 * 1024 }), /larger than 25 MB/)
    await assert.rejects(() => new ImportFilesService(db({ role: 'admin' }), r2(false).store as never).createUpload(WS, ME, { purpose: 'sheet' }), /not configured/)
    await assert.rejects(() => new ImportFilesService(db(undefined), r2().store as never).createUpload(WS, ME, { purpose: 'doc' }), /not a member/)
  })

  it('reads only the importer’s own key', async () => {
    const svc = new ImportFilesService(db({ role: 'admin' }), r2().store as never)
    assert.equal((await svc.read(WS, ME, `${importFilePrefix(WS, ME)}1-a.csv`, 'sheet')).toString(), 'Title\nA\n')
    await assert.rejects(() => svc.read(WS, ME, `${importFilePrefix(WS, YOU)}1-a.csv`, 'sheet'), /not uploaded by you/)
  })
})
