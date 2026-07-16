/**
 * Dependency-free QR Code generator (byte mode only).
 *
 * Adapted from Nayuki's "QR Code generator library" (MIT License), trimmed to
 * the single byte-mode segment path — which is all we need to encode an
 * `otpauth://` TOTP setup URI into a scannable matrix entirely on the client.
 * The backend no longer returns a pre-rendered QR image, so the security /
 * 2FA-setup UI renders one from the `otpauthUrl` locally.
 *
 * Public API:
 *   encodeQr(text, ecc?) -> boolean[][]   // row-major, true = dark module
 *
 * The returned matrix has NO quiet zone; callers add their own border.
 */

export type QrEcc = 'L' | 'M' | 'Q' | 'H'

// Error-correction levels: table row (ordinal) + 2-bit format field value.
const ECC = {
  L: { ordinal: 0, formatBits: 1 },
  M: { ordinal: 1, formatBits: 0 },
  Q: { ordinal: 2, formatBits: 3 },
  H: { ordinal: 3, formatBits: 2 },
} as const

const MIN_VERSION = 1
const MAX_VERSION = 40

// Number of error-correction codewords per block, indexed [eccOrdinal][version].
const ECC_CODEWORDS_PER_BLOCK: number[][] = [
  // Version: 0 is a placeholder; real versions are 1..40.
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // L
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], // M
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // Q
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // H
]

// Number of error-correction blocks, indexed [eccOrdinal][version].
const NUM_ERROR_CORRECTION_BLOCKS: number[][] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25], // L
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49], // M
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68], // Q
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81], // H
]

const PENALTY_N1 = 3
const PENALTY_N2 = 3
const PENALTY_N3 = 40
const PENALTY_N4 = 10

function getBit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0
}

// Total number of data-region modules (data + ECC), in bits, before dividing
// out the function patterns — used to derive capacity.
function getNumRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2
    result -= (25 * numAlign - 10) * numAlign - 55
    if (ver >= 7) result -= 36
  }
  return result
}

function getNumDataCodewords(ver: number, eccOrdinal: number): number {
  return (
    Math.floor(getNumRawDataModules(ver) / 8) -
    ECC_CODEWORDS_PER_BLOCK[eccOrdinal][ver] * NUM_ERROR_CORRECTION_BLOCKS[eccOrdinal][ver]
  )
}

// ── Reed–Solomon over GF(256) with primitive modulus 0x11D ──────────────────

function reedSolomonMultiply(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}

function reedSolomonComputeDivisor(degree: number): number[] {
  const result: number[] = []
  for (let i = 0; i < degree - 1; i++) result.push(0)
  result.push(1) // Monic: leading coefficient is 1.
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = reedSolomonMultiply(result[j], root)
      if (j + 1 < result.length) result[j] ^= result[j + 1]
    }
    root = reedSolomonMultiply(root, 0x02)
  }
  return result
}

function reedSolomonComputeRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0)
  for (const b of data) {
    const factor = b ^ result.shift()!
    result.push(0)
    for (let i = 0; i < result.length; i++) {
      result[i] ^= reedSolomonMultiply(divisor[i], factor)
    }
  }
  return result
}

// ── Byte-mode segment + version selection ───────────────────────────────────

function utf8Bytes(text: string): number[] {
  // encodeURIComponent gives us UTF-8 percent-encoding we can unpack to bytes,
  // avoiding a TextEncoder dependency and keeping the module SSR-safe.
  const out: number[] = []
  const encoded = encodeURIComponent(text)
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === '%') {
      out.push(parseInt(encoded.substr(i + 1, 2), 16))
      i += 2
    } else {
      out.push(encoded.charCodeAt(i))
    }
  }
  return out
}

// Character-count indicator width for byte mode at a given version.
function byteModeCountBits(ver: number): number {
  return ver <= 9 ? 8 : 16
}

// ── Bit buffer ──────────────────────────────────────────────────────────────

class BitBuffer {
  readonly bits: number[] = []
  appendBits(val: number, len: number): void {
    for (let i = len - 1; i >= 0; i--) this.bits.push((val >>> i) & 1)
  }
}

// ── Matrix drawing ──────────────────────────────────────────────────────────

class QrDraw {
  readonly size: number
  readonly modules: boolean[][]
  private readonly isFunction: boolean[][]

