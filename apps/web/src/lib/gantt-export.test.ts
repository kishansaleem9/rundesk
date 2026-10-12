import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pdfFromJpeg } from './gantt-export'

const latin1 = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join('')

describe('pdfFromJpeg — the Gantt picture as a one-page PDF', () => {
  // Not a real JPEG: the writer copies the bytes and says how many there are.
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 0xff, 0xd9])
  // Written inside each test, not here: a throw in a describe's body fails no test, and the run still exits 0.
  const written = () => {
    const pdf = pdfFromJpeg(jpeg, 800, 400)
    return { pdf, text: latin1(pdf) }
  }

  it('is a PDF from its first byte to its last line', () => {
    const { text } = written()
    assert.ok(text.startsWith('%PDF-1.4\n'))
    assert.ok(text.endsWith('%%EOF\n'))
  })

  it('holds the image as a JPEG of its size, on a page of 0.75 points a pixel', () => {
    const { pdf, text } = written()
    assert.match(text, /\/Subtype \/Image \/Width 800 \/Height 400 .*\/Filter \/DCTDecode \/Length 11 >>/)
    assert.match(text, /\/MediaBox \[0 0 600 300\]/)
    const at = text.indexOf('stream\n', text.indexOf('/DCTDecode')) + 'stream\n'.length
    assert.deepEqual(Array.from(pdf.slice(at, at + jpeg.length)), Array.from(jpeg))
  })

  it('says where each object starts, in bytes, and where the table is', () => {
    const { text } = written()
    const xrefAt = Number(/startxref\n(\d+)\n/.exec(text)?.[1])
    assert.ok(text.slice(xrefAt).startsWith('xref\n0 6\n'))
    const entries = text.slice(xrefAt).split('\n').slice(3, 8)
    entries.forEach((line, i) => {
      const offset = Number(line.slice(0, 10))
      assert.ok(text.slice(offset).startsWith(`${i + 1} 0 obj\n`), `object ${i + 1} is not at ${offset}`)
    })
  })
})
