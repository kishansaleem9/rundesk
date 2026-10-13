/**
 * XML READ AS A STREAM OF TAGS AND TEXT, with no dependency
 * (`commit-log/log-601eacc-2`).
 *
 * The parts of an .xlsx and a .docx are XML written by a program — Excel, Word,
 * LibreOffice, Google's exporters — and what the importers need of them is
 * their elements in order: a cell and its value, a paragraph and its runs. So
 * this is a tokenizer, not a parser: it yields each start tag with its
 * attributes, each end tag and each run of text, and keeps no tree.
 *
 * NO ENTITY IS DEFINED BY THE DOCUMENT. A DOCTYPE is skipped, never read, so
 * an entity it declares stays the text `&name;` it was written as: the
 * "billion laughs" and an external entity naming a file on this server have
 * nothing to expand them. The five XML entities and character references are
 * all that is decoded.
 */

export type XmlToken =
  | { kind: 'open'; name: string; attrs: Record<string, string>; selfClosing: boolean }
  | { kind: 'close'; name: string }
  | { kind: 'text'; text: string }

const XML_ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

/** `&lt;` `&#38;` `&#x26;` and their kind; any other `&name;` is left as written. */
export function decodeXmlEntities(text: string, named: Record<string, string> = XML_ENTITIES): string {
  if (!text.includes('&')) return text
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '�'
      return String.fromCodePoint(code)
    }
    return named[ref] ?? whole
  })
}

/** `w:p` → `p`, `x:row` → `row`: what a part means by a name, whatever prefix it bound its namespace to. */
export const localName = (qualified: string): string => {
  const colon = qualified.indexOf(':')
  return colon === -1 ? qualified : qualified.slice(colon + 1)
}

/** The tags and text of an XML document, in order. Comments, processing instructions and a DOCTYPE are skipped. */
export function* xmlTokens(xml: string): Generator<XmlToken> {
  let i = 0
  const n = xml.length
  while (i < n) {
    const lt = xml.indexOf('<', i)
    if (lt === -1) {
      const tail = xml.slice(i)
      if (tail) yield { kind: 'text', text: decodeXmlEntities(tail) }
      return
    }
    if (lt > i) yield { kind: 'text', text: decodeXmlEntities(xml.slice(i, lt)) }

    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4)
      i = end === -1 ? n : end + 3
      continue
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9)
      yield { kind: 'text', text: xml.slice(lt + 9, end === -1 ? n : end) }
      i = end === -1 ? n : end + 3
      continue
    }
    if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2)
      i = end === -1 ? n : end + 2
      continue
    }
    if (xml.startsWith('<!', lt)) {
      // A DOCTYPE, and its internal subset if it has one: skipped whole, never read.
      let depth = 0
      let j = lt + 2
      for (; j < n; j++) {
        const ch = xml[j]
        if (ch === '[') depth++
        else if (ch === ']') depth--
        else if (ch === '>' && depth <= 0) break
      }
      i = j + 1
      continue
    }

    const gt = findTagEnd(xml, lt + 1)
    if (gt === -1) return
    let body = xml.slice(lt + 1, gt)
    i = gt + 1
    if (body[0] === '/') {
      yield { kind: 'close', name: body.slice(1).trim() }
      continue
    }
    const selfClosing = body.endsWith('/')
    if (selfClosing) body = body.slice(0, -1)
    const nameEnd = body.search(/[\s]/)
    const name = nameEnd === -1 ? body : body.slice(0, nameEnd)
    const attrs: Record<string, string> = {}
    if (nameEnd !== -1) {
      const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g
      let m: RegExpExecArray | null
      const rest = body.slice(nameEnd)
      while ((m = re.exec(rest))) attrs[m[1]] = decodeXmlEntities(m[3] ?? m[4] ?? '')
    }
    yield { kind: 'open', name, attrs, selfClosing }
  }
}

/** The `>` that ends a tag, past any `>` inside a quoted attribute value. */
function findTagEnd(xml: string, from: number): number {
  let quote = ''
  for (let j = from; j < xml.length; j++) {
    const ch = xml[j]
    if (quote) {
      if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '>') return j
  }
  return -1
}

/** An attribute by its local name, whatever its prefix (`r:id`, `w:val`). */
export function attr(attrs: Record<string, string>, local: string): string | undefined {
  if (local in attrs) return attrs[local]
  for (const key of Object.keys(attrs)) if (localName(key) === local) return attrs[key]
  return undefined
}
