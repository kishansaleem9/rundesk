import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isExtractableAttachment,
  extractAttachmentText,
  ATTACHMENT_TEXT_CAP,
} from './attachment-text'

/**
 * §15.1 attachment text extraction. Verifies the pure content-type gate and the
 * bytes -> bounded UTF-8 text decode used by the knowledge indexer. Binary
 * formats (pdf/docx/images/zip) are intentionally NOT extractable here.
 */

describe('isExtractableAttachment (§15.1)', () => {
  it('accepts text/* and json/xml (incl. structured suffixes and charset params)', () => {
    for (const t of [
      'text/plain',
      'text/markdown',
      'text/csv',
      'text/html',
      'text/xml',
      'application/json',
      'application/xml',
      'application/ld+json',
      'application/rss+xml',
      'text/plain; charset=utf-8',
      'TEXT/PLAIN',
    ]) {
      assert.equal(isExtractableAttachment(t), true, `${t} should be extractable`)
    }
  })

  it('rejects binary / non-text formats and blank types', () => {
    for (const t of [
      'image/png',
      'image/jpeg',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
      'application/octet-stream',
      'audio/mpeg',
      'video/mp4',
      '',
      '   ',
    ]) {
      assert.equal(isExtractableAttachment(t), false, `${t} should NOT be extractable`)
    }
  })
})

describe('extractAttachmentText (§15.1)', () => {
  it('decodes UTF-8 text for an extractable type', () => {
    const bytes = Buffer.from('The Q3 launch ships on August 15. Owner: Priya.', 'utf8')
    assert.equal(
      extractAttachmentText(bytes, 'text/plain'),
      'The Q3 launch ships on August 15. Owner: Priya.',
    )
  })

  it('returns empty string for a non-extractable (binary) type — never decodes it', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
    assert.equal(extractAttachmentText(png, 'image/png'), '')
  })

  it('returns empty string for empty input', () => {
    assert.equal(extractAttachmentText(Buffer.alloc(0), 'text/plain'), '')
  })

  it('strips a leading UTF-8 BOM', () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hello world', 'utf8')])
    assert.equal(extractAttachmentText(withBom, 'text/plain'), 'hello world')
  })

  it('normalizes CRLF and trims surrounding whitespace while keeping words intact', () => {
    const bytes = Buffer.from('  line one\r\nline two  ', 'utf8')
    assert.equal(extractAttachmentText(bytes, 'text/markdown'), 'line one\nline two')
  })

  it('caps very long text to the char cap', () => {
    const big = 'a'.repeat(ATTACHMENT_TEXT_CAP + 5000)
    const out = extractAttachmentText(Buffer.from(big, 'utf8'), 'text/plain')
    assert.equal(out.length, ATTACHMENT_TEXT_CAP)
  })

  it('accepts a Uint8Array as well as a Buffer', () => {
    const u8 = new TextEncoder().encode('json body')
    assert.equal(extractAttachmentText(u8, 'application/json'), 'json body')
  })
})
