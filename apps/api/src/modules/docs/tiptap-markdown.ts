/**
 * Convert a Tiptap/ProseMirror document (the JSON shape stored in docs.content)
 * to GitHub-flavored Markdown. Pure + dependency-free so it's trivially testable
 * and safe to run on the request path.
 */

type Mark = { type: string; attrs?: Record<string, unknown> }
type Node = {
  type?: string
  text?: string
  content?: Node[]
  attrs?: Record<string, unknown>
  marks?: Mark[]
}

/** Apply inline marks to a text run (code innermost → link outermost). */
function applyMarks(text: string, marks: Mark[] = []): string {
  if (!text) return text
  let out = text
  const has = (t: string) => marks.some((m) => m.type === t)
  if (has('code')) out = `\`${out}\``
  if (has('bold') || has('strong')) out = `**${out}**`
  if (has('italic') || has('em')) out = `*${out}*`
  if (has('strike')) out = `~~${out}~~`
  const link = marks.find((m) => m.type === 'link')
  if (link) {
    const href = typeof link.attrs?.href === 'string' ? link.attrs.href : ''
    if (href) out = `[${out}](${href})`
  }
  return out
}

/** Render a node's inline children (text runs, hard breaks, inline images). */
function renderInline(nodes: Node[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === 'text') return applyMarks(n.text ?? '', n.marks)
      if (n.type === 'hardBreak') return '\n'
      if (n.type === 'image') {
        const src = typeof n.attrs?.src === 'string' ? n.attrs.src : ''
        const alt = typeof n.attrs?.alt === 'string' ? n.attrs.alt : ''
        return src ? `![${alt}](${src})` : ''
      }
      // Fallback: descend into anything else that carries inline content.
      if (n.content) return renderInline(n.content)
      return ''
    })
    .join('')
}

/** Render list items with the given bullet/number, indenting nested lists. */
function renderList(node: Node, ordered: boolean, depth: number): string {
  const indent = '  '.repeat(depth)
  const items = (node.content ?? []).map((item, i) => {
    let marker: string
    if (node.type === 'taskList') {
      const checked = item.attrs?.checked === true
      marker = `- [${checked ? 'x' : ' '}] `
    } else {
      marker = ordered ? `${i + 1}. ` : '- '
    }
    // A list item is paragraphs (inline) plus possibly nested lists.
    const lines: string[] = []
    for (const child of item.content ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList' || child.type === 'taskList') {
        lines.push(renderList(child, child.type === 'orderedList', depth + 1).replace(/\n+$/, ''))
      } else {
        lines.push(renderInline(child.content))
      }
    }
    const [first, ...rest] = lines
    const body = [`${indent}${marker}${first ?? ''}`, ...rest].join('\n')
    return body
  })
  return items.join('\n') + '\n\n'
}

