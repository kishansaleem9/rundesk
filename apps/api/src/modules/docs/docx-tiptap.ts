import { readZip, ZipReadError, type ZipEntry } from '../../common/import/zip-read'
import { attr, localName, xmlTokens, type XmlToken } from '../../common/import/xml-scan'
import type { DocNode } from './html-tiptap'

/**
 * A WORD DOCUMENT (.docx) AS A RUNDESK DOC (`commit-log/log-601eacc-2`).
 *
 * ClickUp's Docs import reads Word's .docx (help centre, "Import Docs", read
 * through search excerpts, 13 October). Rundesk refused one, by name, as "a
 * heavy parser dependency" (`ai/attachment-text.ts` decided that for the
 * knowledge indexer). It needs none: a .docx is a zip (`zip-read.ts`) of XML
 * parts (`xml-scan.ts`), and what a Doc holds of it is in three of them —
 * `word/document.xml` (the text), `word/styles.xml` (which paragraph style is a
 * heading) and `word/numbering.xml` (which list is numbered) — with the links'
 * addresses in the document's relationships.
 *
 * READ INTO THE BLOCKS A DOC HOLDS, as `tiptap-markdown.ts` reads Markdown:
 *   · a paragraph styled Heading 1–6 (or given an outline level) a heading;
 *   · numbered and bulleted paragraphs lists, nested by their level;
 *   · a table a table, its first row a header row when Word marks it one;
 *   · bold, italic, strike-through and links on the runs that carry them;
 *     a tab, a line break, a soft hyphen as Word draws them.
 * A picture is said where it stood (`[Image]`): its bytes stay in the file. A
 * deleted revision is not text the author kept, so it is left out; an
 * inserted one is.
 *
 * THE TITLE is the document's own (its properties' title), else a Title-styled
 * or first Heading 1 paragraph at the top (taken out of the body, so the Doc
 * does not say it twice), else the file's name.
 */

export class DocxReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocxReadError'
  }
}

const DOCX_LIMITS = { maxEntries: 5_000, maxEntryBytes: 100 * 1024 * 1024, maxTotalBytes: 300 * 1024 * 1024 }

type Mark = { type: string; attrs?: Record<string, unknown> }
type Para = { kind: 'para'; style: string; outline: number | null; list: { numId: string; level: number } | null; inline: DocNode[] }
type Table = { kind: 'table'; rows: Array<{ header: boolean; cells: Para[][] }> }
type Block = Para | Table

export function docxToDoc(buf: Buffer, fileName = ''): { title: string; content: { type: 'doc'; content: DocNode[] } } {
  let zip: Map<string, ZipEntry>
  try {
    zip = readZip(buf, DOCX_LIMITS)
  } catch (e) {
    if (e instanceof ZipReadError) throw new DocxReadError(`The Word document could not be read: ${e.message}`)
    throw e
  }
  const part = (path: string) => zip.get(path)?.text() ?? null
  const documentXml = part('word/document.xml')
  if (!documentXml) throw new DocxReadError('This zip is not a Word document (.docx): it has no word/document.xml')

  const links = linkTargets(part('word/_rels/document.xml.rels'))
  const styles = headingStyles(part('word/styles.xml'))
  const ordered = orderedLists(part('word/numbering.xml'))
  const blocks = readBody(documentXml, links)

  // The title: the document's own, or a first Title or Heading 1 paragraph.
  let title = coreTitle(part('docProps/core.xml'))
  const firstIndex = blocks.findIndex((b) => b.kind !== 'para' || plain(b.inline).trim() !== '')
  const first = firstIndex === -1 ? undefined : blocks[firstIndex]
  if (first?.kind === 'para') {
    const level = headingLevel(first, styles)
    const isTitle = styles.titles.has(first.style.toLowerCase())
    const text = plain(first.inline).trim()
    if ((isTitle || level === 1) && (!title || title === text)) {
      blocks.splice(firstIndex, 1)
      title = title || text
    }
  }
  if (!title) title = String(fileName).replace(/\.docx$/i, '').trim()

  return { title: (title || 'Untitled').slice(0, 500), content: { type: 'doc', content: toDocNodes(blocks, styles, ordered) } }
}

