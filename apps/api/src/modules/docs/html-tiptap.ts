import { decodeXmlEntities } from '../../common/import/xml-scan'

/**
 * AN HTML PAGE AS A RUNDESK DOC (`commit-log/log-601eacc-2`).
 *
 * ClickUp's Docs import takes HTML beside Word and Markdown (help centre,
 * "Import Docs", read through search excerpts, 13 October), and its Confluence
 * import takes Confluence's HTML space export. Both arrive here: a forgiving
 * reader that builds the page's tree the way a browser would where the HTML is
 * loose — an unclosed `<p>` ends where the next block starts, a `<li>` where
 * the next item does, a cell where the next cell does — and then reads that
 * tree into the blocks a Doc holds, the ones `tiptap-markdown.ts` reads from
 * Markdown and writes back out: headings, paragraphs, the three kinds of list,
 * quotes, code, rules and tables, with bold, italic, strike, code and links.
 *
 * WHAT IS NOT CARRIED IS SAID IN THE DOC, not dropped: an image whose address
 * is the export's own (`attachments/…/diagram.png`) has nothing on this server
 * to point at, so it becomes the words `[Image: diagram.png]` where it stood.
 * Scripts, styles and the page's head are not content and are left out.
 */

export type DocNode = {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  content?: DocNode[]
}

export type HtmlElement = { tag: string; attrs: Record<string, string>; children: HtmlChild[]; parent: HtmlElement | null }
export type HtmlChild = HtmlElement | { text: string }

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'param'])
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'noscript'])
/** Blocks that end an open paragraph when they start, as HTML has it. */
const CLOSES_P = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul',
])

/** The named references a page is likely to hold, beyond XML's five. */
const HTML_ENTITIES: Record<string, string> = {
  lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
  zwnj: '‌', zwj: '‍', shy: '­', mdash: '—', ndash: '–', hellip: '…', lsquo: '‘', rsquo: '’', sbquo: '‚',
  ldquo: '“', rdquo: '”', bdquo: '„', laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›', bull: '•', middot: '·',
  copy: '©', reg: '®', trade: '™', deg: '°', plusmn: '±', times: '×', divide: '÷', para: '¶', sect: '§',
  euro: '€', pound: '£', yen: '¥', cent: '¢', larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔',
  frac12: '½', frac14: '¼', frac34: '¾', iexcl: '¡', iquest: '¿', dagger: '†', Dagger: '‡', permil: '‰',
  prime: '′', Prime: '″', oline: '‾', check: '✓', cross: '✗',
}

export const decodeHtmlEntities = (text: string): string => decodeXmlEntities(text, HTML_ENTITIES)

