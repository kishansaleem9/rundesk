import type { ReactNode } from 'react'
import { AtSign, Paperclip, Send, Smile, Sparkles } from 'lucide-react'
import { Button, Textarea, cn } from '@rundesk/ui'
import { formatMentionsPlain } from '../../lib/mentions'
import type { ChatMessage } from './chat-types'

export function ChatComposer({
  channelLabel,
  value,
  onChange,
  onSend,
  disabled,
  sending,
  replyTo,
  replyNamesById,
  onCancelReply,
  mentionMenu,
}: {
  channelLabel: string
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled: boolean
  sending: boolean
  replyTo: ChatMessage | null
  replyNamesById: Record<string, string>
  onCancelReply: () => void
  mentionMenu?: ReactNode
}) {
  return (
    <div className="shrink-0 border-t border-border/80 bg-[#fbfbfc] dark:bg-[#16181d] px-4 py-3">
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-violet-500/25 bg-violet-500/5 px-3 py-2 text-[12px]">
          <span className="text-muted-foreground shrink-0">Replying to</span>
          <span className="font-medium text-foreground truncate flex-1">
            {replyTo.authorName ?? 'message'}: {formatMentionsPlain(replyTo.body, replyNamesById)}
          </span>
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground shrink-0"
            onClick={onCancelReply}
          >
            Cancel
          </button>
        </div>
      )}

      {mentionMenu}

      <div className="rounded-xl border border-border/80 bg-background shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none overflow-hidden focus-within:border-violet-500/40 focus-within:ring-2 focus-within:ring-violet-500/15 transition-shadow">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={channelLabel ? `Message ${channelLabel}` : 'Select a channel'}
          disabled={disabled}
          rows={2}
          className="min-h-[44px] max-h-40 resize-none border-0 bg-transparent px-3 py-2.5 text-[14px] leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
        />
        <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-t border-border/60 bg-muted/20">
          <div className="flex items-center gap-0.5">
            <ToolBtn icon={Smile} title="Emoji" />
            <ToolBtn icon={Paperclip} title="Attach" />
            <ToolBtn icon={AtSign} title="Mention" />
            <ToolBtn icon={Sparkles} title="Ask AI" />
          </div>
          <Button
            size="sm"
            className="h-8 px-3 rounded-lg bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
            onClick={onSend}
            disabled={!value.trim() || disabled || sending}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground mt-1.5 px-0.5">
        <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Enter</kbd> to send ·{' '}
        <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Shift + Enter</kbd> new line
      </p>
    </div>
  )
}

function ToolBtn({ icon: Icon, title }: { icon: typeof Smile; title: string }) {
  return (
    <button
      type="button"
      title={title}
      className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}
