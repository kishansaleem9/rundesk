import { Fragment, type ReactNode } from 'react'
import { cn } from '@rundesk/ui'
import { parseMentionSegments } from '../../lib/mentions'
import { hasBlockMarkdown, renderInlineMarkdown, renderMarkdownBlocks } from '../markdown'

/** An @-mention chip. Shared by the inline and block rendering paths. */
function mentionChip(label: string, key: string): ReactNode {
  return (
    <span
      key={key}
      className="inline-flex items-center rounded-md bg-accent/15 px-1.5 py-0.5 text-[0.92em] font-medium text-accent align-baseline"
    >
      @{label}
    </span>
  )
}

/**
 * Inline renderer for chat: split @-mention tokens out FIRST (so markdown never
 * eats a mention), render them as chips, and pass every other text run through
 * the shared inline-markdown parser (bold/italic/strike/code/links). Reused for
 * every text position inside block markdown (list items, quotes, paragraphs).
 */
function chatInline(namesById: Record<string, string>) {
  return (text: string, keyPrefix: string): ReactNode[] => {
    const segments = parseMentionSegments(text, namesById, 'teammate')
    return segments.map((seg, i) =>
      seg.type === 'mention' ? (
        mentionChip(seg.label, `${keyPrefix}-m${i}`)
      ) : (
        <Fragment key={`${keyPrefix}-t${i}`}>{renderInlineMarkdown(seg.value, `${keyPrefix}-${i}`)}</Fragment>
      ),
    )
  }
}

/**
 * Renders a chat message body (Plan §6.3). Plain messages keep the cheap inline
 * path (mentions + inline markdown in a `whitespace-pre-wrap` span) so ordinary
 * one-liners aren't reflowed and stay fast. When the author uses block markdown
 * (lists, blockquotes, fenced code, headings, rules) we render the full block
 * layout instead, with mentions still rendered as chips inside every text run.
 */
export function ChatMessageBody({
  text,
  namesById,
  className,
}: {
  text: string
  namesById: Record<string, string>
  className?: string
}) {
  const inline = chatInline(namesById)

  if (hasBlockMarkdown(text)) {
    return (
      <div className={cn('break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0', className)}>
        {renderMarkdownBlocks(text, inline)}
      </div>
    )
  }

  return (
    <span className={cn('whitespace-pre-wrap break-words', className)}>
      {inline(text, 't')}
    </span>
  )
}
