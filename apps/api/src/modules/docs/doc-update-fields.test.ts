import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DOC_UPDATABLE_FIELDS, pickDocUpdatable, unknownDocUpdateFields } from './doc-update-fields'

/** What `PATCH /docs/:id` may write. See doc-update-fields.ts for what it used to. */
describe('doc-update-fields — the one list the route and the service share', () => {
  it('names every column the route used to let through, in the order it arrived', () => {
    assert.deepEqual(
      unknownDocUpdateFields({ title: 'x', workspaceId: 'w', publicShareId: 's', createdById: 'u', archivedById: 'u' }),
      ['workspaceId', 'publicShareId', 'createdById', 'archivedById'],
    )
  })

  it('accepts every field the doc editor sends, and the version check', () => {
    const body = Object.fromEntries([...DOC_UPDATABLE_FIELDS, 'expectedUpdatedAt'].map((k) => [k, null]))
    assert.deepEqual(unknownDocUpdateFields(body), [])
  })

  it('writes the columns and never the version check, which is compared and not stored', () => {
    assert.deepEqual(pickDocUpdatable({ title: 't', expectedUpdatedAt: 'x', publicShareId: 's' }), { title: 't' })
  })

  it('keeps a field that is explicitly null — clearing a parent is a real edit', () => {
    assert.deepEqual(pickDocUpdatable({ parentDocId: null, spaceId: null }), { parentDocId: null, spaceId: null })
  })

  it('reads nothing from a body that is not an object', () => {
    assert.deepEqual(unknownDocUpdateFields(null), [])
    assert.deepEqual(unknownDocUpdateFields('workspaceId'), [])
  })
})
