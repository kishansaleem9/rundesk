import { Fragment, type ReactNode } from 'react'

/**
 * A tiny, dependency-free Markdown renderer (Plan §4 rich-text descriptions).
 *
 * It renders to React nodes — never to raw HTML / dangerouslySetInnerHTML — so
 * it is XSS-safe by construction: user text can only ever become text nodes or
 * a fixed set of elements, and link hrefs are sanitised to a safe scheme.
 *
 * Supported: headings, bold, italic, inline code, links, bare URLs,
 * unordered/ordered lists, blockquotes, fenced code blocks, horizontal rules
 * and paragraphs. Good enough for task descriptions without pulling in a full
 * CommonMark parser.
 */

function safeHref(raw: string): string | null {
  const url = raw.trim()
  if (/^(https?:|mailto:)/i.test(url)) return url
  if (url.startsWith('/') || url.startsWith('#')) return url
  return null
}

// Inline parsing → React nodes. Order matters: code spans first (their content
// is literal), then links, then bold, then italic.
export function renderInlineMarkdown(text: string, keyPrefix = 'i'): ReactNode[] {
  return parseInline(text, keyPrefix)
}

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let rest = text
  let k = 0
  // Combined matcher for the next inline token. Order matters: code spans first
  // (literal content), then links, then ~~strike~~, **bold**, *italic*, bare URL.
  const token = /(`[^`]+`)|(\[[^\]]+\]\([^)\s]+\))|(~~[^~]+~~)|(\*\*[^*]+\*\*)|(\*[^*]+\*|_[^_]+_)|((?:https?:\/\/|www\.)[^\s)]+)/

  while (rest.length > 0) {
    const m = token.exec(rest)
    if (!m) {
      nodes.push(rest)
      break
    }
    if (m.index > 0) nodes.push(rest.slice(0, m.index))
    const matched = m[0]
    const key = `${keyPrefix}-${k++}`

    if (m[1]) {
      // `code`
      nodes.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.85em] font-mono">
          {matched.slice(1, -1)}
        </code>,
      )
    } else if (m[2]) {
      // [text](url)
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(matched)
      const href = link ? safeHref(link[2]) : null
      if (link && href) {
        nodes.push(
          <a key={key} href={href} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
            {link[1]}
          </a>,
        )
      } else {
        nodes.push(matched)
      }
    } else if (m[3]) {
      // ~~strikethrough~~
      nodes.push(<del key={key}>{parseInline(matched.slice(2, -2), key)}</del>)
    } else if (m[4]) {
      // **bold**
      nodes.push(<strong key={key}>{parseInline(matched.slice(2, -2), key)}</strong>)
    } else if (m[5]) {
      // *italic* or _italic_
      nodes.push(<em key={key}>{parseInline(matched.slice(1, -1), key)}</em>)
    } else if (m[6]) {
      // bare URL
      const withProto = matched.startsWith('www.') ? `https://${matched}` : matched
      const href = safeHref(withProto)
      nodes.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
            {matched}
          </a>
        ) : (
          matched
        ),
      )
    }
    rest = rest.slice(m.index + matched.length)
  }
  return nodes
}

/** Inline renderer signature — lets callers (e.g. chat) inject mention chips. */
export type InlineRenderer = (text: string, keyPrefix: string) => ReactNode[]

/**
 * True when `text` uses any block-level Markdown (fenced code, headings,
 * blockquotes, lists, horizontal rules). Lets chat keep the cheap inline path
 * for ordinary one-line messages and only reach for full block rendering when
 * the author actually wrote a list / quote / code block.
 */
export function hasBlockMarkdown(text: string): boolean {
  if (!text) return false
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim()
    if (line.startsWith('```')) return true
    if (/^#{1,3}\s+/.test(line)) return true
    if (/^>\s?/.test(line)) return true
    if (/^[-*]\s+/.test(line)) return true
    if (/^\d+\.\s+/.test(line)) return true
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) return true
  }
  return false
}

/**
 * Render a Markdown source string to block-level React nodes. `inline` defaults
 * to the shared inline parser, but callers can pass a custom one — chat injects
 * a renderer that turns @-mentions into chips before applying inline markdown.
 */
export function renderMarkdownBlocks(source: string, inline: InlineRenderer = parseInline): ReactNode[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    if (/^```/.test(line.trim())) {
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        buf.push(lines[i])
        i++
      }
      i++ // closing fence
      blocks.push(
        <pre key={key++} className="my-2 overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono">
          <code>{buf.join('\n')}</code>
        </pre>,
      )
      continue
    }

    // Blank line
    if (line.trim() === '') {
      i++
      continue
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push(<hr key={key++} className="my-3 border-border" />)
      i++
      continue
    }

    // Heading
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      const content = inline(heading[2], `h${key}`)
      blocks.push(
        level === 1 ? (
          <h3 key={key++} className="mt-3 mb-1 text-base font-semibold">{content}</h3>
        ) : level === 2 ? (
          <h4 key={key++} className="mt-3 mb-1 text-sm font-semibold">{content}</h4>
        ) : (
          <h5 key={key++} className="mt-2 mb-1 text-sm font-medium">{content}</h5>
        ),
      )
      i++
      continue
    }

    // Blockquote (consecutive > lines)
    if (/^>\s?/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      blocks.push(
        <blockquote key={key++} className="my-2 border-l-2 border-border pl-3 text-muted-foreground">
          {inline(buf.join(' '), `q${key}`)}
        </blockquote>,
      )
      continue
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        i++
      }
      const listKey = key++
      blocks.push(
        <ul key={listKey} className="my-2 list-disc space-y-0.5 pl-5">
          {items.map((it, idx) => (
            <li key={idx}>{inline(it, `ul${listKey}-${idx}`)}</li>
          ))}
        </ul>,
      )
      continue
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      const listKey = key++
      blocks.push(
        <ol key={listKey} className="my-2 list-decimal space-y-0.5 pl-5">
          {items.map((it, idx) => (
            <li key={idx}>{inline(it, `ol${listKey}-${idx}`)}</li>
          ))}
        </ol>,
      )
      continue
    }

    // Paragraph (gather consecutive non-blank, non-special lines)
    const buf: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i].trim()) &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      buf.push(lines[i])
      i++
    }
    const paraKey = key++
    blocks.push(
      <p key={paraKey} className="my-1 leading-relaxed">
        {buf.map((ln, idx) => (
          <Fragment key={idx}>
            {idx > 0 && <br />}
            {inline(ln, `p${paraKey}-${idx}`)}
          </Fragment>
        ))}
      </p>,
    )
  }

  return blocks
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  return <div className={className}>{renderMarkdownBlocks(source)}</div>
}
