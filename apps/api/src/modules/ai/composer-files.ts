import { HttpException, HttpStatus } from '@nestjs/common'
import type Anthropic from '@anthropic-ai/sdk'
import { readSheetFile } from '../integrations/clickup-import/sheet-file'
import { docxToDoc } from '../docs/docx-tiptap'
import { htmlToText } from '../email-accounts/mail-message'
import { decodeText } from '../../common/import/text-decode'

/**
 * FILES GIVEN TO BRAIN FROM THE COMPOSER'S "+" (`ledger-rows/row-853`), as
 * ClickUp's Brain takes them: images, PDFs, sheets, Docs. Images and PDFs go to
 * the model as they are — it reads both — and the rest as their text: a sheet
 * row by row, a Word document's words, a text file as written. A file of any
 * other kind is refused by name, never passed on as noise.
 */
export const COMPOSER_FILE_LIMITS = { files: 5, bytes: 5 * 1024 * 1024, text: 40_000 } as const

export type ComposerFile = { name?: unknown; type?: unknown; data?: unknown }
export type ReadComposerFile =
  | { kind: 'text'; name: string; text: string }
  | { kind: 'image'; name: string; mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'; data: string }
  | { kind: 'pdf'; name: string; data: string }

const refuse = (why: string) => new HttpException(why, HttpStatus.BAD_REQUEST)

function imageType(bytes: Buffer): 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes.subarray(1, 4).toString('latin1') === 'PNG') return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 6 && bytes.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif'
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  return null
}

function docText(node: unknown): string {
  const n = node as { type?: string; text?: string; content?: unknown[] }
  if (!n || typeof n !== 'object') return ''
  if (typeof n.text === 'string') return n.text
  const inner = (n.content ?? []).map(docText)
  const block = ['paragraph', 'heading', 'listItem', 'tableRow', 'blockquote', 'codeBlock'].includes(n.type ?? '')
  return inner.join(n.type === 'tableRow' ? '\t' : '') + (block ? '\n' : '')
}

const capped = (text: string) => (text.length > COMPOSER_FILE_LIMITS.text ? `${text.slice(0, COMPOSER_FILE_LIMITS.text)}\n…(cut at ${COMPOSER_FILE_LIMITS.text} characters)` : text)

export function readComposerFile(f: ComposerFile): ReadComposerFile {
  const name = typeof f.name === 'string' && f.name.trim() ? f.name.trim().slice(0, 200) : ''
  if (!name) throw refuse('A file needs its name')
  if (typeof f.data !== 'string' || !f.data) throw refuse(`“${name}” is empty`)
  const bytes = Buffer.from(f.data, 'base64')
  if (!bytes.length) throw refuse(`“${name}” is empty`)
  if (bytes.length > COMPOSER_FILE_LIMITS.bytes) throw refuse(`“${name}” is larger than ${COMPOSER_FILE_LIMITS.bytes / 1024 / 1024} MB`)
  const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase()

  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
    const mediaType = imageType(bytes)
    if (!mediaType) throw refuse(`“${name}” is not an image`)
    return { kind: 'image', name, mediaType, data: bytes.toString('base64') }
  }
  if (ext === 'pdf') {
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw refuse(`“${name}” is not a PDF`)
    return { kind: 'pdf', name, data: bytes.toString('base64') }
  }
  if (['xlsx', 'xls', 'csv', 'tsv'].includes(ext)) {
    try {
      const table = readSheetFile(bytes, name)
      const lines = [table.headers.join('\t'), ...table.rows.map((r) => r.cells.join('\t'))]
      return { kind: 'text', name, text: capped(lines.join('\n')) }
    } catch (err) {
      throw refuse(`“${name}” could not be read as a sheet${err instanceof Error && err.message ? ` — ${err.message}` : ''}`)
    }
  }
  if (ext === 'docx') {
    try {
      return { kind: 'text', name, text: capped(docText(docxToDoc(bytes, name).content).trim()) }
    } catch (err) {
      throw refuse(`“${name}” could not be read as a Word document${err instanceof Error && err.message ? ` — ${err.message}` : ''}`)
    }
  }
  if (['txt', 'md', 'markdown', 'json', 'xml', 'html', 'htm'].includes(ext)) {
    const text = decodeText(bytes)
    if (text.includes('\u0000')) throw refuse(`“${name}” is not text`)
    return { kind: 'text', name, text: capped(ext === 'html' || ext === 'htm' ? htmlToText(text) : text) }
  }
  throw refuse(`Brain reads images, PDFs, sheets, Word documents and text files — not “${name}”`)
}

/** The turn's files, each read or refused by name; at most five. */
export function readComposerFiles(files: unknown): ReadComposerFile[] {
  if (files == null) return []
  if (!Array.isArray(files)) throw refuse('files is a list of files')
  if (files.length > COMPOSER_FILE_LIMITS.files) throw refuse(`Brain takes at most ${COMPOSER_FILE_LIMITS.files} files at once`)
  return files.map((f) => readComposerFile((f ?? {}) as ComposerFile))
}

/**
 * The turn with its files in it: the last question carries the images and PDFs
 * as the blocks the model reads them from, and the other files' text after the
 * question, each under its name — so the answer can say which file it read.
 */
export function withComposerFiles(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  files: ReadComposerFile[],
): Anthropic.Messages.MessageParam[] {
  const out: Anthropic.Messages.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }))
  if (!files.length) return out
  let last = -1
  for (let i = out.length - 1; i >= 0; i--) if (out[i].role === 'user') { last = i; break }
  if (last === -1) return out
  const question = typeof out[last].content === 'string' ? (out[last].content as string) : ''
  const texts = files.filter((f): f is Extract<ReadComposerFile, { kind: 'text' }> => f.kind === 'text')
  const blocks: Anthropic.Messages.ContentBlockParam[] = []
  for (const f of files) {
    if (f.kind === 'image') blocks.push({ type: 'image', source: { type: 'base64', media_type: f.mediaType, data: f.data } })
    if (f.kind === 'pdf') blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data }, title: f.name })
  }
  const named = files.filter((f) => f.kind !== 'text').map((f) => `“${f.name}”`)
  const text = [
    question,
    named.length ? `(Attached: ${named.join(', ')}.)` : '',
    ...texts.map((f) => `The file “${f.name}”:\n${f.text}`),
  ]
    .filter(Boolean)
    .join('\n\n')
  out[last] = { role: 'user', content: [...blocks, { type: 'text', text }] }
  return out
}