function renderBlock(node: Node, depth = 0): string {
  switch (node.type) {
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6)
      return `${'#'.repeat(level)} ${renderInline(node.content)}\n\n`
    }
    case 'paragraph':
      return `${renderInline(node.content)}\n\n`
    case 'bulletList':
      return renderList(node, false, depth)
    case 'orderedList':
      return renderList(node, true, depth)
    case 'taskList':
      return renderList(node, false, depth)
    case 'blockquote':
      return (
        (node.content ?? [])
          .map((c) => renderBlock(c, depth).trim())
          .filter(Boolean)
          .map((line) => line.split('\n').map((l) => `> ${l}`).join('\n'))
          .join('\n> \n') + '\n\n'
      )
    case 'codeBlock': {
      const lang = typeof node.attrs?.language === 'string' ? node.attrs.language : ''
      const code = (node.content ?? []).map((c) => c.text ?? '').join('')
      return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`
    }
    case 'horizontalRule':
      return `---\n\n`
    // A5.8 blocks. A callout is a plain wrapper, so the default descend below
    // already handles it; these two would otherwise export as loose paragraphs
    // (table) or vanish entirely (the atom list embed).
    case 'table':
      return renderTable(node)
    case 'listEmbed': {
      const name = typeof node.attrs?.listName === 'string' ? node.attrs.listName : ''
      return `> **Embedded list:** ${name || 'Untitled list'}\n\n`
    }
    default:
      // Unknown block: descend if it has children, else drop.
      return node.content ? node.content.map((c) => renderBlock(c, depth)).join('') : ''
  }
}

/** GFM table. The first row is the header when it holds tableHeader cells. */
function renderTable(node: Node): string {
  const rows = (node.content ?? []).map((row) =>
    (row.content ?? []).map((cell) =>
      (cell.content ?? [])
        .map((block) => renderInline(block.content))
        .join(' ')
        .replace(/\|/g, '\\|')
        .trim(),
    ),
  )
  if (rows.length === 0) return ''
  const width = Math.max(...rows.map((r) => r.length))
  const pad = (cells: string[]) => Array.from({ length: width }, (_, i) => cells[i] ?? '')
  const firstIsHeader = (node.content?.[0]?.content ?? []).some((c) => c.type === 'tableHeader')
  const header = firstIsHeader ? pad(rows[0]) : Array.from({ length: width }, () => '')
  const body = firstIsHeader ? rows.slice(1) : rows
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
    ...body.map((r) => `| ${pad(r).join(' | ')} |`),
  ]
  return lines.join('\n') + '\n\n'
}

/** Plain text of an inline run (marks stripped), hard breaks as newlines. */
function plainInline(nodes: Node[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === 'text') return n.text ?? ''
      if (n.type === 'hardBreak') return '\n'
      if (n.content) return plainInline(n.content)
      return ''
    })
    .join('')
}

function linesForList(node: Node, ordered: boolean, depth: number, out: string[]): void {
  const pad = '  '.repeat(depth)
  ;(node.content ?? []).forEach((item, i) => {
    let marker: string
    if (node.type === 'taskList') marker = item.attrs?.checked === true ? '[x] ' : '[ ] '
    else marker = ordered ? `${i + 1}. ` : '- '
    for (const child of item.content ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList' || child.type === 'taskList') {
        linesForList(child, child.type === 'orderedList', depth + 1, out)
      } else {
        const text = plainInline(child.content).split('\n')
        text.forEach((t, ti) => out.push(ti === 0 ? `${pad}${marker}${t}` : `${pad}   ${t}`))
      }
    }
  })
}

function linesForBlock(node: Node, out: string[]): void {
  switch (node.type) {
    case 'heading': {
      const text = plainInline(node.content)
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6)
      out.push('')
      out.push(text)
      if (level === 1) out.push('='.repeat(Math.min(text.length, 72)))
      else if (level === 2) out.push('-'.repeat(Math.min(text.length, 72)))
      break
    }
    case 'paragraph': {
      const text = plainInline(node.content)
      text.split('\n').forEach((t) => out.push(t))
      out.push('')
      break
    }
    case 'bulletList':
      linesForList(node, false, 0, out); out.push('')
      break
    case 'orderedList':
      linesForList(node, true, 0, out); out.push('')
      break
    case 'taskList':
      linesForList(node, false, 0, out); out.push('')
      break
    case 'blockquote':
      for (const c of node.content ?? []) {
        const before = out.length
        linesForBlock(c, out)
        for (let i = before; i < out.length; i++) if (out[i]) out[i] = `> ${out[i]}`
      }
      break
    case 'codeBlock':
      for (const l of (node.content ?? []).map((c) => c.text ?? '').join('').split('\n')) out.push(`    ${l}`)
      out.push('')
      break
    case 'horizontalRule':
      out.push('─'.repeat(40)); out.push('')
      break
    case 'table':
      // The PDF writer is line-based, so a table becomes tab-joined rows.
      for (const row of node.content ?? []) {
        out.push((row.content ?? []).map((cell) => plainInline(cell.content).trim()).join('\t'))
      }
      out.push('')
      break
    case 'listEmbed': {
      const name = typeof node.attrs?.listName === 'string' ? node.attrs.listName : ''
      out.push(`[Embedded list: ${name || 'Untitled list'}]`)
      out.push('')
      break
    }
    default:
      if (node.content) for (const c of node.content) linesForBlock(c, out)
  }
}

/**
 * Flatten a Tiptap doc to plain text lines for the line-based PDF writer.
 * Marks are stripped; headings are underlined; lists get plain markers.
 */
export function tiptapToPlainLines(content: unknown): string[] {
  if (!content || typeof content !== 'object') return []
  const root = content as Node
  const out: string[] = []
  for (const b of root.content ?? []) linesForBlock(b, out)
  // Trim leading/trailing blanks and collapse 2+ consecutive blank lines.
  const collapsed: string[] = []
  for (const l of out) {
    if (l === '' && collapsed[collapsed.length - 1] === '') continue
    collapsed.push(l)
  }
  while (collapsed[0] === '') collapsed.shift()
  while (collapsed[collapsed.length - 1] === '') collapsed.pop()
  return collapsed
}

export function tiptapToMarkdown(content: unknown): string {
  if (!content || typeof content !== 'object') return ''
  const root = content as Node
  const blocks = root.content ?? []
  const md = blocks.map((b) => renderBlock(b)).join('')
  // Collapse 3+ blank lines and trim trailing whitespace.
  return md.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

/*
 * ─── THE INVERSE ──────────────────────────────────────────────────────────
 *
 * §V2-S13 frame `12:05` — the Imports submenu's second row, **Document files**.
 *
 * WHAT A DOCUMENT IMPORT SHOULD DO WAS NOT IN ANY FRAME. The submenu draws the
 * row and nothing opens it, so the honest way to decide was to look at what
 * this product already does: `tiptapToMarkdown` above turns a Doc into
 * GitHub-flavoured Markdown, and `GET /docs/:id/export` already serves it as
 * `text/markdown`. Import is that function run backwards, which is a
 * specification the repository wrote for itself.
 *
 * AND IT HANDS US THE CHECK A FACADE CANNOT PASS. Export a doc, import the file
 * back, and the doc must be the same — the same shape as the cover upload's
 * byte-for-byte assertion, and worth far more than asserting that an import
 * "succeeded". An importer that produced one paragraph holding the whole file
 * would satisfy every other check anyone would think to write.
 *
 * WHY MARKDOWN AND TEXT AND NOTHING ELSE, which is a scope decision rather than
 * a shortcut. `ai/attachment-text.ts` already decided this question for the
 * knowledge indexer and said so in its own header: `text/*`, JSON and XML are
 * extracted, while PDF, Word, Excel and PowerPoint are "intentionally NOT
 * parsed" because they "would require a heavy parser dependency … out of
 * scope". Offering a Word import here would contradict a recorded decision AND
 * be the facade at document scale — which the import page's own header already
 * refuses for the ten named tools it draws as column presets.
 *
 * Pure and dependency-free, exactly as the export half is, so both directions
 * are testable together and neither can reach the network or the database.
 */

/** Inline: `code`, **bold**, *italic*, ~~strike~~, [text](href), ![alt](src). */
function parseInline(src: string): Node[] {
  const out: Node[] = []
  let text = ''
  const flush = (marks?: Mark[]) => {
    if (!text) return
    out.push(marks?.length ? { type: 'text', text, marks } : { type: 'text', text })
    text = ''
  }
  /*
   * CODE IS MATCHED FIRST AND ITS BODY IS NOT RE-SCANNED, because backticks
   * mean "literal" — `**not bold**` inside code is four asterisks and two
   * words. The exporter applies `code` innermost for the same reason, so the
   * two halves agree about precedence rather than each having an opinion.
   */
  const TOKEN =
    /(`[^`]+`)|(!\[[^\]]*\]\([^)]*\))|(\[[^\]]+\]\([^)]*\))|(\*\*[^*]+\*\*)|(~~[^~]+~~)|(\*[^*]+\*)/
  let rest = src
  while (rest) {
    const m = rest.match(TOKEN)
    if (!m || m.index === undefined) {
      text += rest
      break
    }
    text += rest.slice(0, m.index)
    const tok = m[0]
    flush()
    if (tok.startsWith('`')) {
      out.push({ type: 'text', text: tok.slice(1, -1), marks: [{ type: 'code' }] })
    } else if (tok.startsWith('![')) {
      const alt = tok.slice(2, tok.indexOf(']'))
      const src2 = tok.slice(tok.indexOf('](') + 2, -1)
      out.push({ type: 'image', attrs: { src: src2, alt } })
    } else if (tok.startsWith('[')) {
      const label = tok.slice(1, tok.indexOf(']'))
      const href = tok.slice(tok.indexOf('](') + 2, -1)
      out.push(...parseInline(label).map((n) => addMark(n, { type: 'link', attrs: { href } })))
    } else if (tok.startsWith('**')) {
      out.push(...parseInline(tok.slice(2, -2)).map((n) => addMark(n, { type: 'bold' })))
    } else if (tok.startsWith('~~')) {
      out.push(...parseInline(tok.slice(2, -2)).map((n) => addMark(n, { type: 'strike' })))
    } else {
      out.push(...parseInline(tok.slice(1, -1)).map((n) => addMark(n, { type: 'italic' })))
    }
    rest = rest.slice(m.index + tok.length)
  }
  flush()
  return out
}