/** The page's tree, built as a browser builds a loose page. */
export function parseHtml(html: string): HtmlElement {
  const root: HtmlElement = { tag: '#root', attrs: {}, children: [], parent: null }
  let current = root
  const n = html.length
  let i = 0

  const open = (tag: string): HtmlElement | null => {
    for (let e: HtmlElement | null = current; e && e !== root; e = e.parent) if (e.tag === tag) return e
    return null
  }
  const closeTo = (el: HtmlElement) => {
    current = el.parent ?? root
  }
  /** The nearest open `tag` below the nearest open boundary (a list for `li`, a table for a row). */
  const openWithin = (tag: string, boundaries: string[]): HtmlElement | null => {
    for (let e: HtmlElement | null = current; e && e !== root; e = e.parent) {
      if (e.tag === tag) return e
      if (boundaries.includes(e.tag)) return null
    }
    return null
  }

  while (i < n) {
    const lt = html.indexOf('<', i)
    if (lt === -1) {
      current.children.push({ text: decodeHtmlEntities(html.slice(i)) })
      break
    }
    if (lt > i) current.children.push({ text: decodeHtmlEntities(html.slice(i, lt)) })
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4)
      i = end === -1 ? n : end + 3
      continue
    }
    if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {
      const end = html.indexOf('>', lt + 2)
      i = end === -1 ? n : end + 1
      continue
    }
    const close = html[lt + 1] === '/'
    const nameMatch = /^[A-Za-z][A-Za-z0-9:-]*/.exec(html.slice(lt + (close ? 2 : 1), lt + (close ? 2 : 1) + 64))
    if (!nameMatch) {
      current.children.push({ text: '<' })
      i = lt + 1
      continue
    }
    const tag = nameMatch[0].toLowerCase()
    const end = tagEnd(html, lt + 1)
    if (end === -1) break
    const inside = html.slice(lt + (close ? 2 : 1) + nameMatch[0].length, end)
    i = end + 1

    if (close) {
      if (tag === 'p' && !openWithin('p', ['div', 'li', 'td', 'th', 'blockquote', 'section', 'article'])) {
        // `</p>` with no `<p>` open is an empty paragraph, as a browser reads it.
        current.children.push({ tag: 'p', attrs: {}, children: [], parent: current })
        continue
      }
      const el = open(tag)
      if (el) closeTo(el)
      continue
    }

    const attrs = parseAttributes(inside)
    if (CLOSES_P.has(tag)) {
      const p = openWithin('p', ['div', 'li', 'td', 'th', 'blockquote', 'section', 'article', 'body'])
      if (p) closeTo(p)
    }
    if (tag === 'li') {
      const li = openWithin('li', ['ul', 'ol', 'menu'])
      if (li) closeTo(li)
    } else if (tag === 'dt' || tag === 'dd') {
      const item = openWithin('dt', ['dl']) ?? openWithin('dd', ['dl'])
      if (item) closeTo(item)
    } else if (tag === 'tr') {
      const row = openWithin('tr', ['table'])
      if (row) closeTo(row)
    } else if (tag === 'td' || tag === 'th') {
      const cell = openWithin('td', ['tr', 'table']) ?? openWithin('th', ['tr', 'table'])
      if (cell) closeTo(cell)
    } else if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
      const section = openWithin('thead', ['table']) ?? openWithin('tbody', ['table']) ?? openWithin('tfoot', ['table'])
      if (section) closeTo(section)
    }

    const el: HtmlElement = { tag, attrs, children: [], parent: current }
    current.children.push(el)
    const selfClosed = /\/\s*$/.test(inside)
    if (VOID.has(tag) || selfClosed) continue
    if (RAW_TEXT.has(tag)) {
      const stop = html.toLowerCase().indexOf(`</${tag}`, i)
      const raw = html.slice(i, stop === -1 ? n : stop)
      if (tag === 'title' || tag === 'textarea') el.children.push({ text: decodeHtmlEntities(raw) })
      const after = stop === -1 ? n : html.indexOf('>', stop)
      i = after === -1 ? n : after + 1
      continue
    }
    current = el
  }
  return root
}

function tagEnd(html: string, from: number): number {
  let quote = ''
  for (let j = from; j < html.length; j++) {
    const ch = html[j]
    if (quote) {
      if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '>') return j
  }
  return -1
}

function parseAttributes(src: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) attrs[m[1].toLowerCase()] = decodeHtmlEntities(m[2] ?? m[3] ?? m[4] ?? '')
  return attrs
}

// ── finding things in the tree ───────────────────────────────────────────────

const isElement = (c: HtmlChild): c is HtmlElement => 'tag' in c

export function findElement(root: HtmlElement, test: (e: HtmlElement) => boolean): HtmlElement | null {
  for (const c of root.children) {
    if (!isElement(c)) continue
    if (test(c)) return c
    const inner = findElement(c, test)
    if (inner) return inner
  }
  return null
}

export function findElements(root: HtmlElement, test: (e: HtmlElement) => boolean, out: HtmlElement[] = []): HtmlElement[] {
  for (const c of root.children) {
    if (!isElement(c)) continue
    if (test(c)) out.push(c)
    findElements(c, test, out)
  }
  return out
}

export const hasClass = (e: HtmlElement, name: string) => (e.attrs.class ?? '').split(/\s+/).includes(name)

