import { Fragment, type ReactNode } from 'react'
import { cn } from '@rundesk/ui'
import { parseMentionSegments } from '../lib/mentions'
import { hasBlockMarkdown, renderInlineMarkdown, renderMarkdownBlocks } from './markdown'
import { splitAddresses } from '../lib/link-addresses'

type MentionTextProps = {
  text: string
  namesById: Record<string, string>
  className?: string
  mentionClassName?: string
  fallbackLabel?: string
  /*
   * §V2-S05c — render the body as markdown as well as mentions.
   *
   * OPT-IN, DELIBERATELY. Half of this component's callers are one-line
   * previews — notification rows, inbox summaries, `line-clamp-2` snippets —
   * where turning a leading "- " into a bullet or "```" into a code block would
   * make a preview taller than the row that holds it. So the surfaces that show
   * a WHOLE comment ask for it, and the previews keep the plain rendering they
   * were written for.
   */
  markdown?: boolean
}

/** An @-mention chip. Shared by the plain, inline and block paths. */
function chip(label: string, key: string, className?: string): ReactNode {
  return (
    <span
      key={key}
      className={cn(
        'inline-flex items-center rounded-md bg-accent/15 px-1.5 py-0.5 text-[0.92em] font-medium text-accent align-baseline',
        className,
      )}
    >
      @{label}
    </span>
  )
}

export function MentionText({
  text,
  namesById,
  className,
  mentionClassName,
  fallbackLabel = 'teammate',
  markdown = false,
}: MentionTextProps) {
  const segments = parseMentionSegments(text, namesById, fallbackLabel)

  if (markdown) {
    /*
     * MENTIONS ARE SPLIT OUT FIRST, then each remaining run goes through the
     * inline markdown parser — the same order chat uses, and for the same
     * reason: `@[id]` contains brackets, so letting markdown see it first lets
     * a link parser eat a person.
     */
    const inline = (value: string, keyPrefix: string): ReactNode[] =>
      parseMentionSegments(value, namesById, fallbackLabel).flatMap((seg, i) =>
        seg.type === 'mention'
          ? [chip(seg.label, `${keyPrefix}-m${i}`, mentionClassName)]
          : renderInlineMarkdown(seg.value, `${keyPrefix}-t${i}`),
      )

    /*
     * `hasBlockMarkdown` IS THE SAFE PATH THROUGH AN EXISTING CORPUS. Comments
     * have been stored and shown as plain text, so switching them to block
     * rendering wholesale would re-interpret everything anybody has ever
     * written. A comment with no block syntax takes the inline path and looks
     * exactly as it did; only one that actually contains a list, quote, table
     * or fence gets laid out as one. Chat reached the same conclusion first.
     */
    if (hasBlockMarkdown(text)) {
      return <div className={cn('break-words', className)}>{renderMarkdownBlocks(text, inline)}</div>
    }
    /*
     * NO INLINE MARKDOWN ON THE PLAIN PATH, and a check earned this the hard
     * way. The first version ran the inline parser here too, and a comment
     * written long before any of this — "file_name_here" — came back as
     * "filenamehere", because `_..._` is emphasis and the underscores were
     * consumed. That is not a formatting preference, it is losing characters
     * somebody typed.
     *
     * So the rule is: markdown applies to a comment that ACTUALLY CONTAINS
     * block markdown — a list, quote, table or fence, which nobody writes by
     * accident. Everything else renders byte for byte as it always has. The
     * cost is that `**bold**` in a one-line comment stays literal; the
     * alternative was re-interpreting every comment ever written.
     *
     * AN ADDRESS IS A LINK HERE TOO (`found-5-oct/comment-links-not-links`):
     * linking one adds nothing to the text and takes nothing from it, so it is
     * not the re-interpretation above (`splitAddresses`).
     */
    return (
      <span className={cn('whitespace-pre-wrap break-words', className)}>
        {parseMentionSegments(text, namesById, fallbackLabel).map((seg, i) =>
          seg.type === 'mention' ? (
            <Fragment key={`${seg.userId}-${i}`}>{chip(seg.label, `mi${i}`, mentionClassName)}</Fragment>
          ) : (
            <span key={`mt-${i}`}>
              {splitAddresses(seg.value).map((part, j) =>
                'href' in part ? (
                  <a
                    key={j}
                    href={part.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-accent hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {part.href}
                  </a>
                ) : (
                  part.text
                ),
              )}
            </span>
          ),
        )}
      </span>
    )
  }

  return (
    <span className={cn('whitespace-pre-wrap break-words', className)}>
      {segments.map((seg, i) =>
        seg.type === 'mention' ? (
          <Fragment key={`${seg.userId}-${i}`}>{chip(seg.label, `p${i}`, mentionClassName)}</Fragment>
        ) : (
          <span key={`t-${i}`}>{seg.value}</span>
        ),
      )}
    </span>
  )
}
