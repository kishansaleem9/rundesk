import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clipPrefix, isWorkspaceClipKey } from './clip-keys'

describe('clip-keys — a clip of this workspace, by shape', () => {
  it('accepts exactly the key the clip presign mints', () => {
    assert.equal(isWorkspaceClipKey(`${clipPrefix('ws-1')}1790000000000-clip-2026-09-23.webm`, 'ws-1'), true)
  })

  it('refuses a key that starts with the prefix and walks out of it', () => {
    assert.equal(
      isWorkspaceClipKey('workspaces/ws-1/clips/../../../workspaces/ws-2/tasks/t/attachments/x.pdf', 'ws-1'),
      false,
    )
  })

  it('refuses another workspace’s clip, a nested path, the bare prefix and a non-string', () => {
    assert.equal(isWorkspaceClipKey('workspaces/ws-2/clips/1-a.webm', 'ws-1'), false)
    assert.equal(isWorkspaceClipKey('workspaces/ws-1/clips/a/b.webm', 'ws-1'), false)
    assert.equal(isWorkspaceClipKey('workspaces/ws-1/clips/', 'ws-1'), false)
    assert.equal(isWorkspaceClipKey(undefined, 'ws-1'), false)
  })
})