export function textContent(node: HtmlChild): string {
  if (!isElement(node)) return node.text
  if (node.tag === 'br') return '\n'
  return node.children.map(textContent).join('')
}

// ── the tree as a Doc ────────────────────────────────────────────────────────

type Mark = { type: string; attrs?: Record<string, unknown> }

const BOLD = new Set(['b', 'strong'])
const ITALIC = new Set(['i', 'em', 'cite', 'var', 'dfn'])
const STRIKE = new Set(['s', 'strike', 'del'])
const CODE = new Set(['code', 'kbd', 'samp', 'tt'])
const SKIP = new Set(['script', 'style', 'head', 'title', 'noscript', 'template', 'button', 'select', 'option', 'nav', 'iframe', 'object', 'svg', 'canvas', 'form'])
const HEADINGS: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 }
const LIST = new Set(['ul', 'ol', 'menu'])

/** A link's address, if it is one a reader can follow from here. */
function safeHref(href: string | undefined): string | null {
  const h = (href ?? '').trim()
  return /^(https?:|mailto:)/i.test(h) ? h : null
}

/** An image's file name, for the words that stand where it could not. */
function imageName(src: string, alt: string): string {
  const fromSrc = decodeURIComponent((src.split(/[?#]/)[0] ?? '').split('/').pop() ?? '')
  return alt.trim() || fromSrc || 'image'
}

class DocBuilder {
  blocks(el: HtmlElement): DocNode[] {
    const out: DocNode[] = []
    let inline: DocNode[] = []
    const flush = () => {
      const trimmed = trimInline(inline)
      if (trimmed.length) out.push({ type: 'paragraph', content: trimmed })
      inline = []
    }
    for (const c of el.children) {
      if (!isElement(c)) {
        inline.push(...this.inline(c, []))
        continue
      }
      if (SKIP.has(c.tag)) continue
      const block = this.block(c)
      if (block === null) {
        inline.push(...this.inline(c, []))
        continue
      }
      flush()
      out.push(...block)
    }
    flush()
    return out
  }

  /** The blocks one element makes, or null when it is inline content. */
  block(el: HtmlElement): DocNode[] | null {
    const t = el.tag
    if (HEADINGS[t]) {
      const content = trimInline(this.inlineChildren(el, []))
      return content.length ? [{ type: 'heading', attrs: { level: HEADINGS[t] }, content }] : []
    }
    if (t === 'p') {
      const nested = el.children.some((c) => isElement(c) && this.isBlockTag(c.tag))
      if (nested) return this.blocks(el)
      const content = trimInline(this.inlineChildren(el, []))
      return content.length ? [{ type: 'paragraph', content }] : []
    }
    if (LIST.has(t)) return this.list(el)
    if (t === 'blockquote') {
      const content = this.blocks(el)
      return content.length ? [{ type: 'blockquote', content }] : []
    }
    if (t === 'pre') {
      const code = textContent(el).replace(/\n$/, '')
      const cls = `${el.attrs.class ?? ''} ${findElement(el, (e) => e.tag === 'code')?.attrs.class ?? ''} ${el.attrs['data-syntaxhighlighter-params'] ?? ''}`
      const language = /language-([\w+-]+)/.exec(cls)?.[1] ?? /brush:\s*([\w+-]+)/.exec(cls)?.[1]
      const node: DocNode = { type: 'codeBlock', content: code ? [{ type: 'text', text: code }] : [] }
      if (language) node.attrs = { language }
      return [node]
    }
    if (t === 'hr') return [{ type: 'horizontalRule' }]
    if (t === 'table') return this.table(el)
    if (t === 'dl') {
      const out: DocNode[] = []
      for (const c of el.children) {
        if (!isElement(c)) continue
        const content = trimInline(this.inlineChildren(c, c.tag === 'dt' ? [{ type: 'bold' }] : []))
        if (content.length) out.push({ type: 'paragraph', content })
      }
      return out
    }
    if (this.isBlockTag(t)) return this.blocks(el)
    return null
  }

  isBlockTag(t: string): boolean {
    return (
      !!HEADINGS[t] ||
      LIST.has(t) ||
      ['p', 'div', 'blockquote', 'pre', 'hr', 'table', 'dl', 'section', 'article', 'main', 'header', 'footer', 'aside',
        'figure', 'figcaption', 'address', 'center', 'body', 'html', 'details', 'summary', 'fieldset', 'li', 'tbody', 'thead', 'tfoot', 'tr'].includes(t)
    )
  }

  list(el: HtmlElement): DocNode[] {
    const items = el.children.filter((c): c is HtmlElement => isElement(c) && c.tag === 'li')
    if (!items.length) return this.blocks(el)
    // Confluence's task list: each item a checkbox, `checked` on those done.
    const isTask = hasClass(el, 'inline-task-list') || items.every((li) => li.attrs['data-inline-task-id'] !== undefined || !!findElement(li, (e) => e.tag === 'input' && (e.attrs.type ?? '').toLowerCase() === 'checkbox'))
    const ordered = el.tag === 'ol'
    const content: DocNode[] = items.map((li) => {
      const blocks = this.blocks(li)
      const body = blocks.length ? blocks : [{ type: 'paragraph', content: [] as DocNode[] }]
      // A list item starts with a paragraph, as the editor's schema asks.
      if (body[0].type !== 'paragraph') body.unshift({ type: 'paragraph', content: [] })
      if (!isTask) return { type: 'listItem', content: body }
      const box = findElement(li, (e) => e.tag === 'input' && (e.attrs.type ?? '').toLowerCase() === 'checkbox')
      const checked = hasClass(li, 'checked') || (box ? box.attrs.checked !== undefined : false)
      return { type: 'taskItem', attrs: { checked }, content: body }
    })
    return [{ type: isTask ? 'taskList' : ordered ? 'orderedList' : 'bulletList', content }]
  }

  table(el: HtmlElement): DocNode[] {
    const rows = findElements(el, (e) => e.tag === 'tr' && nearestTable(e) === el)
    const out: DocNode[] = []
    const caption = el.children.find((c): c is HtmlElement => isElement(c) && c.tag === 'caption')
    if (caption) {
      const content = trimInline(this.inlineChildren(caption, [{ type: 'bold' }]))
      if (content.length) out.push({ type: 'paragraph', content })
    }
    const tableRows: DocNode[] = []
    for (const tr of rows) {
      const cells = tr.children.filter((c): c is HtmlElement => isElement(c) && (c.tag === 'td' || c.tag === 'th'))
      if (!cells.length) continue
      tableRows.push({
        type: 'tableRow',
        content: cells.map((cell) => {
          // A cell holds paragraphs: anything deeper is read as its paragraphs' text.
          const blocks = this.blocks(cell).flatMap((b) => flattenToParagraphs(b))
          return { type: cell.tag === 'th' ? 'tableHeader' : 'tableCell', content: blocks.length ? blocks : [{ type: 'paragraph', content: [] }] }
        }),
      })
    }
    if (tableRows.length) out.push({ type: 'table', content: tableRows })
    return out
  }

  inlineChildren(el: HtmlElement, marks: Mark[]): DocNode[] {
    return el.children.flatMap((c) => this.inline(c, marks))
  }

  inline(c: HtmlChild, marks: Mark[]): DocNode[] {
    if (!isElement(c)) {
      const text = c.text.replace(/[\t\n\r\f ]+/g, ' ')
      return text ? [withMarks({ type: 'text', text }, marks)] : []
    }
    const t = c.tag
    if (SKIP.has(t)) return []
    if (t === 'br') return [{ type: 'hardBreak' }]
    if (t === 'img') {
      const src = c.attrs.src ?? ''
      if (/^https?:/i.test(src)) return [{ type: 'image', attrs: { src, alt: c.attrs.alt ?? '' } }]
      return [withMarks({ type: 'text', text: `[Image: ${imageName(src, c.attrs.alt ?? '')}]` }, marks)]
    }
    if (t === 'input') return []
    let next = marks
    if (BOLD.has(t)) next = [...marks, { type: 'bold' }]
    else if (ITALIC.has(t)) next = [...marks, { type: 'italic' }]
    else if (STRIKE.has(t)) next = [...marks, { type: 'strike' }]
    else if (CODE.has(t)) next = [...marks, { type: 'code' }]
    else if (t === 'a') {
      const href = safeHref(c.attrs.href)
      if (href) next = [...marks.filter((m) => m.type !== 'link'), { type: 'link', attrs: { href } }]
    }
    // A block inside inline content (a table in a span) is read for its text.
    return this.inlineChildren(c, next)
  }
}

function nearestTable(e: HtmlElement): HtmlElement | null {
  for (let p = e.parent; p; p = p.parent) if (p.tag === 'table') return p
  return null
}

function withMarks(node: DocNode, marks: Mark[]): DocNode {
  if (!marks.length) return node
  const seen = new Set<string>()
  const unique = marks.filter((m) => (seen.has(m.type) ? false : (seen.add(m.type), true)))
  return { ...node, marks: unique }
}

/** Runs of text joined where their marks agree, with the paragraph's own leading and trailing spaces taken off. */
function trimInline(nodes: DocNode[]): DocNode[] {
  const merged: DocNode[] = []
  for (const n of nodes) {
    const last = merged[merged.length - 1]
    if (n.type === 'text' && last?.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(n.marks ?? [])) {
      last.text = (last.text ?? '') + (n.text ?? '')
    } else merged.push({ ...n })
  }
  for (let k = 0; k < merged.length; k++) {
    const n = merged[k]
    if (n.type !== 'text') continue
    let text = (n.text ?? '').replace(/ {2,}/g, ' ')
    if (k === 0 || merged[k - 1].type === 'hardBreak') text = text.replace(/^ /, '')
    if (k === merged.length - 1 || merged[k + 1].type === 'hardBreak') text = text.replace(/ $/, '')
    n.text = text
  }
  return merged.filter((n) => n.type !== 'text' || (n.text ?? '') !== '')
}

function flattenToParagraphs(node: DocNode): DocNode[] {
  if (node.type === 'paragraph') return [node]
  if (node.type === 'heading') return [{ type: 'paragraph', content: node.content ?? [] }]
  if (node.type === 'codeBlock') return [{ type: 'paragraph', content: node.content ?? [] }]
  return (node.content ?? []).flatMap(flattenToParagraphs)
}

/** An element's (or a whole page's) content as a Doc's blocks. */
export function htmlToTiptap(input: string | HtmlElement): { type: 'doc'; content: DocNode[] } {
  const root = typeof input === 'string' ? parseHtml(input) : input
  const body = typeof input === 'string' ? findElement(root, (e) => e.tag === 'body') ?? root : root
  return { type: 'doc', content: new DocBuilder().blocks(body) }
}

/**
 * An HTML file as a Doc: its content, and its title — the page's `<title>`,
 * else a first `<h1>` (taken out of the content, as a Markdown file's first
 * `# ` is, so the Doc does not say its title twice), else the file's name.
 */
export function htmlFileToDoc(html: string, fileName = ''): { title: string; content: { type: 'doc'; content: DocNode[] } } {
  const root = parseHtml(html)
  const content = htmlToTiptap(findElement(root, (e) => e.tag === 'body') ?? root)
  const titleEl = findElement(root, (e) => e.tag === 'title')
  let title = titleEl ? textContent(titleEl).replace(/\s+/g, ' ').trim() : ''
  const first = content.content[0]
  if (first?.type === 'heading' && Number(first.attrs?.level) === 1) {
    const h1 = (first.content ?? []).map((n) => n.text ?? '').join('').trim()
    if (!title || title === h1) {
      content.content.shift()
      title = title || h1
    }
  }
  if (!title) title = String(fileName).replace(/\.(html?|xhtml)$/i, '').trim()
  return { title: (title || 'Untitled').slice(0, 500), content }
}
