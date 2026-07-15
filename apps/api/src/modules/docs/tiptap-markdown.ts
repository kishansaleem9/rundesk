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
    default:
      // Unknown block: descend if it has children, else drop.
      return node.content ? node.content.map((c) => renderBlock(c, depth)).join('') : ''
  }
}

export function tiptapToMarkdown(content: unknown): string {
  if (!content || typeof content !== 'object') return ''
  const root = content as Node
  const blocks = root.content ?? []
  const md = blocks.map((b) => renderBlock(b)).join('')
  // Collapse 3+ blank lines and trim trailing whitespace.
  return md.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
