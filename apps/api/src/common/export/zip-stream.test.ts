import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { crc32 } from 'node:zlib'
import { ZipLimitError, crc32Table, zipStream, type ZipEntry } from './zip-stream'

/**
 * THE STREAMING ZIP WRITER, READ BACK BY A REAL READER
 * (`found-30-sep/attachments-have-no-download-all`).
 *
 * A writer checked only by a reader written beside it would agree with itself.
 * So every archive here is written to a file and opened with Info-ZIP's
 * `unzip`: `-Z1` for the names in the central directory's order, `-p` for an
 * entry's bytes, `-t` to test every entry's CRC. It is on this machine and on
 * CI's runners; a machine without it fails here by name rather than skipping,
 * since a skipped reader reads as a pass.
 */

function unzipAvailable(): void {
  try {
    execFileSync('unzip', ['-v'], { stdio: 'ignore' })
  } catch {
    assert.fail('Info-ZIP `unzip` is not on this machine, and these tests read every archive back with it')
  }
}

async function collect(entries: ZipEntry[], options?: { maxBytes?: number }): Promise<Buffer> {
  const parts: Buffer[] = []
  for await (const part of zipStream(entries, options)) parts.push(part)
  return Buffer.concat(parts)
}

/** The archive on disk, and a reader over it, for the length of `read`. */
function withArchive<T>(zip: Buffer, read: (file: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'zip-stream-'))
  try {
    const file = join(dir, 'archive.zip')
    writeFileSync(file, zip)
    return read(file)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const unzip = (args: string[]) => execFileSync('unzip', args, { maxBuffer: 1 << 26 })
const namesIn = (file: string) => unzip(['-Z1', file]).toString('utf8').split('\n').filter(Boolean)
const bytesOf = (file: string, name: string) => unzip(['-p', file, name])
const tested = (file: string) => unzip(['-t', file]).toString('utf8')

/** `size` pseudo-random bytes: the same every run, and nothing deflate can shrink much. */
function noise(size: number, seed = 7): Buffer {
  const out = Buffer.alloc(size)
  let x = seed
  for (let i = 0; i < size; i += 1) {
    x = (x * 1103515245 + 12345) >>> 0
    out[i] = x >>> 24
  }
  return out
}

/** `buf` in chunks of `size`, as a store answers a GET. */
const chunked = (buf: Buffer, size: number) => {
  const parts: Buffer[] = []
  for (let i = 0; i < buf.length; i += size) parts.push(buf.subarray(i, i + size))
  return Readable.from(parts)
}

const TEXT = Buffer.from('Every line of this note is the same line.\n'.repeat(4000))
const PHOTO = noise(300_000)

describe('zipStream — an archive written as it is read', () => {
  it('writes an archive unzip reads back: each entry’s name and bytes, in the order given, every CRC right', async () => {
    unzipAvailable()
    const zip = await collect([
      { name: 'notes.txt', method: 'deflate', open: async () => chunked(TEXT, 777) },
      { name: 'photo.png', method: 'store', open: async () => chunked(PHOTO, 16_384) },
      { name: 'empty.txt', open: async () => Buffer.alloc(0) },
      { name: 'تقرير الربع.txt', method: 'deflate', open: async () => Buffer.from('مرحبا') },
    ])
    withArchive(zip, (file) => {
      assert.deepEqual(namesIn(file), ['notes.txt', 'photo.png', 'empty.txt', 'تقرير الربع.txt'])
      assert.ok(bytesOf(file, 'notes.txt').equals(TEXT), 'notes.txt did not come back byte for byte')
      assert.ok(bytesOf(file, 'photo.png').equals(PHOTO), 'photo.png did not come back byte for byte')
      assert.equal(bytesOf(file, 'empty.txt').length, 0)
      assert.equal(bytesOf(file, 'تقرير الربع.txt').toString('utf8'), 'مرحبا')
      assert.match(tested(file), /No errors detected/, 'unzip -t found an entry whose CRC is not its bytes’')
    })
  })

  it('puts each entry’s CRC and sizes in a data descriptor after its bytes, zeros in its local header', async () => {
    const bodies = [TEXT, PHOTO]
    const zip = await collect([
      { name: 'a.txt', method: 'deflate', open: async () => chunked(TEXT, 4096) },
      { name: 'b.png', method: 'store', open: async () => chunked(PHOTO, 4096) },
    ])
    // The local headers, in order, read from the front of the archive.
    let at = 0
    for (const body of bodies) {
      assert.equal(zip.readUInt32LE(at), 0x04034b50, `no local header at ${at}`)
      const flags = zip.readUInt16LE(at + 6)
      assert.equal(flags & 0x0008, 0x0008, 'bit 3 is not set: the header claims to carry its sizes')
      assert.equal(zip.readUInt32LE(at + 14), 0, 'the local header carries a CRC it could not have known')
      assert.equal(zip.readUInt32LE(at + 18), 0)
      assert.equal(zip.readUInt32LE(at + 22), 0)
      const method = zip.readUInt16LE(at + 8)
      const nameLength = zip.readUInt16LE(at + 26)
      const dataAt = at + 30 + nameLength + zip.readUInt16LE(at + 28)
      // The descriptor is where the central directory says the data ends.
      const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), dataAt)
      let cd = central
      while (zip.readUInt32LE(cd + 42) !== at) cd += 46 + zip.readUInt16LE(cd + 28) + zip.readUInt16LE(cd + 30) + zip.readUInt16LE(cd + 32)
      const compressed = zip.readUInt32LE(cd + 20)
      const descriptorAt = dataAt + compressed
      assert.equal(zip.readUInt32LE(descriptorAt), 0x08074b50, 'no data descriptor follows the entry’s bytes')
      assert.equal(zip.readUInt32LE(descriptorAt + 4), crc32(body), 'the descriptor’s CRC is not the bytes’')
      assert.equal(zip.readUInt32LE(descriptorAt + 8), compressed)
      assert.equal(zip.readUInt32LE(descriptorAt + 12), body.length)
      if (method === 0) assert.equal(compressed, body.length, 'a stored entry’s bytes are not its size')
      at = descriptorAt + 16
    }
  })

  it('stores an entry that asks to be stored and deflates one that asks to be deflated', async () => {
    unzipAvailable()
    const zip = await collect([
      { name: 'photo.png', method: 'store', open: async () => chunked(PHOTO, 8192) },
      { name: 'notes.txt', method: 'deflate', open: async () => chunked(TEXT, 8192) },
    ])
    withArchive(zip, (file) => {
      // zipinfo's short listing: the method is the sixth column, `stor` or `defN`.
      const methods = Object.fromEntries(
        unzip(['-Z', '-s', file])
          .toString('utf8')
          .split('\n')
          .filter((line) => /^-/.test(line))
          .map((line) => {
            const cols = line.trim().split(/\s+/)
            return [cols[cols.length - 1], cols[5]]
          }),
      )
      assert.deepEqual(methods, { 'photo.png': 'stor', 'notes.txt': 'defN' })
      assert.ok(bytesOf(file, 'notes.txt').equals(TEXT))
    })
    assert.ok(zip.length < PHOTO.length + TEXT.length / 4, `the text was not compressed: the archive is ${zip.length} bytes`)
  })

  it('leaves out an entry with nothing to read, and the archive is still whole', async () => {
    unzipAvailable()
    const zip = await collect([
      { name: 'first.txt', open: async () => Buffer.from('first') },
      { name: 'gone.txt', open: async () => null },
      { name: 'last.txt', method: 'deflate', open: async () => Buffer.from('last') },
    ])
    withArchive(zip, (file) => {
      assert.deepEqual(namesIn(file), ['first.txt', 'last.txt'])
      assert.equal(bytesOf(file, 'last.txt').toString(), 'last')
      assert.match(tested(file), /No errors detected/)
    })
  })

  it('stops with a ZipLimitError past its limit, rather than write an archive it cannot finish', async () => {
    for (const method of ['store', 'deflate'] as const) {
      await assert.rejects(
        collect(
          [
            { name: 'a.bin', method, open: async () => chunked(noise(600), 100) },
            { name: 'b.bin', method, open: async () => chunked(noise(600, 9), 100) },
          ],
          { maxBytes: 1000 },
        ),
        (err: unknown) => err instanceof ZipLimitError,
        `a ${method}d archive went past its 1000 bytes without a ZipLimitError`,
      )
    }
  })

  it('lets an entry’s source go when its reader stops early', async () => {
    for (const method of ['store', 'deflate'] as const) {
      const source = chunked(noise(200_000), 1024)
      const archive = zipStream([{ name: 'big.bin', method, open: async () => source }])
      // The local header, then some of the bytes, and then the reader goes away.
      for (let i = 0; i < 3; i += 1) await archive.next()
      await archive.return(undefined)
      // A pipeline passes a destroy on as an event: given a moment, not assumed instant.
      for (let i = 0; i < 50 && !source.destroyed; i += 1) await new Promise((r) => setTimeout(r, 10))
      assert.equal(source.destroyed, true, `a ${method}d entry’s source is still open after its reader stopped`)
    }
  })
})

describe('zip-stream — the CRC-32 that stands in where Node has none (Node 20 before 20.15)', () => {
  it('agrees with zlib.crc32 over a whole buffer and over the same buffer fed in parts', () => {
    const bytes = Buffer.from(Array.from({ length: 70_000 }, (_, i) => (i * 131 + 7) & 0xff))
    assert.equal(crc32Table(bytes), crc32(bytes))
    let parts = 0
    for (let at = 0; at < bytes.length; at += 4096) parts = crc32Table(bytes.subarray(at, at + 4096), parts)
    assert.equal(parts, crc32(bytes))
    assert.equal(crc32Table(Buffer.alloc(0)), 0)
  })
})