/** Plain text of a run of inline nodes. */
function plain(nodes: DocNode[]): string {
  return nodes.map((n) => (n.type === 'text' ? n.text ?? '' : n.type === 'hardBreak' ? '\n' : '')).join('')
}

function coreTitle(xml: string | null): string {
  if (!xml) return ''
  let inTitle = false
  let title = ''
  for (const tok of xmlTokens(xml)) {
    if (tok.kind === 'open' && localName(tok.name) === 'title' && !tok.selfClosing) inTitle = true
    else if (tok.kind === 'close' && localName(tok.name) === 'title') inTitle = false
    else if (tok.kind === 'text' && inTitle) title += tok.text
  }
  return title.replace(/\s+/g, ' ').trim()
}

/** Relationship id → a link's address, for those that point outside the document. */
function linkTargets(xml: string | null): Map<string, string> {
  const out = new Map<string, string>()
  if (!xml) return out
  for (const tok of xmlTokens(xml)) {
    if (tok.kind !== 'open' || localName(tok.name) !== 'Relationship') continue
    if (!(attr(tok.attrs, 'Type') ?? '').endsWith('/hyperlink')) continue
    out.set(attr(tok.attrs, 'Id') ?? '', attr(tok.attrs, 'Target') ?? '')
  }
  return out
}

type Styles = { headings: Map<string, number>; titles: Set<string> }

/** Paragraph styles that are headings — by their name ("heading 2") or their outline level — and those that are a title. */
function headingStyles(xml: string | null): Styles {
  const headings = new Map<string, number>()
  const titles = new Set<string>(['title'])
  for (let n = 1; n <= 6; n++) headings.set(`heading${n}`, n)
  if (!xml) return { headings, titles }
  let id = ''
  let isParagraph = false
  for (const tok of xmlTokens(xml)) {
    if (tok.kind === 'open') {
      const name = localName(tok.name)
      if (name === 'style') {
        id = (attr(tok.attrs, 'styleId') ?? '').toLowerCase()
        isParagraph = (attr(tok.attrs, 'type') ?? 'paragraph') === 'paragraph'
      } else if (name === 'name' && isParagraph && id) {
        const val = (attr(tok.attrs, 'val') ?? '').toLowerCase()
        const m = /^heading\s*([1-6])$/.exec(val)
        if (m) headings.set(id, Number(m[1]))
        if (val === 'title') titles.add(id)
      } else if (name === 'outlineLvl' && isParagraph && id && !headings.has(id)) {
        const lvl = Number(attr(tok.attrs, 'val'))
        if (Number.isFinite(lvl) && lvl >= 0 && lvl <= 5) headings.set(id, lvl + 1)
      }
    } else if (tok.kind === 'close' && localName(tok.name) === 'style') {
      id = ''
      isParagraph = false
    }
  }
  return { headings, titles }
}

function headingLevel(p: Para, styles: Styles): number | null {
  if (p.list) return null
  const byStyle = styles.headings.get(p.style.toLowerCase())
  if (byStyle) return byStyle
  if (p.outline !== null && p.outline >= 0 && p.outline <= 5) return p.outline + 1
  return null
}

/** `numId:level` pairs that count (1. 2. 3.) rather than bullet. */
function orderedLists(xml: string | null): Set<string> {
  const out = new Set<string>()
  if (!xml) return out
  const abstractOrdered = new Map<string, Set<number>>()
  const numToAbstract = new Map<string, string>()
  let abstractId: string | null = null
  let level: number | null = null
  let numId: string | null = null
  for (const tok of xmlTokens(xml)) {
    if (tok.kind === 'open') {
      const name = localName(tok.name)
      if (name === 'abstractNum') abstractId = attr(tok.attrs, 'abstractNumId') ?? null
      else if (name === 'lvl' && abstractId !== null) level = Number(attr(tok.attrs, 'ilvl') ?? 0)
      else if (name === 'numFmt' && abstractId !== null && level !== null) {
        const fmt = attr(tok.attrs, 'val') ?? 'bullet'
        if (fmt !== 'bullet' && fmt !== 'none') {
          const set = abstractOrdered.get(abstractId) ?? new Set<number>()
          set.add(level)
          abstractOrdered.set(abstractId, set)
        }
      } else if (name === 'num') numId = attr(tok.attrs, 'numId') ?? null
      else if (name === 'abstractNumId' && numId !== null) numToAbstract.set(numId, attr(tok.attrs, 'val') ?? '')
    } else if (tok.kind === 'close') {
      const name = localName(tok.name)
      if (name === 'abstractNum') abstractId = null
      else if (name === 'lvl') level = null
      else if (name === 'num') numId = null
    }
  }
  for (const [num, abstract] of numToAbstract) {
    for (const lvl of abstractOrdered.get(abstract) ?? []) out.add(`${num}:${lvl}`)
  }
  return out
}

