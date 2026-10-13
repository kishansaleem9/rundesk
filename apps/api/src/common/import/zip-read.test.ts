import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { deflateRawSync } from 'node:zlib'
import { isZip, readZip, ZipReadError } from './zip-read'
import { zipOf } from './zip-test-kit'

/**
 * One stored entry, written by hand, so a test can say anything a crafted
 * archive can: its flags, its method, its declared sizes and CRC.
 */
function handmade(opts: { name?: string; data?: Buffer; stored?: Buffer; method?: number; flags?: number; size?: number; crc?: number; zip64?: boolean }): Buffer {
  const name = Buffer.from(opts.name ?? 'a.txt')
  const data = opts.data ?? Buffer.from('hello')
  const stored = opts.stored ?? data
  const method = opts.method ?? 0
  const flags = opts.flags ?? 0
  const crc = opts.crc ?? crc32(data)
  const size = opts.size ?? data.length
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(flags, 6)
  local.writeUInt16LE(method, 8)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(stored.length, 18)
  local.writeUInt32LE(size, 22)
  local.writeUInt16LE(name.length, 26)
  const extra = opts.zip64 ? Buffer.alloc(4 + 24) : Buffer.alloc(0)
  if (opts.zip64) {
    extra.writeUInt16LE(0x0001, 0)
    extra.writeUInt16LE(24, 2)
    extra.writeUInt32LE(size, 4)
    extra.writeUInt32LE(stored.length, 12)
    extra.writeUInt32LE(0, 20)
  }
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(flags, 8)
  central.writeUInt16LE(method, 10)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(opts.zip64 ? 0xffffffff : stored.length, 20)
  central.writeUInt32LE(opts.zip64 ? 0xffffffff : size, 24)
  central.writeUInt16LE(name.length, 28)
  central.writeUInt16LE(extra.length, 30)
  central.writeUInt32LE(opts.zip64 ? 0xffffffff : 0, 42)
  const cdOffset = local.length + name.length + stored.length
  const cd = Buffer.concat([central, name, extra])
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(cdOffset, 16)
  return Buffer.concat([local, name, stored, cd, end])
}

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (const b of data) {
    c ^= b
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}

describe('readZip — an archive read back through its central directory', () => {
  it('reads every file the writer wrote, stored or deflated, by name, and leaves folders out', async () => {
    for (const method of ['store', 'deflate'] as const) {
      const zip = await zipOf({ 'xl/workbook.xml': '<workbook/>', 'docs/ünïcode — name.txt': 'words', 'empty.txt': '' }, method)
      const entries = readZip(zip)
      assert.deepEqual([...entries.keys()].sort(), ['docs/ünïcode — name.txt', 'empty.txt', 'xl/workbook.xml'])
      assert.equal(entries.get('xl/workbook.xml')!.text(), '<workbook/>')
      assert.equal(entries.get('docs/ünïcode — name.txt')!.read().toString(), 'words')
      assert.equal(entries.get('empty.txt')!.size, 0)
    }
  })

  it('a text part loses the byte-order mark Windows tools put in front of UTF-8', async () => {
    const zip = await zipOf({ 'a.json': Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('[1]')]) })
    assert.equal(readZip(zip).get('a.json')!.text(), '[1]')
  })

  it('is a zip by its first bytes: a local header or an empty archive’s end, and nothing else', async () => {
    assert.equal(isZip(await zipOf({ a: 'b' })), true)
    assert.equal(isZip(Buffer.from([0x50, 0x4b, 0x05, 0x06])), true)
    assert.equal(isZip(Buffer.from('PK,Name\n')), false)
    assert.throws(() => readZip(Buffer.from('Title,Status\n')), ZipReadError)
  })

  it('refuses what it cannot read in words, not misread bytes: encrypted, another method, cut short', () => {
    assert.throws(() => readZip(handmade({ flags: 1 })), /encrypted/)
    assert.throws(() => readZip(handmade({ method: 12 })), /method 12/)
    const whole = handmade({})
    assert.throws(() => readZip(whole.subarray(0, whole.length - 10)), /central directory|cut short|damaged/)
  })

  it('checks what comes out: a wrong CRC, and a size that does not match, are refused', () => {
    assert.throws(() => readZip(handmade({ crc: 1234 })).get('a.txt')!.read(), /checksum/)
    const data = Buffer.from('a longer text than it says')
    assert.throws(() => readZip(handmade({ data, size: 4, crc: crc32(data) })).get('a.txt')!.read(), /bytes where the archive says|larger than it says/)
  })

  it('a zip bomb — a small declared size that inflates to far more — is stopped at its declared size', () => {
    const data = Buffer.alloc(5 * 1024 * 1024, 0x61)
    const stored = deflateRawSync(data)
    const zip = handmade({ data: Buffer.from('aaaa'), stored, method: 8, size: 4, crc: crc32(data) })
    // Refused WHILE inflating — the five megabytes are never made — not counted afterwards.
    assert.throws(() => readZip(zip).get('a.txt')!.read(), (e: unknown) => e instanceof ZipReadError && /could not be inflated/.test(e.message))
  })

  it('refuses an entry, or an archive, larger than the caller’s limits, before inflating anything', async () => {
    const zip = await zipOf({ 'big.txt': 'x'.repeat(2000), 'b.txt': 'y'.repeat(2000) })
    assert.throws(() => readZip(zip, { maxEntryBytes: 1000 }), /at most 1000 are read from one file/)
    assert.throws(() => readZip(zip, { maxTotalBytes: 3000 }), /more than 3000 bytes/)
    assert.throws(() => readZip(zip, { maxEntries: 1 }), /holds 2 files; at most 1/)
  })

  it('reads an entry whose sizes are in its Zip64 field', () => {
    const entries = readZip(handmade({ zip64: true, data: Buffer.from('sixty-four') }))
    assert.equal(entries.get('a.txt')!.text(), 'sixty-four')
  })
})
