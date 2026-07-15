// Minimal, dependency-free PDF writer (Plan §9 server-side export). Emits a
// valid multi-page PDF using the standard Helvetica font — enough for tabular
// report output without pulling in puppeteer/pdfkit. Text-only; ASCII/latin1.

function escapePdfText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n\t]+/g, ' ')
    // Drop non-latin1 so the single-byte encoding stays valid.
    .replace(/[^\x20-\x7e]/g, '')
}

/**
 * Render a title + list of text lines to a paginated PDF Buffer.
 * `lines` should already be column-joined (e.g. via padded columns).
 */
export function renderReportPdf(title: string, lines: string[]): Buffer {
  const PAGE_W = 612
  const PAGE_H = 792
  const MARGIN = 50
  const TITLE_SIZE = 16
  const BODY_SIZE = 9
  const LEADING = 13
  const top = PAGE_H - MARGIN
  const bottom = MARGIN

  const pageStreams: string[] = []
  let content = ''
  let y = top
  const flush = () => {
    if (content) pageStreams.push(content)
    content = ''
    y = top
  }
  const line = (text: string, size: number) => {
    content += `BT /F1 ${size} Tf ${MARGIN} ${y.toFixed(2)} Td (${escapePdfText(text)}) Tj ET\n`
    y -= size >= TITLE_SIZE ? size + 8 : LEADING
  }

  line(title, TITLE_SIZE)
  y -= 6
  for (const l of lines) {
    if (y < bottom) flush()
    line(l, BODY_SIZE)
  }
  flush()
  if (pageStreams.length === 0) pageStreams.push('') // never zero pages

  // Object layout: 1 Catalog, 2 Pages, 3 Font, then (Page, Contents) per page.
  const FONT = 3
  const objects: string[] = []
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`
  objects[FONT] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`

  const pageNums: number[] = []
  let next = 4
  for (let i = 0; i < pageStreams.length; i++) {
    const pageNum = next++
    const contentNum = next++
    pageNums.push(pageNum)
    objects[pageNum] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${FONT} 0 R >> >> /Contents ${contentNum} 0 R >>`
    const stream = pageStreams[i]
    objects[contentNum] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}endstream`
  }
  objects[2] = `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageNums.length} >>`

  const totalObjs = next - 1
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let n = 1; n <= totalObjs; n++) {
    offsets[n] = Buffer.byteLength(pdf, 'latin1')
    pdf += `${n} 0 obj\n${objects[n]}\nendobj\n`
  }
  const xrefStart = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`
  for (let n = 1; n <= totalObjs; n++) {
    pdf += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  return Buffer.from(pdf, 'latin1')
}

/** Format a header row + data rows into fixed-width columns for the PDF body. */
export function tableToLines(header: string[], rows: Array<Array<string | number>>): string[] {
  const cols = header.length
  const widths = header.map((h, i) =>
    Math.min(
      42,
      Math.max(String(h).length, ...rows.map((r) => String(r[i] ?? '').length)),
    ),
  )
  const fmt = (cells: Array<string | number>) =>
    cells.map((c, i) => String(c ?? '').slice(0, widths[i]).padEnd(widths[i])).join('  ').trimEnd()
  const out = [fmt(header), widths.map((w) => '-'.repeat(w)).join('  ')]
  for (const r of rows) out.push(fmt(r.slice(0, cols)))
  return out
}