/** The body's paragraphs and tables, in order, each paragraph's runs read into inline nodes with their marks. */
function readBody(xml: string, links: Map<string, string>): Block[] {
  const tokens = xmlTokens(xml)
  const out: Block[] = []
  let inBody = false
  for (let next = tokens.next(); !next.done; next = tokens.next()) {
    const tok = next.value
    if (tok.kind === 'open' && localName(tok.name) === 'body') { inBody = true; continue }
    if (!inBody || tok.kind !== 'open' || tok.selfClosing) continue
    const name = localName(tok.name)
    if (name === 'p') out.push(readParagraph(tokens, links))
    else if (name === 'tbl') out.push(readTable(tokens, links))
  }
  return out
}

/** One `<w:p>`, read to its end: its style, list level, outline level and runs. */
function readParagraph(tokens: Generator<XmlToken>, links: Map<string, string>): Para {
  const p: Para = { kind: 'para', style: '', outline: null, list: null, inline: [] }
  let depth = 1
  let numId: string | null = null
  let ilvl = 0
  const runMarks: Mark[] = []
  let inRunProps = false
  let inParaProps = false
  let inText = false
  let deleted = 0
  const linkStack: Array<string | null> = []
  // A field (`HYPERLINK "…"`): its instruction, and whether its result is being read.
  let fieldInstr = ''
  let inInstr = false
  let fieldLink: string | null = null
  let fieldState: 'none' | 'instr' | 'result' = 'none'

  const currentLink = (): string | null => fieldLink ?? [...linkStack].reverse().find((l) => l !== null) ?? null
  const marksNow = (): Mark[] => {
    const marks = [...runMarks]
    const href = currentLink()
    if (href) marks.push({ type: 'link', attrs: { href } })
    return marks
  }
  const push = (text: string) => {
    if (deleted > 0 || fieldState === 'instr' || !text) return
    const marks = marksNow()
    const last = p.inline[p.inline.length - 1]
    if (last?.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(marks)) last.text += text
    else p.inline.push(marks.length ? { type: 'text', text, marks } : { type: 'text', text })
  }
  const on = (attrs: Record<string, string>) => {
    const v = attr(attrs, 'val')
    return v === undefined || !['0', 'false', 'off', 'none'].includes(v.toLowerCase())
  }

  for (let next = tokens.next(); !next.done; next = tokens.next()) {
    const tok = next.value
    if (tok.kind === 'open') {
      const name = localName(tok.name)
      if (!tok.selfClosing) depth++
      switch (name) {
        case 'pPr': if (!tok.selfClosing) inParaProps = true; break
        case 'pStyle': if (inParaProps) p.style = attr(tok.attrs, 'val') ?? ''; break
        case 'outlineLvl': if (inParaProps) p.outline = Number(attr(tok.attrs, 'val') ?? NaN); break
        case 'numId': if (inParaProps) numId = attr(tok.attrs, 'val') ?? null; break
        case 'ilvl': if (inParaProps) ilvl = Number(attr(tok.attrs, 'val') ?? 0); break
        case 'r': runMarks.length = 0; break
        case 'rPr': if (!inParaProps && !tok.selfClosing) inRunProps = true; break
        case 'b': if (inRunProps && on(tok.attrs)) runMarks.push({ type: 'bold' }); break
        case 'i': if (inRunProps && on(tok.attrs)) runMarks.push({ type: 'italic' }); break
        case 'strike':
        case 'dstrike': if (inRunProps && on(tok.attrs)) runMarks.push({ type: 'strike' }); break
        case 't': if (!tok.selfClosing) inText = true; break
        case 'delText': if (!tok.selfClosing) inText = false; break
        case 'tab': if (!inParaProps && !inRunProps) push('\t'); break
        case 'br':
        case 'cr': {
          const type = attr(tok.attrs, 'type')
          if (type !== 'page' && type !== 'column' && deleted === 0 && fieldState !== 'instr') p.inline.push({ type: 'hardBreak' })
          break
        }
        case 'noBreakHyphen': push('-'); break
        case 'softHyphen': break
        case 'drawing':
        case 'pict':
        case 'object': push('[Image]'); break
        case 'hyperlink': {
          const id = attr(tok.attrs, 'id')
          const href = id ? links.get(id) ?? null : null
          if (!tok.selfClosing) linkStack.push(href && /^(https?:|mailto:)/i.test(href) ? href : null)
          break
        }
        case 'del': if (!tok.selfClosing) deleted++; break
        case 'fldChar': {
          const type = attr(tok.attrs, 'fldCharType')
          if (type === 'begin') { fieldState = 'instr'; fieldInstr = '' }
          else if (type === 'separate') {
            const m = /HYPERLINK\s+"([^"]+)"/i.exec(fieldInstr)
            fieldLink = m && /^(https?:|mailto:)/i.test(m[1]) ? m[1] : null
            fieldState = 'result'
          } else if (type === 'end') { fieldState = 'none'; fieldLink = null }
          break
        }
        case 'instrText': if (!tok.selfClosing) inInstr = true; break
        case 'fldSimple': {
          const m = /HYPERLINK\s+"([^"]+)"/i.exec(attr(tok.attrs, 'instr') ?? '')
          if (!tok.selfClosing) linkStack.push(m && /^(https?:|mailto:)/i.test(m[1]) ? m[1] : null)
          break
        }
      }
    } else if (tok.kind === 'close') {
      const name = localName(tok.name)
      depth--
      if (name === 'pPr') inParaProps = false
      else if (name === 'rPr') inRunProps = false
      else if (name === 't') inText = false
      else if (name === 'instrText') inInstr = false
      else if (name === 'hyperlink' || name === 'fldSimple') linkStack.pop()
      else if (name === 'del') deleted = Math.max(0, deleted - 1)
      if (depth === 0) break
    } else if (inText) {
      push(tok.text)
    } else if (inInstr) {
      fieldInstr += tok.text
    }
  }
  if (numId !== null && numId !== '0') p.list = { numId, level: Number.isFinite(ilvl) ? ilvl : 0 }
  return p
}

