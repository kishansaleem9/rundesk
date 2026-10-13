import { htmlToTiptap } from '../../docs/html-tiptap'
import { tiptapToMarkdown } from '../../docs/tiptap-markdown'

/**
 * A TOOL'S RICH TEXT AS THE MARKDOWN A TASK'S DESCRIPTION AND COMMENTS HOLD
 * (`found-13-oct/importers-by-sign-in-unbuilt`): Asana's and Wrike's HTML
 * through the Docs importer's own reading of HTML, and Jira's Atlassian
 * Document Format node by node.
 */

export function htmlToMarkdown(html: string | null | undefined): string {
  if (!html || !html.trim()) return ''
  return tiptapToMarkdown(htmlToTiptap(html)).trim()
}

type Adf = { type?: string; text?: string; content?: Adf[]; attrs?: Record<string, unknown>; marks?: Array<{ type?: string; attrs?: Record<string, unknown> }> }

/** Jira's Atlassian Document Format (REST API v3) as Markdown; a v2 string as it is. */
export function adfToMarkdown(doc: unknown): string {
  if (typeof doc === 'string') return doc.trim()
  if (!doc || typeof doc !== 'object') return ''
  return block(doc as Adf, '').trim()
}

function inline(nodes: Adf[] | undefined): string {
  return (nodes ?? []).map(inlineNode).join('')
}

function inlineNode(n: Adf): string {
  switch (n.type) {
    case 'text': {
      let t = n.text ?? ''
      for (const m of n.marks ?? []) {
        if (m.type === 'strong') t = `**${t}**`
        else if (m.type === 'em') t = `_${t}_`
        else if (m.type === 'code') t = `\`${t}\``
        else if (m.type === 'strike') t = `~~${t}~~`
        else if (m.type === 'link' && typeof m.attrs?.href === 'string') t = `[${t}](${m.attrs.href})`
      }
      return t
    }
    case 'hardBreak':
      return '\n'
    case 'mention':
      return `@${String(n.attrs?.text ?? '').replace(/^@/, '')}`
    case 'emoji':
      return String(n.attrs?.text ?? n.attrs?.shortName ?? '')
    case 'inlineCard':
      return String(n.attrs?.url ?? '')
    case 'status':
      return `[${String(n.attrs?.text ?? '')}]`
    case 'date':
      return n.attrs?.timestamp ? new Date(Number(n.attrs.timestamp)).toISOString().slice(0, 10) : ''
    default:
      return inline(n.content)
  }
}

function block(n: Adf, indent: string): string {
  switch (n.type) {
    case 'doc':
      return (n.content ?? []).map((c) => block(c, indent)).filter((s) => s.trim()).join('\n\n')
    case 'paragraph':
      return indent + inline(n.content)
    case 'heading':
      return `${'#'.repeat(Math.min(Math.max(Number(n.attrs?.level ?? 1), 1), 6))} ${inline(n.content)}`
    case 'bulletList':
    case 'orderedList':
      return (n.content ?? [])
        .map((item, i) => {
          const body = (item.content ?? []).map((c) => block(c, `${indent}  `).trim()).filter(Boolean).join(`\n${indent}  `)
          return `${indent}${n.type === 'bulletList' ? '-' : `${i + 1}.`} ${body}`
        })
        .join('\n')
    case 'codeBlock':
      return `\`\`\`${String(n.attrs?.language ?? '')}\n${inline(n.content)}\n\`\`\``
    case 'blockquote':
      return (n.content ?? []).map((c) => block(c, '')).join('\n\n').split('\n').map((l) => `> ${l}`).join('\n')
    case 'rule':
      return '---'
    case 'table':
      return (n.content ?? [])
        .map((row) => `| ${(row.content ?? []).map((cell) => (cell.content ?? []).map((c) => block(c, '')).join(' ').replace(/\|/g, '\\|')).join(' | ')} |`)
        .join('\n')
    case 'mediaSingle':
    case 'mediaGroup':
    case 'media':
      // The issue's files come in as its attachments.
      return ''
    case 'blockCard':
    case 'embedCard':
      return String(n.attrs?.url ?? '')
    case 'text':
    case 'hardBreak':
    case 'mention':
    case 'emoji':
    case 'inlineCard':
      return inlineNode(n)
    default:
      // A panel, an expand, a layout: what is inside it.
      return (n.content ?? []).map((c) => block(c, indent)).filter((s) => s.trim()).join('\n\n')
  }
}
