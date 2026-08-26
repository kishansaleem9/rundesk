import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MESH_LIMIT, shouldInitiate } from './use-webrtc-call'

/**
 * §2.8 — the two pure decisions inside a mesh call.
 *
 * Both fail in the same miserable way: two people in a call, no error
 * anywhere, and nothing on screen. Neither is visible from the outside, so
 * neither can be debugged by looking.
 */

describe('§2.8 who calls whom', () => {
  it('has exactly one side offer', () => {
    // Both peers learn about each other at the same instant. If both offer,
    // the handshakes collide: two half-open connections, neither completing,
    // and no error to explain it.
    assert.equal(shouldInitiate('aaa', 'bbb'), true)
    assert.equal(shouldInitiate('bbb', 'aaa'), false)
  })

  it('is symmetric for every pair, so both sides agree without asking', () => {
    // Computed identically on both machines with no extra round trip. If it
    // were not symmetric, the two would disagree about whose turn it was.
    const ids = ['u-1', 'u-2', 'u-30', 'u-4', 'aaaa-1111', 'zzzz-9999']
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue
        assert.notEqual(
          shouldInitiate(a, b),
          shouldInitiate(b, a),
          `${a} and ${b} both think it is the other's turn — or both think it is their own`,
        )
      }
    }
  })

  it('never has someone offer to themselves', () => {
    assert.equal(shouldInitiate('same', 'same'), false)
  })

  it('holds for realistic uuids', () => {
    const a = '11111111-1111-4111-8111-111111111111'
    const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    assert.notEqual(shouldInitiate(a, b), shouldInitiate(b, a))
  })
})

describe('§2.8 the mesh has a ceiling, and admits it', () => {
  it('is a small number, because everyone uploads to everyone', () => {
    // In a mesh each person sends their stream once PER PEER. At 6 that is 5
    // uploads each; the number exists so the UI can warn rather than let a
    // large call quietly turn to slideshow.
    assert.ok(MESH_LIMIT >= 2, 'a call needs at least two people')
    assert.ok(MESH_LIMIT <= 8, `${MESH_LIMIT} peers in a mesh will not hold up`)
  })
})
