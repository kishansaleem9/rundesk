import { Fragment } from 'react'
import { cn } from '@rundesk/ui'
import { parseMentionSegments } from '../../lib/mentions'
import { renderInlineMarkdown } from '../markdown'

/**
 * Renders a chat message body with inline markdown (bold, italic, `code`,
 * links) plus @-mention chips (Plan §6.3 markdown composer). Mentions are split
 * out first so markdown never eats a mention token; each text run is passed
 * through the shared inline-markdown renderer.
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
  const segments = parseMentionSegments(text, namesById, 'teammate')
  return (
    <span className={cn('whitespace-pre-wrap break-words', className)}>
      {segments.map((seg, i) =>
        seg.type === 'mention' ? (
          <span
            key={`${seg.userId}-${i}`}
            className="inline-flex items-center rounded-md bg-accent/15 px-1.5 py-0.5 text-[0.92em] font-medium text-accent align-baseline"
          >
            @{seg.label}
          </span>
        ) : (
          <Fragment key={`t-${i}`}>{renderInlineMarkdown(seg.value, `t${i}`)}</Fragment>
        ),
      )}
    </span>
  )
}
