/**
 * THE GANTT VIEW AS A PICTURE, AS CLICKUP EXPORTS IT (`resume-defects/resume-5`).
 *
 * ClickUp's Gantt view exports as a PDF or a PNG from its view settings, on
 * the Business plan and above (changelog, "Improved Gantt view export"; read
 * through search excerpts, 12 October). The picture is drawn here from what
 * the chart plots — its rows, their bars, the dependency lines, the critical
 * path and slack when they are shown — rather than copied off the page, so a
 * row scrolled out of sight is still in the file, and nothing on the page that
 * is not the chart is.
 *
 * The PDF is the same picture as a JPEG on one page: PDF reads a JPEG as it is
 * (`/DCTDecode`), so no library is needed to write one.
 */

export type ExportRow =
  | { kind: 'group'; title: string }
  | {
      kind: 'task'
      id: string
      title: string
      /** Whole days from the chart's first day. */
      startDay: number
      endDay: number
      isMilestone: boolean
      critical: boolean
      slackDays: number
      faded: boolean
    }

export type ExportPicture = {
  title: string
  rows: ExportRow[]
  /** The chart's first day, a local midnight, and how many days it spans. */
  startMs: number
  days: number
  links: Array<{ blocker: string; blocked: string; critical: boolean }>
  showCritical: boolean
  showSlack: boolean
  /** A label for a day, as the chart's header draws it. */
  dayLabel: (ms: number) => string
}

const NAME_W = 260
const TITLE_H = 36
const HEADER_H = 30
const ROW_H = 30
const GROUP_H = 26
/** The widest picture written: past it, the days are drawn narrower. */
const MAX_W = 6000

/** The day `n` calendar days after a local midnight. */
function dayAfter(ms: number, n: number): number {
  const d = new Date(ms)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

/** Draws the picture onto a new canvas. */
export function drawGanttPicture(p: ExportPicture, doc: Document = document): HTMLCanvasElement {
  const dayPx = Math.max(2, Math.min(28, (MAX_W - NAME_W) / Math.max(1, p.days)))
  const width = Math.round(NAME_W + p.days * dayPx)
  const bodyH = p.rows.reduce((h, r) => h + (r.kind === 'group' ? GROUP_H : ROW_H), 0)
  const height = TITLE_H + HEADER_H + bodyH
  const canvas = doc.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.textBaseline = 'middle'
  ctx.font = '600 15px system-ui, sans-serif'
  ctx.fillStyle = '#111827'
  ctx.fillText(p.title, 12, TITLE_H / 2)

  // The header: a label every week, or every few where a week is narrow.
  ctx.font = '11px system-ui, sans-serif'
  ctx.fillStyle = '#6b7280'
  const step = Math.max(1, Math.ceil(70 / (7 * dayPx))) * 7
  for (let i = 0; i < p.days; i += step) {
    const x = NAME_W + i * dayPx
    ctx.fillText(p.dayLabel(dayAfter(p.startMs, i)), x + 4, TITLE_H + HEADER_H / 2)
    ctx.fillStyle = '#e5e7eb'
    ctx.fillRect(x, TITLE_H, 1, HEADER_H + bodyH)
    ctx.fillStyle = '#6b7280'
  }
  ctx.fillStyle = '#d1d5db'
  ctx.fillRect(0, TITLE_H + HEADER_H - 1, width, 1)
  ctx.fillRect(NAME_W - 1, TITLE_H, 1, HEADER_H + bodyH)

  // The rows, and where each bar is, for the lines between them.
  const at = new Map<string, { x0: number; x1: number; y: number }>()
  let y = TITLE_H + HEADER_H
  for (const row of p.rows) {
    if (row.kind === 'group') {
      ctx.fillStyle = '#f3f4f6'
      ctx.fillRect(0, y, width, GROUP_H)
      ctx.fillStyle = '#374151'
      ctx.font = '600 12px system-ui, sans-serif'
      ctx.fillText(row.title, 10, y + GROUP_H / 2)
      y += GROUP_H
      continue
    }
    ctx.fillStyle = '#111827'
    ctx.font = '12px system-ui, sans-serif'
    ctx.fillText(row.title.length > 34 ? `${row.title.slice(0, 33)}…` : row.title, 12, y + ROW_H / 2)
    const x0 = NAME_W + row.startDay * dayPx
    const x1 = NAME_W + (row.endDay + 1) * dayPx
    const barY = y + 7
    if (p.showSlack && row.slackDays > 0) {
      ctx.fillStyle = 'rgba(99, 102, 241, 0.18)'
      ctx.fillRect(x1, barY, row.slackDays * dayPx, ROW_H - 14)
    }
    ctx.fillStyle = p.showCritical && row.critical ? '#ef4444' : row.isMilestone ? '#f59e0b' : '#4f46e5'
    ctx.globalAlpha = row.faded ? 0.5 : 1
    ctx.fillRect(x0, barY, Math.max(6, x1 - x0), ROW_H - 14)
    ctx.globalAlpha = 1
    at.set(row.id, { x0, x1, y: y + ROW_H / 2 })
    ctx.fillStyle = '#f3f4f6'
    ctx.fillRect(0, y + ROW_H - 1, width, 1)
    y += ROW_H
  }

  for (const link of p.links) {
    const from = at.get(link.blocker)
    const to = at.get(link.blocked)
    if (!from || !to) continue
    const mid = Math.max(from.x1 + 6, to.x0 - 6)
    ctx.strokeStyle = p.showCritical && link.critical ? '#ef4444' : '#9ca3af'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(from.x1, from.y)
    ctx.lineTo(mid, from.y)
    ctx.lineTo(mid, to.y)
    ctx.lineTo(to.x0, to.y)
    ctx.stroke()
  }
  return canvas
}

/** The picture as a PNG. */
export function pngFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('the picture could not be written'))), 'image/png'),
  )
}

/** The picture as a one-page PDF. */
export function pdfFromCanvas(canvas: HTMLCanvasElement): Blob {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
  const jpeg = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0))
  return new Blob([pdfFromJpeg(jpeg, canvas.width, canvas.height)], { type: 'application/pdf' })
}

/**
 * A one-page PDF holding a JPEG at 96 pixels to the inch (`0.75` points a
 * pixel). Written by hand: a catalogue, a page tree, a page, the image and the
 * one line that draws it, and the table of where each object starts — which a
 * reader trusts, so it is counted in bytes, not characters.
 */
export function pdfFromJpeg(jpeg: Uint8Array, width: number, height: number): Uint8Array<ArrayBuffer> {
  const w = Math.round(width * 0.75)
  const h = Math.round(height * 0.75)
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part
    parts.push(bytes)
    length += bytes.length
  }
  const object = (n: number, body: string | Uint8Array[]) => {
    offsets[n] = length
    push(`${n} 0 obj\n`)
    if (typeof body === 'string') push(body)
    else for (const b of body) push(b)
    push('\nendobj\n')
  }
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  object(4, [
    enc.encode(
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    ),
    jpeg,
    enc.encode('\nendstream'),
  ])
  const draw = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`
  object(5, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`)
  const xref = length
  push(`xref\n0 6\n0000000000 65535 f \n`)
  for (let n = 1; n <= 5; n += 1) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  const out = new Uint8Array(length)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}