/** One `<w:tbl>`, read to its end: rows of cells of paragraphs. A table inside a cell is read as its paragraphs. */
function readTable(tokens: Generator<XmlToken>, links: Map<string, string>): Table {
  const table: Table = { kind: 'table', rows: [] }
  let depth = 1
  let row: { header: boolean; cells: Para[][] } | null = null
  let cell: Para[] | null = null
  let inRowProps = false
  // A table inside a cell: its rows and cells are not this table's, its paragraphs go into the cell it is in.
  let nested = 0
  for (let next = tokens.next(); !next.done; next = tokens.next()) {
    const tok = next.value
    if (tok.kind === 'open') {
      const name = localName(tok.name)
      if (name === 'p' && !tok.selfClosing) {
        // Read to its own end, so the depth here is unchanged.
        const p = readParagraph(tokens, links)
        if (cell) cell.push(p)
        continue
      }
      if (!tok.selfClosing) depth++
      if (name === 'tbl' && !tok.selfClosing) nested++
      if (nested > 0) continue
      if (name === 'tr') row = { header: false, cells: [] }
      else if (name === 'trPr' && !tok.selfClosing) inRowProps = true
      else if (name === 'tblHeader' && inRowProps && row) row.header = attr(tok.attrs, 'val') !== '0' && attr(tok.attrs, 'val') !== 'false'
      else if (name === 'tc' && !tok.selfClosing) cell = []
    } else if (tok.kind === 'close') {
      const name = localName(tok.name)
      depth--
      if (depth === 0) break
      if (name === 'tbl' && nested > 0) { nested--; continue }
      if (nested > 0) continue
      if (name === 'trPr') inRowProps = false
      else if (name === 'tc' && row && cell) { row.cells.push(cell); cell = null }
      else if (name === 'tr' && row) { if (row.cells.length) table.rows.push(row); row = null }
    }
  }
  return table
}

