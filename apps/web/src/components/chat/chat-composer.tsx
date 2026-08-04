import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react'
import { AtSign, Bold, Code, FileText, Italic, Link2, Loader2, Paperclip, Send, Smile, Sparkles, X } from 'lucide-react'
import { Button, Popover, PopoverContent, PopoverTrigger, Textarea, cn, toast } from '@rundesk/ui'
import { api, ApiError } from '../../lib/api'
import { useTranslation, type TranslationKey } from '../../lib/i18n'
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

/** Tab labels for the link picker, and the AI actions offered on the draft. */
const PICKER_TAB_KEY: Record<'task' | 'doc' | 'channel', TranslationKey> = {
  task: 'chat.linkTabTasks',
  doc: 'chat.linkTabDocs',
  channel: 'chat.linkTabChannels',
}
const AI_MODE_KEY: Record<'improve' | 'shorten' | 'expand' | 'professional', TranslationKey> = {
  improve: 'chat.aiImprove',
  shorten: 'chat.aiShorten',
  expand: 'chat.aiExpand',
  professional: 'chat.aiProfessional',
}

const COMMON_EMOJIS = ['😀', '👍', '🎉', '❤️', '🙏', '🔥', '✅', '👀', '🚀', '😂', '🙌', '💯']

/**
 * A workspace custom emoji (Plan §6.3). Same shape the reaction picker's
 * `/chat/workspaces/:id/custom-emoji` query returns; extra fields are ignored.
 */
