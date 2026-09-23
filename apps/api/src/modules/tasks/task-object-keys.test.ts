import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { attachmentKind, isLinkAttachmentKey, isTaskUploadKey, isTaskOwnObjectKey } from './task-object-keys'

/**
 * Which storage keys belong to a task. See the module header for why this is a
 * shape match rather than a prefix match: `getObjectUrl` in public-CDN mode
 * returns `${publicUrl}/${key}` unencoded, and a browser collapses `..`.
 */

const WS = '11111111-1111-1111-1111-111111111111'
const OTHER_WS = '22222222-2222-2222-2222-222222222222'
const TASK = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const OTHER_TASK = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const upload = (ws: string, task: string, name: string) => `workspaces/${ws}/tasks/${task}/attachments/${name}`

describe('isTaskUploadKey — what addAttachment may register', () => {
  it('accepts exactly the key the presign route mints', () => {
    assert.equal(isTaskUploadKey(upload(WS, TASK, '1790000000000-report.final.pdf'), WS, TASK), true)
  })

  it('accepts a name with dots inside it — the sanitiser keeps them', () => {
    assert.equal(isTaskUploadKey(upload(WS, TASK, '1790000000000-a..b.png'), WS, TASK), true)
  })

  it("refuses another workspace's upload", () => {
    assert.equal(isTaskUploadKey(upload(OTHER_WS, TASK, '1-x.png'), WS, TASK), false)
  })

  it("refuses another task's upload in the same workspace", () => {
    assert.equal(isTaskUploadKey(upload(WS, OTHER_TASK, '1-x.png'), WS, TASK), false)
  })

  it('refuses a traversal that passes a startsWith check — the bypass this module exists for', () => {
    const traversal = `${upload(WS, TASK, '')}../../../../workspaces/${OTHER_WS}/tasks/${OTHER_TASK}/attachments/secret.pdf`
    assert.equal(traversal.startsWith(`workspaces/${WS}/tasks/${TASK}/attachments/`), true, 'the fixture must pass the old check')
    assert.equal(isTaskUploadKey(traversal, WS, TASK), false)
  })

  it('refuses a percent-encoded traversal', () => {
    assert.equal(isTaskUploadKey(upload(WS, TASK, '%2e%2e%2fsecret'), WS, TASK), false)
  })

  it('refuses a bare dot segment and an empty name', () => {
    assert.equal(isTaskUploadKey(upload(WS, TASK, '..'), WS, TASK), false)
    assert.equal(isTaskUploadKey(upload(WS, TASK, '.'), WS, TASK), false)
    assert.equal(isTaskUploadKey(upload(WS, TASK, ''), WS, TASK), false)
  })

  it('refuses a backslash, which some stores treat as a separator', () => {
    assert.equal(isTaskUploadKey(upload(WS, TASK, 'a\\..\\b'), WS, TASK), false)
  })

  it('refuses an inbound-email key — addAttachment registers uploads only', () => {
    assert.equal(isTaskUploadKey(`inbound-email/${TASK}/1-mail.png`, WS, TASK), false)
  })

  it('refuses anything that is not a string', () => {
    assert.equal(isTaskUploadKey(null, WS, TASK), false)
    assert.equal(isTaskUploadKey(undefined, WS, TASK), false)
    assert.equal(isTaskUploadKey({ toString: () => upload(WS, TASK, '1-x') }, WS, TASK), false)
  })
})

describe('isTaskOwnObjectKey — what a cover may point at', () => {
  it('accepts an upload of this task in this workspace', () => {
    assert.equal(isTaskOwnObjectKey(upload(WS, TASK, '1-cover.png'), TASK, WS), true)
  })

  it('accepts an inbound-email attachment of this task — the Attachments tab offers those too', () => {
    assert.equal(isTaskOwnObjectKey(`inbound-email/${TASK}/1790000000000-photo.jpg`, TASK, WS), true)
  })

  it("refuses another task's inbound-email attachment", () => {
    assert.equal(isTaskOwnObjectKey(`inbound-email/${OTHER_TASK}/1-photo.jpg`, TASK, WS), false)
  })

  it("refuses another workspace's object when the workspace is known — the write-time check", () => {
    assert.equal(isTaskOwnObjectKey(upload(OTHER_WS, TASK, '1-x.png'), TASK, WS), false)
  })

  it('binds on the task id alone when the workspace is not known — the sign-time check', () => {
    assert.equal(isTaskOwnObjectKey(upload(WS, TASK, '1-x.png'), TASK), true)
    assert.equal(isTaskOwnObjectKey(upload(WS, OTHER_TASK, '1-x.png'), TASK), false)
  })

  it('refuses a traversal in either shape', () => {
    assert.equal(isTaskOwnObjectKey(`${upload(WS, TASK, '')}../../x`, TASK, WS), false)
    assert.equal(isTaskOwnObjectKey(`inbound-email/${TASK}/../${OTHER_TASK}/x`, TASK, WS), false)
  })

  it('refuses a key with extra path segments after attachments/', () => {
    assert.equal(isTaskOwnObjectKey(`${upload(WS, TASK, 'nested')}/deeper.png`, TASK, WS), false)
  })

  it('refuses an http URL — a linked cover is coverImageUrl, not a key', () => {
    assert.equal(isTaskOwnObjectKey('https://example.com/cover.png', TASK, WS), false)
  })
})

describe('isLinkAttachmentKey — a link stored where a key goes', () => {
  it('recognises the http(s) link "attach by link" writes into storage_key', () => {
    assert.equal(isLinkAttachmentKey('https://example.com/spec.pdf'), true)
    assert.equal(isLinkAttachmentKey('http://example.com/spec.pdf'), true)
    assert.equal(isLinkAttachmentKey('HTTPS://EXAMPLE.COM/X'), true)
  })

  it('does not mistake an object key in either shape for a link', () => {
    assert.equal(isLinkAttachmentKey(upload(WS, TASK, '1790000000000-https-notes.txt')), false)
    assert.equal(isLinkAttachmentKey(`inbound-email/${TASK}/1-photo.jpg`), false)
  })

  it('and a key that merely CONTAINS a scheme is still a key', () => {
    assert.equal(isLinkAttachmentKey(`workspaces/${WS}/https://example.com`), false)
  })

  it('an empty key — a file still arriving — is not a link, and neither is a non-string', () => {
    assert.equal(isLinkAttachmentKey(''), false)
    assert.equal(isLinkAttachmentKey(null), false)
    assert.equal(isLinkAttachmentKey(undefined), false)
  })

  it('refuses other schemes — javascript: and data: are not links this path writes', () => {
    assert.equal(isLinkAttachmentKey('javascript:alert(1)'), false)
    assert.equal(isLinkAttachmentKey('data:text/html,<b>x</b>'), false)
  })
})

describe('attachmentKind — what the API tells a client each row is', () => {
  it('link for a link, file for everything else', () => {
    assert.equal(attachmentKind('https://example.com/a.png'), 'link')
    assert.equal(attachmentKind(upload(WS, TASK, '1-a.png')), 'file')
    assert.equal(attachmentKind(''), 'file')
  })
})