/** The blocks as Doc nodes: headings and paragraphs as they are, list paragraphs gathered into nested lists. */
function toDocNodes(blocks: Block[], styles: Styles, ordered: Set<string>): DocNode[] {
  const out: DocNode[] = []
  let i = 0
  while (i < blocks.length) {
    const b = blocks[i]
    if (b.kind === 'table') {
      out.push(tableNode(b))
      i++
      continue
    }
    if (b.list) {
      const run: Para[] = []
      while (i < blocks.length) {
        const c = blocks[i]
        if (c.kind !== 'para' || !c.list) break
        run.push(c)
        i++
      }
      out.push(...listNodes(run, ordered))
      continue
    }
    i++
    const inline = trimmed(b.inline)
    const level = headingLevel(b, styles)
    if (level) {
      if (inline.length) out.push({ type: 'heading', attrs: { level: Math.min(level, 6) }, content: inline })
    } else if (inline.length) {
      out.push({ type: 'paragraph', content: inline })
    }
  }
  return out
}

/** Consecutive list paragraphs as lists, a deeper level nested in the item before it. */
function listNodes(paras: Para[], ordered: Set<string>): DocNode[] {
  const top: DocNode[] = []
  // stack[d] = the list node open at depth d.
  const stack: DocNode[] = []
  for (const p of paras) {
    const level = Math.max(0, Math.min(p.list!.level, 8))
    const kind = ordered.has(`${p.list!.numId}:${p.list!.level}`) ? 'orderedList' : 'bulletList'
    while (stack.length > level + 1) stack.pop()
    if (stack.length === level + 1 && stack[level].type !== kind) stack.pop()
    while (stack.length <= level) {
      const list: DocNode = { type: stack.length === level ? kind : 'bulletList', content: [] }
      const parent = stack[stack.length - 1]
      if (!parent) top.push(list)
      else {
        let item = parent.content![parent.content!.length - 1]
        if (!item) {
          item = { type: 'listItem', content: [{ type: 'paragraph', content: [] }] }
          parent.content!.push(item)
        }
        item.content!.push(list)
      }
      stack.push(list)
    }
    stack[level].content!.push({ type: 'listItem', content: [{ type: 'paragraph', content: trimmed(p.inline) }] })
  }
  return top
}

/** A table as the Doc's table: a row Word repeats as a header (`tblHeader`) is a header row. */
function tableNode(t: Table): DocNode {
  return {
    type: 'table',
    content: t.rows.map((r) => ({
      type: 'tableRow',
      content: r.cells.map((cell) => {
        const paras = cell.map((p) => ({ type: 'paragraph', content: trimmed(p.inline) }))
        return {
          type: r.header ? 'tableHeader' : 'tableCell',
          content: paras.length ? paras : [{ type: 'paragraph', content: [] }],
        }
      }),
    })),
  }
}

/** A paragraph's runs without its leading and trailing spaces, and none left empty. */
function trimmed(nodes: DocNode[]): DocNode[] {
  const out = nodes.map((n) => ({ ...n }))
  while (out.length && out[0].type === 'hardBreak') out.shift()
  while (out.length && out[out.length - 1].type === 'hardBreak') out.pop()
  if (out[0]?.type === 'text') out[0].text = (out[0].text ?? '').replace(/^\s+/, '')
  const last = out[out.length - 1]
  if (last?.type === 'text') last.text = (last.text ?? '').replace(/\s+$/, '')
  return out.filter((n) => n.type !== 'text' || (n.text ?? '') !== '')
}