  constructor(
    private readonly version: number,
    private readonly eccFormatBits: number,
    dataCodewords: number[],
  ) {
    this.size = version * 4 + 17
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false))
    this.isFunction = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false))

    this.drawFunctionPatterns()
    const allCodewords = this.addEccAndInterleave(dataCodewords)
    this.drawCodewords(allCodewords)

    // Pick the mask with the lowest penalty (best scan robustness).
    let mask = 0
    let minPenalty = Infinity
    for (let i = 0; i < 8; i++) {
      this.applyMask(i)
      this.drawFormatBits(i)
      const penalty = this.getPenaltyScore()
      if (penalty < minPenalty) {
        mask = i
        minPenalty = penalty
      }
      this.applyMask(i) // Undo (XOR is its own inverse).
    }
    this.applyMask(mask)
    this.drawFormatBits(mask)
  }

  private setFunctionModule(x: number, y: number, isDark: boolean): void {
    this.modules[y][x] = isDark
    this.isFunction[y][x] = true
  }

  private drawFunctionPatterns(): void {
    // Timing patterns.
    for (let i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0)
      this.setFunctionModule(i, 6, i % 2 === 0)
    }
    // Finder patterns (+ their separators via the 4-module radius).
    this.drawFinderPattern(3, 3)
    this.drawFinderPattern(this.size - 4, 3)
    this.drawFinderPattern(3, this.size - 4)

    // Alignment patterns.
    const alignPos = this.getAlignmentPatternPositions()
    const numAlign = alignPos.length
    for (let i = 0; i < numAlign; i++) {
      for (let j = 0; j < numAlign; j++) {
        if (
          !(
            (i === 0 && j === 0) ||
            (i === 0 && j === numAlign - 1) ||
            (i === numAlign - 1 && j === 0)
          )
        ) {
          this.drawAlignmentPattern(alignPos[i], alignPos[j])
        }
      }
    }

    // Format + version info (placeholder mask/data; real bits drawn later).
    this.drawFormatBits(0)
    this.drawVersion()
  }

  private drawFinderPattern(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy)) // Chebyshev distance
        const xx = x + dx
        const yy = y + dy
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4)
        }
      }
    }
  }

  private drawAlignmentPattern(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
      }
    }
  }

  private drawFormatBits(mask: number): void {
    const data = (this.eccFormatBits << 3) | mask // 5 bits
    let rem = data
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const bits = ((data << 10) | rem) ^ 0x5412 // 15 bits, uint

    // First copy — around the top-left finder.
    for (let i = 0; i <= 5; i++) this.setFunctionModule(8, i, getBit(bits, i))
    this.setFunctionModule(8, 7, getBit(bits, 6))
    this.setFunctionModule(8, 8, getBit(bits, 7))
    this.setFunctionModule(7, 8, getBit(bits, 8))
    for (let i = 9; i < 15; i++) this.setFunctionModule(14 - i, 8, getBit(bits, i))

    // Second copy — split across the top-right / bottom-left finders.
    for (let i = 0; i < 8; i++) this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i))
    for (let i = 8; i < 15; i++) this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i))
    this.setFunctionModule(8, this.size - 8, true) // Always dark.
  }

  private drawVersion(): void {
    if (this.version < 7) return
    let rem = this.version
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const bits = (this.version << 12) | rem // 18 bits
    for (let i = 0; i < 18; i++) {
      const bit = getBit(bits, i)
      const a = this.size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      this.setFunctionModule(a, b, bit)
      this.setFunctionModule(b, a, bit)
    }
  }

  private getAlignmentPatternPositions(): number[] {
    if (this.version === 1) return []
    const numAlign = Math.floor(this.version / 7) + 2
    const step =
      this.version === 32 ? 26 : Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2
    const result: number[] = [6]
    for (let pos = this.size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos)
    return result
  }

  private addEccAndInterleave(data: number[]): number[] {
    const ver = this.version
    const eccOrdinal = eccOrdinalFromFormatBits(this.eccFormatBits)
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[eccOrdinal][ver]
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK[eccOrdinal][ver]
    const rawCodewords = Math.floor(getNumRawDataModules(ver) / 8)
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks)
    const shortBlockDataLen = Math.floor(rawCodewords / numBlocks) - blockEccLen

    // Split data into blocks and append the RS remainder to each.
    const blocks: number[][] = []
    const rsDiv = reedSolomonComputeDivisor(blockEccLen)
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const datLen = shortBlockDataLen + (i < numShortBlocks ? 0 : 1)
      const dat = data.slice(k, k + datLen)
      k += datLen
      const ecc = reedSolomonComputeRemainder(dat, rsDiv)
      if (i < numShortBlocks) dat.push(0) // Pad short blocks so columns align.
      blocks.push(dat.concat(ecc))
    }

    // Interleave the bytes column-by-column, skipping the short-block padding.
    const result: number[] = []
    for (let i = 0; i < blocks[0].length; i++) {
      for (let j = 0; j < blocks.length; j++) {
        if (i !== shortBlockDataLen || j >= numShortBlocks) result.push(blocks[j][i])
      }
    }
    return result
  }

  private drawCodewords(data: number[]): void {
    let i = 0 // Bit index into data.
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5 // Skip the vertical timing column.
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j
          const upward = ((right + 1) & 2) === 0
          const y = upward ? this.size - 1 - vert : vert
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7))
            i++
          }
        }
      }
    }
  }

  private applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let invert = false
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break
          case 1: invert = y % 2 === 0; break
          case 2: invert = x % 3 === 0; break
          case 3: invert = (x + y) % 3 === 0; break
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break
          case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break
        }
        if (!this.isFunction[y][x] && invert) this.modules[y][x] = !this.modules[y][x]
      }
    }
  }

  private getPenaltyScore(): number {
    let result = 0
    const size = this.size
    const mod = this.modules

    // Rule 1 (rows) + finder-like patterns.
    for (let y = 0; y < size; y++) {
      let runColor = false
      let runX = 0
      const runHistory = [0, 0, 0, 0, 0, 0, 0]
      for (let x = 0; x < size; x++) {
        if (mod[y][x] === runColor) {
          runX++
          if (runX === 5) result += PENALTY_N1
          else if (runX > 5) result++
        } else {
          this.finderPenaltyAddHistory(runX, runHistory)
          if (!runColor) result += this.finderPenaltyCountPatterns(runHistory) * PENALTY_N3
          runColor = mod[y][x]
          runX = 1
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runX, runHistory) * PENALTY_N3
    }
    // Rule 1 (columns) + finder-like patterns.
    for (let x = 0; x < size; x++) {
      let runColor = false
      let runY = 0
      const runHistory = [0, 0, 0, 0, 0, 0, 0]
      for (let y = 0; y < size; y++) {
        if (mod[y][x] === runColor) {
          runY++
          if (runY === 5) result += PENALTY_N1
          else if (runY > 5) result++
        } else {
          this.finderPenaltyAddHistory(runY, runHistory)
          if (!runColor) result += this.finderPenaltyCountPatterns(runHistory) * PENALTY_N3
          runColor = mod[y][x]
          runY = 1
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runY, runHistory) * PENALTY_N3
    }

    // Rule 2 — 2x2 blocks of one color.
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = mod[y][x]
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) result += PENALTY_N2
      }
    }

    // Rule 4 — balance of dark modules.
    let dark = 0
    for (const row of mod) for (const c of row) if (c) dark++
    const total = size * size
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1
    result += k * PENALTY_N4
    return result
  }

  private finderPenaltyCountPatterns(runHistory: number[]): number {
    const n = runHistory[1]
    const core =
      n > 0 &&
      runHistory[2] === n &&
      runHistory[3] === n * 3 &&
      runHistory[4] === n &&
      runHistory[5] === n
    return (
      (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0) +
      (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0)
    )
  }

  private finderPenaltyTerminateAndCount(
    currentRunColor: boolean,
    currentRunLength: number,
    runHistory: number[],
  ): number {
    if (currentRunColor) {
      this.finderPenaltyAddHistory(currentRunLength, runHistory)
      currentRunLength = 0
    }
    currentRunLength += this.size // Light border after the last run.
    this.finderPenaltyAddHistory(currentRunLength, runHistory)
    return this.finderPenaltyCountPatterns(runHistory)
  }

  private finderPenaltyAddHistory(currentRunLength: number, runHistory: number[]): void {
    if (runHistory[0] === 0) currentRunLength += this.size // Light border before the first run.
    runHistory.pop()
    runHistory.unshift(currentRunLength)
  }
}