/** Add a mark to a text node, keeping any it already carries. */
function addMark(node: Node, mark: Mark): Node {
  if (node.type !== 'text') return node
  return { ...node, marks: [...(node.marks ?? []), mark] }
}

const para = (line: string): Node => ({ type: 'paragraph', content: parseInline(line) })

/**
 * Parse Markdown into the Tiptap/ProseMirror JSON stored in `docs.content`.
 *
 * The inverse of `tiptapToMarkdown`, and deliberately covering exactly the
 * blocks that one EMITS — headings, paragraphs, the three list kinds with
 * nesting, blockquotes, fenced code, horizontal rules and GFM tables — so that
 * a document exported from this product and imported back is the same document.
 * Anything it does not recognise becomes a paragraph rather than being dropped:
 * losing a line silently is worse than keeping it in the wrong shape, because
 * the second is visible to whoever imported it.
 */
export function markdownToTiptap(md: string): { type: 'doc'; content: Node[] } {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n')
  const content: Node[] = []
  let i = 0

  const listItemAt = (line: string) => {
    const m = line.match(/^(\s*)(?:([-*+])|(\d+)\.)\s+(.*)$/)
    if (!m) return null
    const indent = Math.floor(m[1].length / 2)
    const rest = m[4]
    const task = rest.match(/^\[([ xX])\]\s+(.*)$/)
    return {
      indent,
      ordered: m[3] !== undefined,
      checked: task ? task[1].toLowerCase() === 'x' : null,
      text: task ? task[2] : rest,
    }
  }

  /*
   * A list is consumed as a RUN of item lines at or below the opening indent,
   * and nesting recurses on the deeper ones. Written this way rather than with
   * a running stack because the exporter indents nested lists by exactly two
   * spaces per level — the two halves agree on the unit, so the reader does not
   * have to guess what an indent means.
   */
  const takeList = (depth: number): Node | null => {
    const first = listItemAt(lines[i])
    if (!first || first.indent < depth) return null
    const ordered = first.ordered
    const isTask = first.checked !== null
    const items: Node[] = []
    while (i < lines.length) {
      const here = listItemAt(lines[i])
      if (!here || here.indent < depth) break
      if (here.indent > depth) {
        const nested = takeList(here.indent)
        if (nested && items.length) (items[items.length - 1].content ??= []).push(nested)
        continue
      }
      if (here.ordered !== ordered || (here.checked !== null) !== isTask) break
      i += 1
      const item: Node = {
        type: isTask ? 'taskItem' : 'listItem',
        content: [para(here.text)],
      }
      if (isTask) item.attrs = { checked: here.checked === true }
      items.push(item)
    }
    if (!items.length) return null
    return { type: isTask ? 'taskList' : ordered ? 'orderedList' : 'bulletList', content: items }
  }

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i += 1
      continue
    }

    // Fenced code. The closing fence is optional: a truncated file should
    // import the code it has rather than refuse the whole document.
    const fence = line.match(/^```(\w*)\s*$/)
    if (fence) {
      i += 1
      const code: string[] = []
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++])
      if (i < lines.length) {
        i += 1
      } else {
        /*
         * UNCLOSED, so the run ended at the end of the FILE — and a file ends
         * with a newline, which `split('\n')` turns into a trailing empty
         * element. Kept, it becomes a blank last line inside the code, so a
         * truncated file imports code the author never wrote. A closed fence
         * never reaches this: its loop stops at the fence.
         */
        while (code.length && !code[code.length - 1].trim()) code.pop()
      }
      const node: Node = { type: 'codeBlock', content: [{ type: 'text', text: code.join('\n') }] }
      if (fence[1]) node.attrs = { language: fence[1] }
      content.push(node)
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      content.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        content: parseInline(heading[2]),
      })
      i += 1
      continue
    }

    if (/^(---|___|\*\*\*)\s*$/.test(line)) {
      content.push({ type: 'horizontalRule' })
      i += 1
      continue
    }

    // GFM table: a header row, a delimiter row of dashes, then body rows.
    if (/^\|.*\|\s*$/.test(line) && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      const cells = (row: string) =>
        row.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim())
      const header = cells(line)
      i += 2
      const rows: Node[] = [
        {
          type: 'tableRow',
          content: header.map((c) => ({ type: 'tableHeader', content: [para(c)] })),
        },
      ]
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        rows.push({
          type: 'tableRow',
          content: cells(lines[i++]).map((c) => ({ type: 'tableCell', content: [para(c)] })),
        })
      }
      content.push({ type: 'table', content: rows })
      continue
    }

    if (/^>\s?/.test(line)) {
      const quoted: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) quoted.push(lines[i++].replace(/^>\s?/, ''))
      const inner = markdownToTiptap(quoted.join('\n'))
      content.push({ type: 'blockquote', content: inner.content })
      continue
    }

    const list = takeList(listItemAt(line)?.indent ?? 0)
    if (list) {
      content.push(list)
      continue
    }

    /*
     * A PARAGRAPH IS ITS CONSECUTIVE LINES, joined by hard breaks. The exporter
     * emits `hardBreak` for a soft line break inside a paragraph, so joining
     * with a space here would lose it and the round trip would fail on any doc
     * containing one.
     */
    const run: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|```|\|)/.test(lines[i]) && !listItemAt(lines[i])) {
      run.push(lines[i++])
    }
    const inline: Node[] = []
    run.forEach((l, n) => {
      if (n > 0) inline.push({ type: 'hardBreak' })
      inline.push(...parseInline(l))
    })
    content.push({ type: 'paragraph', content: inline })
  }

  return { type: 'doc', content }
}