type ComposerCustomEmoji = { id: string; shortcode: string; imageUrl: string }

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
  workspaceId,
  enableSlashCommands,
  customEmoji,
  leadingTools,
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
  /** Enables the link picker; omitted where no workspace is in scope. */
  workspaceId?: string
  // Slash commands (Plan §6.3): show the /task //remind hint while the composer
  // input is a bare leading command token. Only the main composer opts in.
  enableSlashCommands?: boolean
  // Workspace custom emoji (Plan §6.3) — the same list the reaction picker uses.
  // Shown below the standard grid; clicking inserts the `:shortcode:` token that
  // the message body renderer substitutes back into the emoji image.
  customEmoji?: ComposerCustomEmoji[]
  // Insert row (§A3.5) — task / doc / action-item controls supplied by the page,
  // which owns the workspace queries those pickers need.
  leadingTools?: ReactNode
}) {
  const { t } = useTranslation()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  // Slash-command autocomplete: matches while the user is still typing the
  // command name (a leading "/word", no space yet). Clears once args begin.
  const slashCommands = [
    { cmd: '/task', desc: t('chat.slashTaskDesc') },
    { cmd: '/remind', desc: t('chat.slashRemindDesc') },
  ]
  const slashMatches =
    enableSlashCommands && /^\/\w*$/.test(value)
      ? slashCommands.filter((c) => c.cmd.startsWith(value.toLowerCase()))
      : []
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [improving, setImproving] = useState(false)
  // The AI result waits here until it is accepted, so the draft is never
  // overwritten by a suggestion the writer has not seen.
  const [aiDraft, setAiDraft] = useState<string | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerTab, setPickerTab] = useState<'task' | 'doc' | 'channel'>('task')
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerHits, setPickerHits] = useState<Array<{ id: string; title: string }>>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  // Drag-and-drop upload (Plan §6.8): dropping files onto the composer funnels
  // them into the same presign→PUT→record flow as the paperclip button.
  const [dragging, setDragging] = useState(false)
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

  /**
   * Insert a reference to a task, doc or channel.
   *
   * The `@` trigger only ever offered people. Linking the thing you are talking
   * about — the task, the doc — is the reason to reach for a picker at all, so
   * they live behind the same button on their own tabs.
   */
  const handleMention = () => {
    insertAtCursor('@')
  }

  const runPickerSearch = async (kind: 'task' | 'doc' | 'channel', q: string) => {
    if (!workspaceId) return
    setPickerLoading(true)
    try {
      const res = await api<Array<{ id: string; entityType: string; title: string }>>(
        `/search/${workspaceId}?q=${encodeURIComponent(q || 'a')}&types=${kind}&limit=8`,
      )
      setPickerHits((Array.isArray(res) ? res : []).map((h) => ({ id: h.id, title: h.title })))
    } catch {
      setPickerHits([])
    } finally {
      setPickerLoading(false)
    }
  }

  const insertRef = (kind: 'task' | 'doc' | 'channel', title: string) => {
    const token = kind === 'channel' ? `#${title}` : `[${title}]`
    insertAtCursor(token)
    setPickerOpen(false)
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

  // Custom workspace emoji (Plan §6.3): insert the `:shortcode:` token so the
  // message body renderer substitutes it back into the emoji image on send.
  const handleCustomEmoji = (shortcode: string) => {
    insertAtCursor(`:${shortcode}:`)
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

  // Only react to file drags (ignore text/element drags) and only when the
  // composer actually supports attachments.
  const isFileDrag = (e: DragEvent<HTMLDivElement>) => Array.from(e.dataTransfer.types).includes('Files')
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!canAttach || !isFileDrag(e)) return
    e.preventDefault()
    setDragging(true)
  }
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!canAttach) return
    // Ignore leaves fired while moving between the composer's own children.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setDragging(false)
  }
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!canAttach || !isFileDrag(e)) return
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files ?? [])
    if (files.length > 0) onFilesSelected?.(files)
  }

  /**
   * Run one AI action over the draft.
   *
   * The sparkle used to rewrite the draft the moment it was pressed, which
   * threw away what you had written with no way to say what you wanted. It now
   * opens a prompt: pick a mode, see the result, keep or discard it.
   */
  const handleAskAi = async (mode: 'improve' | 'shorten' | 'expand' | 'professional') => {
    const text = value.trim()
    if (!text) {
      toast(t('chat.askAiEmpty'))
      return
    }
    setImproving(true)
    try {
      const result = await api<{ improved: string }>('/ai/writing/improve', {
        method: 'POST',
        body: { text, mode },
      })
      setAiDraft(result.improved)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('chat.couldNotImproveWriting'))
    } finally {
      setImproving(false)
    }
  }

  return (
    <div
      className={cn(
        'relative rounded-xl border border-border/80 bg-background shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none overflow-hidden focus-within:border-violet-500/40 focus-within:ring-2 focus-within:ring-violet-500/15 transition-shadow',
        dragging && 'border-violet-500/60 ring-2 ring-violet-500/25',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragging && canAttach && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-violet-500/60 bg-violet-500/10 backdrop-blur-[1px]">
          <span className="flex items-center gap-2 text-[13px] font-medium text-violet-700 dark:text-violet-200">
            <Paperclip className="h-4 w-4" /> {t('chat.dropToShare')}
          </span>
        </div>
      )}
      {slashMatches.length > 0 && (
        <div className="border-b border-border/60 bg-muted/20 px-1.5 py-1">
          <div className="px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{t('chat.commands')}</div>
          {slashMatches.map((c) => (
            <button
              key={c.cmd}
              type="button"
              className="flex w-full items-baseline gap-2 rounded px-2 py-1 text-left hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
              onClick={() => {
                onChange(`${c.cmd} `)
                requestAnimationFrame(() => textareaRef.current?.focus())
              }}
            >
              <span className="font-mono text-[13px] text-foreground">{c.cmd}</span>
              <span className="text-[12px] text-muted-foreground">{c.desc}</span>
            </button>
          ))}
        </div>
      )}
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
              {t('chat.uploading')}
            </span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-t border-border/60 bg-muted/20">
        <div className="flex items-center gap-0.5">
          {leadingTools}
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
            <PopoverContent align="start" className="w-auto max-w-[248px] p-2">
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
              {customEmoji && customEmoji.length > 0 && (
                <div className="mt-2 border-t border-border/60 pt-2">
                  <div className="px-0.5 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t('chat.customEmoji')}
                  </div>
                  <div className="grid max-h-32 grid-cols-6 gap-1 overflow-y-auto">
                    {customEmoji.map((ce) => (
                      <button
                        key={ce.id}
                        type="button"
                        title={`:${ce.shortcode}:`}
                        className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
                        onClick={() => handleCustomEmoji(ce.shortcode)}
                      >
                        <img src={ce.imageUrl} alt={ce.shortcode} loading="lazy" className="h-5 w-5 object-contain" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </PopoverContent>
          </Popover>
          <ToolBtn icon={Bold} title={t('chat.bold')} disabled={disabled} onClick={() => wrapSelection('**', 'bold')} />
          <ToolBtn icon={Italic} title={t('chat.italic')} disabled={disabled} onClick={() => wrapSelection('*', 'italic')} />
          <ToolBtn icon={Code} title={t('chat.code')} disabled={disabled} onClick={() => wrapSelection('`', 'code')} />
          {canAttach && (
            <ToolBtn icon={Paperclip} title={t('chat.attachFile')} disabled={disabled || uploading} loading={uploading} onClick={handleAttachClick} />
          )}
          <ToolBtn icon={AtSign} title={t('chat.mention')} disabled={disabled} onClick={handleMention} />
          {workspaceId && (
            <Popover
              open={pickerOpen}
              onOpenChange={(o) => {
                setPickerOpen(o)
                if (o) void runPickerSearch(pickerTab, pickerQuery)
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title={t('chat.linkThing')}
                  aria-label={t('chat.linkThing')}
                  disabled={disabled}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                >
                  <Link2 className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start">
                <div className="flex border-b border-border">
                  {(['task', 'doc', 'channel'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={pickerTab === k}
                      onClick={() => { setPickerTab(k); void runPickerSearch(k, pickerQuery) }}
                      className={cn(
                        'flex-1 px-2 py-1.5 text-[12px] capitalize',
                        pickerTab === k
                          ? 'border-b-2 border-violet-500 font-medium text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t(PICKER_TAB_KEY[k])}
                    </button>
                  ))}
                </div>
                <input
                  autoFocus
                  value={pickerQuery}
                  onChange={(e) => { setPickerQuery(e.target.value); void runPickerSearch(pickerTab, e.target.value) }}
                  placeholder={t('chat.linkSearchPlaceholder')}
                  aria-label={t('chat.linkSearchPlaceholder')}
                  className="w-full border-b border-border bg-transparent px-2.5 py-1.5 text-[13px] outline-none"
                />
                <div className="max-h-56 overflow-y-auto py-1">
                  {pickerLoading && <p className="px-2.5 py-2 text-[12px] text-muted-foreground">{t('common.loading')}</p>}
                  {!pickerLoading && pickerHits.length === 0 && (
                    <p className="px-2.5 py-2 text-[12px] text-muted-foreground">{t('chat.linkNoResults')}</p>
                  )}
                  {pickerHits.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => insertRef(pickerTab, h.title)}
                      className="block w-full truncate px-2.5 py-1.5 text-left text-[13px] hover:bg-muted"
                    >
                      {h.title}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
          <Popover open={aiOpen} onOpenChange={(o) => { setAiOpen(o); if (!o) setAiDraft(null) }}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title={t('chat.askAi')}
                aria-label={t('chat.askAi')}
                disabled={disabled || improving}
                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                {improving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-2 space-y-2" align="start">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('chat.aiPromptTitle')}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {(['improve', 'shorten', 'expand', 'professional'] as const).map((m) => (
                  <Button
                    key={m}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={improving}
                    onClick={() => void handleAskAi(m)}
                    className="h-7 text-[12px]"
                  >
                    {t(AI_MODE_KEY[m])}
                  </Button>
                ))}
              </div>
              {aiDraft != null && (
                <div className="space-y-2">
                  <div className="max-h-40 overflow-y-auto rounded border border-border bg-muted/40 p-2 text-[13px] whitespace-pre-wrap">
                    {aiDraft}
                  </div>
                  {/* Accept is explicit: the draft is only replaced when asked. */}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1 h-7 text-[12px]"
                      onClick={() => { onChange(aiDraft); setAiDraft(null); setAiOpen(false); textareaRef.current?.focus() }}
                    >
                      {t('chat.aiUseThis')}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-[12px]" onClick={() => setAiDraft(null)}>
                      {t('chat.aiDiscard')}
                    </Button>
                  </div>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
        <Button
          size="sm"
          /* relative z-50: keep the send button clickable above the fixed support-widget
             launcher (bottom-6 right-6 z-40), which otherwise intercepts its clicks. */
          className="relative z-50 h-8 px-3 rounded-lg bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
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
  workspaceId,
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
  customEmoji,
  leadingTools,
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
  workspaceId?: string
  customEmoji?: ComposerCustomEmoji[]
  leadingTools?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="shrink-0 border-t border-border/80 bg-[#fbfbfc] dark:bg-[#16181d] px-4 py-3">
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-violet-500/25 bg-violet-500/5 px-3 py-2 text-[12px]">
          <span className="text-muted-foreground shrink-0">{t('chat.replyingTo')}</span>
          <span className="font-medium text-foreground truncate flex-1">
            {replyTo.authorName ?? t('chat.messageAuthorFallback')}: {formatMentionsPlain(replyTo.body, replyNamesById)}
          </span>
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground shrink-0"
            onClick={onCancelReply}
          >
            {t('common.cancel')}
          </button>
        </div>
      )}

      {mentionMenu}

      <ComposerBox
        workspaceId={workspaceId}
        value={value}
        onChange={onChange}
        onSend={onSend}
        disabled={disabled}
        sending={sending}
        placeholder={channelLabel ? t('chat.messageSomeone', { name: channelLabel }) : t('chat.selectAChannel')}
        attachments={attachments}
        onFilesSelected={onFilesSelected}
        onRemoveAttachment={onRemoveAttachment}
        uploading={uploading}
        customEmoji={customEmoji}
        leadingTools={leadingTools}
        enableSlashCommands
      />

      <p className="text-[10px] text-muted-foreground mt-1.5 px-0.5">
        <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Enter</kbd> {t('chat.toSend')} ·{' '}
        <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Shift + Enter</kbd> {t('chat.newLine')}
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
  workspaceId,
  value,
  onChange,
  onSend,
  disabled,
  sending,
  customEmoji,
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled: boolean
  sending: boolean
  customEmoji?: ComposerCustomEmoji[]
  workspaceId?: string
}) {
  const { t } = useTranslation()
  return (
    <ComposerBox
      workspaceId={workspaceId}
      value={value}
      onChange={onChange}
      onSend={onSend}
      disabled={disabled}
      sending={sending}
      placeholder={t('chat.replyInThread')}
      sendLabel={t('chat.reply')}
      customEmoji={customEmoji}
      // §A3.2 — replies run the same /task and /remind commands as the channel
      // composer, so the thread isn't a second-class place to work.
      enableSlashCommands
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