function eccOrdinalFromFormatBits(formatBits: number): number {
  switch (formatBits) {
    case 1: return 0 // L
    case 0: return 1 // M
    case 3: return 2 // Q
    case 2: return 3 // H
    default: return 1
  }
}

/**
 * Encode `text` as a QR Code and return its module matrix (row-major, no quiet
 * zone). `true` = dark module. Throws only if the text is too long for the
 * largest QR version at the requested error-correction level.
 */
export function encodeQr(text: string, ecc: QrEcc = 'M'): boolean[][] {
  const eccInfo = ECC[ecc]
  const dataBytes = utf8Bytes(text)

  // Pick the smallest version whose data capacity fits mode + count + payload.
  let version = MIN_VERSION
  for (; ; version++) {
    if (version > MAX_VERSION) {
      throw new Error('Data too long to encode as a QR Code')
    }
    const capacityBits = getNumDataCodewords(version, eccInfo.ordinal) * 8
    const usedBits = 4 + byteModeCountBits(version) + dataBytes.length * 8
    if (usedBits <= capacityBits) break
  }

  const capacityBits = getNumDataCodewords(version, eccInfo.ordinal) * 8
  const bb = new BitBuffer()
  bb.appendBits(0x4, 4) // Byte-mode indicator.
  bb.appendBits(dataBytes.length, byteModeCountBits(version))
  for (const b of dataBytes) bb.appendBits(b, 8)

  // Terminator + bit padding to a byte boundary.
  bb.appendBits(0, Math.min(4, capacityBits - bb.bits.length))
  bb.appendBits(0, (8 - (bb.bits.length % 8)) % 8)

  // Byte padding with the fixed alternating pattern.
  for (let pad = 0xec; bb.bits.length < capacityBits; pad ^= 0xec ^ 0x11) {
    bb.appendBits(pad, 8)
  }

  // Pack bits into codeword bytes.
  const dataCodewords: number[] = new Array(bb.bits.length >>> 3).fill(0)
  bb.bits.forEach((bit, i) => {
    if (bit) dataCodewords[i >>> 3] |= 0x80 >>> (i & 7)
  })

  const qr = new QrDraw(version, eccInfo.formatBits, dataCodewords)
  return qr.modules
}
