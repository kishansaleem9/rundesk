import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mayDeleteClip, mayReadClip, readsOnlyOwnClips, recordedByReader } from './clip-access'

/*
 * `found-5-oct/guests-read-and-delete-every-clip` — whose a clip is, and who
 * may read and delete it. `test/e2e/clip-library-access.mjs` asks the same of
 * a real store, a real database and the clips page.
 */
describe('clip-access — whose a clip is', () => {
  it('the recorder is the one whose id the clip carries, whatever address it names', () => {
    const meta = { recordedbyid: 'u-1', recordedby: 'old@rundesk.dev' }
    // Their address has changed since they recorded it: still theirs.
    assert.equal(recordedByReader(meta, { id: 'u-1', email: 'new@rundesk.dev' }), true)
    // Somebody who holds the old address now is not its recorder.
    assert.equal(recordedByReader(meta, { id: 'u-2', email: 'old@rundesk.dev' }), false)
  })

  it('a clip from before the id is its recorder’s by address, and nobody’s without one', () => {
    const legacy = { recordedby: 'owner@rundesk.dev' }
    assert.equal(recordedByReader(legacy, { id: 'u-9', email: 'owner@rundesk.dev' }), true)
    assert.equal(recordedByReader(legacy, { id: 'u-9', email: 'OWNER@rundesk.dev ' }), true)
    assert.equal(recordedByReader(legacy, { id: 'u-9', email: 'someone@rundesk.dev' }), false)
    assert.equal(recordedByReader(legacy, { id: 'u-9' }), false)
    assert.equal(recordedByReader({}, { id: 'u-9', email: 'owner@rundesk.dev' }), false)
    assert.equal(recordedByReader(undefined, { id: 'u-9', email: 'owner@rundesk.dev' }), false)
  })
})

describe('clip-access — who reads and deletes it', () => {
  const theirs = { recordedbyid: 'me', recordedby: 'me@rundesk.dev' }
  const another = { recordedbyid: 'someone', recordedby: 'someone@rundesk.dev' }

  it('a guest reads only the clips they recorded; anybody else in the workspace reads every clip', () => {
    assert.equal(readsOnlyOwnClips('guest'), true)
    assert.equal(mayReadClip(theirs, { id: 'me', role: 'guest' }), true)
    assert.equal(mayReadClip(another, { id: 'me', role: 'guest' }), false)
    for (const role of ['member', 'manager', 'workspace_admin', 'super_admin']) {
      assert.equal(readsOnlyOwnClips(role), false, role)
      assert.equal(mayReadClip(another, { id: 'me', role }), true, role)
    }
  })

  it('a clip is deleted by its recorder or by somebody who manages the workspace, and by nobody else', () => {
    for (const role of ['guest', 'member']) {
      assert.equal(mayDeleteClip(theirs, { id: 'me', role }), true, `${role}, their own`)
      assert.equal(mayDeleteClip(another, { id: 'me', role }), false, `${role}, another's`)
    }
    // Somebody who manages the workspace: any clip, without its metadata being read.
    for (const role of ['manager', 'workspace_admin', 'super_admin']) {
      assert.equal(mayDeleteClip(another, { id: 'me', role }), true, role)
      assert.equal(mayDeleteClip(undefined, { id: 'me', role }), true, `${role}, unread`)
    }
    assert.equal(mayDeleteClip(another, { id: 'me', role: null }), false, 'no role')
  })
})
