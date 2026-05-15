import { cn } from '@rundesk/ui'
import { parseMentionSegments } from '../lib/mentions'

type MentionTextProps = {
  text: string
  namesById: Record<string, string>
  className?: string
  mentionClassName?: string
  fallbackLabel?: string
}

export function MentionText({
  text,
  namesById,
  className,
  mentionClassName,
  fallbackLabel = 'teammate',
}: MentionTextProps) {
  const segments = parseMentionSegments(text, namesById, fallbackLabel)
  return (
    <span className={cn('whitespace-pre-wrap break-words', className)}>
      {segments.map((seg, i) =>
        seg.type === 'mention' ? (
          <span
            key={`${seg.userId}-${i}`}
            className={cn(
              'inline-flex items-center rounded-md bg-accent/15 px-1.5 py-0.5 text-[0.92em] font-medium text-accent align-baseline',
              mentionClassName,
            )}
          >
            @{seg.label}
          </span>
        ) : (
          <span key={`t-${i}`}>{seg.value}</span>
        ),
      )}
    </span>
  )
}
