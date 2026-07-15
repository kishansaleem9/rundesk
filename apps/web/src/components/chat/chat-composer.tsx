import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { AtSign, Bold, Code, Italic, Paperclip, Send, Smile, Sparkles } from 'lucide-react'
import { Button, Popover, PopoverContent, PopoverTrigger, Textarea, cn, toast } from '@rundesk/ui'
import { api, ApiError } from '../../lib/api'
import { formatMentionsPlain } from '../../lib/mentions'
import type { ChatMessage } from './chat-types'

const COMMON_EMOJIS = ['😀', '👍', '🎉', '❤️', '🙏', '🔥', '✅', '👀', '🚀', '😂', '🙌', '💯']

/**
 * Shared editor surface (textarea + working toolbar). Used by both the main
 * channel composer and the thread reply composer so the icon row behaves
 * identically in both places.
 */
function ComposerBox({
  value,
  onChange,
  onSend,
  disabled,
  sending,
  placeholder,
  rows = 2,
  minHeightClass = 'min-h-[44px] max-h-40',
  sendLabel,
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled: boolean
  sending: boolean
  placeholder: string
  rows?: number
  minHeightClass?: string
  sendLabel?: string
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [improving, setImproving] = useState(false)

  // Insert text at the current cursor position (or append) and refocus.
  const insertAtCursor = (insert: string) => {
    const el = textareaRef.current
    if (!el) {
      onChange(value + insert)
      return
    }
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const next = value.slice(0, start) + insert + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      const caret = start + insert.length
      el.setSelectionRange(caret, caret)
    })
  }

  const handleMention = () => {
    insertAtCursor('@')
  }

  // Wrap the current selection (or a placeholder) in a markdown marker.
  const wrapSelection = (marker: string, placeholder: string) => {
    const el = textareaRef.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const selected = value.slice(start, end) || placeholder
    const next = value.slice(0, start) + marker + selected + marker + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      el?.focus()
      const s = start + marker.length
      el?.setSelectionRange(s, s + selected.length)
    })
  }

  const handleEmoji = (emoji: string) => {
    insertAtCursor(emoji)
    setEmojiOpen(false)
  }

  const handleAttachClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset so picking the same file again still fires onChange.
    event.target.value = ''
    if (!file) return
    insertAtCursor(`[${file.name}]`)
    toast('Inline file upload isn’t available yet — the file name was added to your message.')
  }

  const handleAskAi = async () => {
    const text = value.trim()
    if (!text) {
      toast('Type a message first, then Ask AI to improve it.')
      return
    }
    setImproving(true)
    try {
      const result = await api<{ improved: string }>('/ai/writing/improve', {
        method: 'POST',
        body: { text, mode: 'improve' },
      })
      onChange(result.improved)
      textareaRef.current?.focus()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not improve writing')
    } finally {
      setImproving(false)
    }
  }

  return (
    <div className="rounded-xl border border-border/80 bg-background shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none overflow-hidden focus-within:border-violet-500/40 focus-within:ring-2 focus-within:ring-violet-500/15 transition-shadow">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={cn(
          minHeightClass,
          'resize-none border-0 bg-transparent px-3 py-2.5 text-[14px] leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0',
        )}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSend()
          }
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelected}
      />
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-t border-border/60 bg-muted/20">
        <div className="flex items-center gap-0.5">
          <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title="Emoji"
                disabled={disabled}
                className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Smile className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-2">
              <div className="grid grid-cols-6 gap-1">
                {COMMON_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="h-8 w-8 rounded-md text-lg hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
                    onClick={() => handleEmoji(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <ToolBtn icon={Bold} title="Bold" disabled={disabled} onClick={() => wrapSelection('**', 'bold')} />
          <ToolBtn icon={Italic} title="Italic" disabled={disabled} onClick={() => wrapSelection('*', 'italic')} />
          <ToolBtn icon={Code} title="Code" disabled={disabled} onClick={() => wrapSelection('`', 'code')} />
          <ToolBtn icon={Paperclip} title="Attach" disabled={disabled} onClick={handleAttachClick} />
          <ToolBtn icon={AtSign} title="Mention" disabled={disabled} onClick={handleMention} />
          <ToolBtn
            icon={Sparkles}
            title="Ask AI"
            disabled={disabled || improving}
            loading={improving}
            onClick={() => void handleAskAi()}
          />
        </div>
        <Button
          size="sm"
          className="h-8 px-3 rounded-lg bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
          onClick={onSend}
          disabled={!value.trim() || disabled || sending}
        >
          {sendLabel ? <span className="text-[13px]">{sendLabel}</span> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

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

      <ComposerBox
        value={value}
        onChange={onChange}
        onSend={onSend}
        disabled={disabled}
        sending={sending}
        placeholder={channelLabel ? `Message ${channelLabel}` : 'Select a channel'}
      />

      <p className="text-[10px] text-muted-foreground mt-1.5 px-0.5">
        <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Enter</kbd> to send ·{' '}
        <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Shift + Enter</kbd> new line
      </p>
    </div>
  )
}

/**
 * Thread reply composer — reuses the exact same editor surface (and working
 * toolbar) as the main channel composer so the reply box is no longer a bare
 * textarea + button.
 */
export function ThreadReplyComposer({
  value,
  onChange,
  onSend,
  disabled,
  sending,
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled: boolean
  sending: boolean
}) {
  return (
    <ComposerBox
      value={value}
      onChange={onChange}
      onSend={onSend}
      disabled={disabled}
      sending={sending}
      placeholder="Reply in thread..."
      sendLabel="Reply"
    />
  )
}

function ToolBtn({
  icon: Icon,
  title,
  onClick,
  disabled,
  loading,
}: {
  icon: typeof Smile
  title: string
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed',
        loading && 'animate-pulse',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}