/**
 * Split an imported file into the doc's TITLE and its remaining content.
 *
 * Lives here, beside both converters, because it is the half of the round trip
 * that neither of them covers: a doc's title is stored outside its content, so
 * `exportDocMarkdown` prepends `# <title>` when the body has no leading H1 and
 * this must consume one. An importer that did not would give the doc a
 * duplicate heading, and every further export/import cycle would add another —
 * while the CONTENT round trip stayed green throughout, because the content
 * really is preserved. It is the document that drifts.
 *
 * EXPORTED RATHER THAN INLINED IN THE SERVICE so the test exercises the rule
 * the service actually uses. A test that re-implements the rule it is checking
 * is the duplicated list: the two copies can disagree and the test still
 * passes. This was written the wrong way round first.
 *
 * Only a LEADING h1 counts. A `# ` further down is a section of the document,
 * and promoting it would silently reorder the reader's own headings.
 */
export function splitTitleFromMarkdown(
  md: string,
  fileName = '',
): { title: string; content: { type: 'doc'; content: Node[] } } {
  const content = markdownToTiptap(md)
  let title = ''
  const first = content.content[0]
  if (first?.type === 'heading' && Number(first.attrs?.level) === 1) {
    content.content.shift()
    title = (first.content ?? []).map((n) => n.text ?? '').join('').trim()
  }
  if (!title) title = String(fileName ?? '').replace(/\.(md|markdown|txt)$/i, '').trim()
  return { title: title || 'Untitled', content }
}
