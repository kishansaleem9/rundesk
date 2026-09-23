import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isKeyDirectlyUnder, isSafeSegment } from './object-key-shape'

describe('object-key-shape — a key is ours by SHAPE, not by prefix', () => {
  it('accepts the prefix plus one sanitised segment, dots inside a name included', () => {
    assert.equal(isKeyDirectlyUnder('chat/c1/attachments/1790000000000-report.final.pdf', 'chat/c1/attachments/'), true)
    assert.equal(isKeyDirectlyUnder('chat/c1/attachments/1-a..b.png', 'chat/c1/attachments/'), true)
  })

  it('refuses a key that walks out of the prefix — the bypass a startsWith check lets through', () => {
    assert.equal(isKeyDirectlyUnder('chat/w1/emoji/../../workspaces/w2/tasks/t/attachments/x.pdf', 'chat/w1/emoji/'), false)
  })

  it('refuses a nested path, an encoded slash, and the dot segments themselves', () => {
    assert.equal(isKeyDirectlyUnder('chat/c1/attachments/a/b.png', 'chat/c1/attachments/'), false)
    assert.equal(isKeyDirectlyUnder('chat/c1/attachments/..%2F..%2Fx', 'chat/c1/attachments/'), false)
    assert.equal(isKeyDirectlyUnder('chat/c1/attachments/..', 'chat/c1/attachments/'), false)
    assert.equal(isKeyDirectlyUnder('chat/c1/attachments/.', 'chat/c1/attachments/'), false)
  })

  it('refuses the bare prefix, another prefix, and anything that is not a string', () => {
    assert.equal(isKeyDirectlyUnder('chat/c1/attachments/', 'chat/c1/attachments/'), false)
    assert.equal(isKeyDirectlyUnder('chat/c2/attachments/x.png', 'chat/c1/attachments/'), false)
    assert.equal(isKeyDirectlyUnder(null, 'chat/c1/attachments/'), false)
    assert.equal(isKeyDirectlyUnder(42, 'chat/c1/attachments/'), false)
  })

  it('a safe segment is the sanitisers alphabet and nothing else', () => {
    assert.equal(isSafeSegment('recording-1790000000000.webm'), true)
    assert.equal(isSafeSegment('with space.png'), false)
    assert.equal(isSafeSegment('back\\slash'), false)
  })
})
