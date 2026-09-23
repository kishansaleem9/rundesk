import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isCallRecordingKeyFor, isWorkspaceCallRecordingKey } from './call-recording-keys'

describe('call-recording-keys', () => {
  it('a call accepts exactly the key its presign mints', () => {
    assert.equal(isCallRecordingKeyFor('calls/w1/c1/recording-1790000000000.webm', 'w1', 'c1'), true)
    assert.equal(isCallRecordingKeyFor('calls/w1/c2/recording-1.webm', 'w1', 'c1'), false)
    assert.equal(isCallRecordingKeyFor('calls/w1/c1/../../w2/c9/recording-1.webm', 'w1', 'c1'), false)
  })

  it('a meeting pointer may name a recording of any call in its own workspace, and nothing else', () => {
    assert.equal(isWorkspaceCallRecordingKey('calls/w1/c7/recording-1.webm', 'w1'), true)
    assert.equal(isWorkspaceCallRecordingKey('calls/w2/c7/recording-1.webm', 'w1'), false)
    assert.equal(isWorkspaceCallRecordingKey('workspaces/w1/tasks/t/attachments/x.pdf', 'w1'), false)
    assert.equal(isWorkspaceCallRecordingKey('calls/w1/../x/recording-1.webm', 'w1'), false)
    assert.equal(isWorkspaceCallRecordingKey('calls/w1/c7/a/b.webm', 'w1'), false)
  })
})
