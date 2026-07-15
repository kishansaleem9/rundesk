import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { AtSign, Bold, Code, FileText, Italic, Loader2, Paperclip, Send, Smile, Sparkles, X } from 'lucide-react'
import { Button, Popover, PopoverContent, PopoverTrigger, Textarea, cn, toast } from '@rundesk/ui'
import { api, ApiError } from '../../lib/api'
import { useTranslation } from '../../lib/i18n'
import { formatMentionsPlain } from '../../lib/mentions'
import type { ChatAttachment, ChatMessage } from './chat-types'

/** Human-readable file size for attachment chips (e.g. "1.2 MB"). */
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
  attachments,
  onFilesSelected,
  onRemoveAttachment,
  uploading,
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
  // File sharing (Plan §6.8). When onFilesSelected is provided the paperclip
  // uploads; the parent owns the uploaded-attachment list and renders chips.
  attachments?: ChatAttachment[]
  onFilesSelected?: (files: File[]) => void
  onRemoveAttachment?: (id: string) => void
  uploading?: boolean
}) {
  const { t } = useTranslation()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [improving, setImproving] = useState(false)
  const canAttach = !!onFilesSelected
  const hasAttachments = (attachments?.length ?? 0) > 0
  // Send is allowed with text OR at least one uploaded attachment.
  const canSend = (!!value.trim() || hasAttachments) && !disabled && !sending && !uploading

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
    const files = Array.from(event.target.files ?? [])
    // Reset so picking the same file again still fires onChange.
    event.target.value = ''
    if (files.length === 0) return
    onFilesSelected?.(files)
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
            if (canSend) onSend()
          }
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelected}
      />
      {(hasAttachments || uploading) && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {attachments?.map((att) => (
            <span
              key={att.id}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 pl-2 pr-1 py-1 text-[12px] max-w-[220px]"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{att.fileName}</span>
              {att.sizeBytes > 0 && <span className="text-muted-foreground shrink-0">{formatBytes(att.sizeBytes)}</span>}
              <button
                type="button"
                title={t('chat.remove')}
                onClick={() => onRemoveAttachment?.(att.id)}
                className="ml-0.5 h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {uploading && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Uploading…
            </span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-t border-border/60 bg-muted/20">
        <div className="flex items-center gap-0.5">
          <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title={t('chat.emoji')}
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
          <ToolBtn icon={Bold} title={t('chat.bold')} disabled={disabled} onClick={() => wrapSelection('**', 'bold')} />
          <ToolBtn icon={Italic} title={t('chat.italic')} disabled={disabled} onClick={() => wrapSelection('*', 'italic')} />
          <ToolBtn icon={Code} title={t('chat.code')} disabled={disabled} onClick={() => wrapSelection('`', 'code')} />
          {canAttach && (
            <ToolBtn icon={Paperclip} title={t('chat.attachFile')} disabled={disabled || uploading} loading={uploading} onClick={handleAttachClick} />
          )}
          <ToolBtn icon={AtSign} title={t('chat.mention')} disabled={disabled} onClick={handleMention} />
          <ToolBtn
            icon={Sparkles}
            title={t('chat.askAi')}
            disabled={disabled || improving}
            loading={improving}
            onClick={() => void handleAskAi()}
          />
        </div>
        <Button
          size="sm"
          className="h-8 px-3 rounded-lg bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
          onClick={onSend}
          disabled={!canSend}
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
  attachments,
  onFilesSelected,
  onRemoveAttachment,
  uploading,
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
  attachments?: ChatAttachment[]
  onFilesSelected?: (files: File[]) => void
  onRemoveAttachment?: (id: string) => void
  uploading?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="shrink-0 border-t border-border/80 bg-[#fbfbfc] dark:bg-[#16181d] px-4 py-3">
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-violet-500/25 bg-violet-500/5 px-3 py-2 text-[12px]">
          <span className="text-muted-foreground shrink-0">{t('chat.replyingTo')}</span>
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
        attachments={attachments}
        onFilesSelected={onFilesSelected}
        onRemoveAttachment={onRemoveAttachment}
        uploading={uploading}
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
