import { Download, FileText } from 'lucide-react'
import { cn } from '@rundesk/ui'
import type { ChatAttachment } from './chat-types'

/** Human-readable file size (e.g. "1.2 MB"). */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

/**
 * Renders the files attached to a chat message (Plan §6.8). Images preview
 * inline; everything else is a download chip. URLs are short-lived signed R2
 * links minted server-side, so we just link straight to them.
 */
export function ChatAttachmentList({
  attachments,
  className,
}: {
  attachments: ChatAttachment[]
  className?: string
}) {
  if (!attachments || attachments.length === 0) return null
  return (
    <div className={cn('mt-1.5 flex flex-wrap gap-2', className)}>
      {attachments.map((att) =>
        att.contentType.startsWith('image/') ? (
          <a
            key={att.id}
            href={att.url}
            target="_blank"
            rel="noopener noreferrer"
            title={att.fileName}
            className="block overflow-hidden rounded-lg border border-border/70 hover:border-border"
          >
            <img
              src={att.url}
              alt={att.fileName}
              loading="lazy"
              className="max-h-64 max-w-[320px] object-cover"
            />
          </a>
        ) : (
          <a
            key={att.id}
            href={att.url}
            target="_blank"
            rel="noopener noreferrer"
            download={att.fileName}
            title={`Download ${att.fileName}`}
            className="group inline-flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-2 text-[13px] hover:bg-muted/60 max-w-[280px]"
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex flex-col min-w-0">
              <span className="truncate font-medium text-foreground/90">{att.fileName}</span>
              {att.sizeBytes > 0 && <span className="text-[11px] text-muted-foreground">{formatBytes(att.sizeBytes)}</span>}
            </span>
            <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        ),
      )}
    </div>
  )
}
