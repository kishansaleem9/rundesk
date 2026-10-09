import { Fragment, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CalendarClock, ListTodo, Loader2 } from 'lucide-react'
import { cn } from '@rundesk/ui'
import { api } from '../../lib/api'
import { useTranslation } from '../../lib/i18n'
import { parseMentionSegments } from '../../lib/mentions'
import { hasBlockMarkdown, renderInlineMarkdown, renderMarkdownBlocks } from '../markdown'
import { ClipEmbeds } from '../clip-embed'
import { clipTokenOf, clipTokensIn } from '../../lib/clip-links'

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
/**
 * Render a plain (non-mention) text run: substitute any `:shortcode:` that maps
 * to a known workspace custom emoji (Plan §6.3) with its inline image, and pass
 * the text around those tokens through the shared inline-markdown parser. When
 * the workspace has no custom emoji this is just plain inline markdown, so the
 * fast path is unchanged.
 */
function renderTextRun(
  text: string,
  keyPrefix: string,
  emojiByCode?: Map<string, string>,
): ReactNode[] {
  if (!emojiByCode || emojiByCode.size === 0) return renderInlineMarkdown(text, keyPrefix)
  const nodes: ReactNode[] = []
  const re = /:([a-z0-9_]+):/gi
  let last = 0
  let n = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const code = m[1].toLowerCase()
    const url = emojiByCode.get(code)
    if (!url) continue // not a known custom emoji — leave the literal text as-is
    if (m.index > last) {
      nodes.push(
        <Fragment key={`${keyPrefix}-r${n}`}>{renderInlineMarkdown(text.slice(last, m.index), `${keyPrefix}-r${n}`)}</Fragment>,
      )
      n++
    }
    nodes.push(
      <img
        key={`${keyPrefix}-e${n}`}
        src={url}
        alt={`:${code}:`}
        title={`:${code}:`}
        loading="lazy"
        className="inline-block h-[1.25em] w-[1.25em] object-contain align-[-0.25em]"
      />,
    )
    n++
    last = m.index + m[0].length
  }
  if (last < text.length) {
    nodes.push(
      <Fragment key={`${keyPrefix}-r${n}`}>{renderInlineMarkdown(text.slice(last), `${keyPrefix}-r${n}`)}</Fragment>,
    )
  }
  return nodes
}

function chatInline(namesById: Record<string, string>, emojiByCode?: Map<string, string>) {
  return (text: string, keyPrefix: string): ReactNode[] => {
    const segments = parseMentionSegments(text, namesById, 'teammate')
    return segments.flatMap((seg, i) =>
      seg.type === 'mention'
        ? [mentionChip(seg.label, `${keyPrefix}-m${i}`)]
        : renderTextRun(seg.value, `${keyPrefix}-t${i}`, emojiByCode),
    )
  }
}

/**
 * A parsed in-app task link (Plan §6.10). Matches the URL shape the app mints —
 * `/app/<workspace>/<space>/<project>/<list>?task=<taskId>` — anywhere in a
 * message body, whether pasted as an absolute or relative URL.
 */
type TaskLink = {
  workspaceId: string
  spaceId: string
  projectId: string
  listId: string
  taskId: string
}

const UUID = '[0-9a-fA-F-]{36}'
const TASK_URL_RE = new RegExp(`/app/(${UUID})/(${UUID})/(${UUID})/(${UUID})\\?task=(${UUID})`, 'g')

/** Extract every unique task link (deduped by task id) from a message body. */
function extractTaskLinks(text: string): TaskLink[] {
  const seen = new Set<string>()
  const links: TaskLink[] = []
  for (const m of text.matchAll(TASK_URL_RE)) {
    const taskId = m[5]
    if (seen.has(taskId)) continue
    seen.add(taskId)
    links.push({ workspaceId: m[1], spaceId: m[2], projectId: m[3], listId: m[4], taskId })
  }
  return links
}

/** Non-global variant of the task-URL pattern, for membership `.test()` checks. */
const TASK_URL_TEST_RE = new RegExp(`/app/${UUID}/${UUID}/${UUID}/${UUID}\\?task=${UUID}`)

/** http(s) and `www.` URL tokens in free text. */
const EXTERNAL_URL_RE = /(?:https?:\/\/|www\.)[^\s<>]+/gi

/** How many inline link previews we unfurl per message (Plan §6.3). */
const MAX_LINK_PREVIEWS = 2

/**
 * Extract up to MAX_LINK_PREVIEWS external http(s) links from a message body,
 * EXCLUDING the app's own task URLs (those already render a task card — Plan
 * §6.10 — so we never double-render). Trailing prose punctuation is trimmed,
 * `www.` is normalized to https, and the result is deduped, order-preserving.
 */
function extractExternalLinks(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of text.match(EXTERNAL_URL_RE) ?? []) {
    let url = raw.replace(/[.,;:!?)\]}'"]+$/, '')
    if (/^www\./i.test(url)) url = `https://${url}`
    if (!/^https?:\/\//i.test(url)) continue
    if (TASK_URL_TEST_RE.test(url)) continue // rendered as a task card already
    if (typeof window !== 'undefined' && clipTokenOf(url, window.location.origin)) continue // drawn as the clip
    if (seen.has(url)) continue
    seen.add(url)
    out.push(url)
    if (out.length >= MAX_LINK_PREVIEWS) break
  }
  return out
}

/** Server-unfurled OG metadata (mirrors the API's `UnfurlResult`). */
type LinkPreview = {
  url?: string
  title?: string
  description?: string
  image?: string
  siteName?: string
}

/**
 * A compact, clickable link preview (Plan §6.3). Lazy-fetches server-side
 * OG metadata (SSRF-guarded on the API) via react-query, keyed + cached by URL.
 * Renders nothing until there is at least a title/description/site-name/image,
 * so a link with no metadata (or a disallowed URL → `{}`) leaves only the plain
 * linkified text in the body. Clicking opens the original link in a new tab.
 */
function ChatLinkPreview({ url }: { url: string }) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['chat-unfurl', url],
    queryFn: () => api<LinkPreview>(`/chat/unfurl?url=${encodeURIComponent(url)}`),
    retry: false,
    staleTime: 10 * 60_000,
  })

  const data = query.data
  if (!data || (!data.title && !data.description && !data.siteName && !data.image)) return null

  let host = ''
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    host = ''
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={t('chat.linkPreviewOpen')}
      className="mt-1.5 flex w-full max-w-md overflow-hidden rounded-lg border border-border/70 bg-background transition-colors hover:border-accent/40 hover:bg-accent/[0.04]"
    >
      {data.image && (
        <img
          src={data.image}
          alt=""
          loading="lazy"
          className="h-[76px] w-[76px] shrink-0 object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      )}
      <div className="min-w-0 flex-1 px-3 py-2">
        <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {data.siteName || host}
        </div>
        {data.title && <div className="mt-0.5 truncate text-[13px] font-semibold text-foreground">{data.title}</div>}
        {data.description && (
          <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">{data.description}</div>
        )}
      </div>
    </a>
  )
}

type TaskCardData = {
  id: string
  title: string
  status: string
  statusCategory?: 'open' | 'in_progress' | 'closed' | null
  dueDate?: string | null
  assignees?: Array<{ user?: { displayName?: string | null } | null } | null> | null
}

/** Title-case a free-text status key ("in_progress" → "In Progress"). */
function humanizeStatus(status: string): string {
  return status.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * A rich, clickable card for a pasted task URL (Plan §6.10). Resolves the task
 * through the existing access-checked `GET /tasks/:id` endpoint; on success it
 * shows the title, status, assignee and due date and opens the task in-app
 * (the list route's `?task=` detail drawer). On any failure it renders nothing,
 * so the plain URL already linkified in the message body is the fallback.
 */
function ChatTaskCard({ link }: { link: TaskLink }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: ['chat-task-card', link.taskId],
    queryFn: () => api<TaskCardData | null>(`/tasks/${link.taskId}`),
    retry: false,
    staleTime: 60_000,
  })

  if (query.isLoading) {
    return (
      <div className="mt-1.5 inline-flex max-w-md items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {link.taskId.slice(0, 8)}…
      </div>
    )
  }

  const task = query.data
  if (!task) return null // 403 / 404 / null → fall back to the plain link in the body.

  const assignee = task.assignees?.find((a) => a?.user?.displayName)?.user?.displayName ?? null
  const due = task.dueDate ? new Date(task.dueDate) : null
  const category = task.statusCategory ?? 'open'
  const dotClass =
    category === 'closed'
      ? 'bg-emerald-500'
      : category === 'in_progress'
        ? 'bg-blue-500'
        : 'bg-slate-400'

  const open = () =>
    navigate({
      to: '/app/$workspaceId/$spaceId/$projectId/$listId',
      params: {
        workspaceId: link.workspaceId,
        spaceId: link.spaceId,
        projectId: link.projectId,
        listId: link.listId,
      },
      search: { task: link.taskId } as any,
    })

  return (
    <button
      type="button"
      onClick={open}
      title={t('chat.viewTask')}
      className="mt-1.5 block w-full max-w-md rounded-lg border border-border/70 bg-background px-3 py-2 text-left transition-colors hover:border-violet-500/40 hover:bg-violet-500/[0.04]"
    >
      <div className="flex items-center gap-2">
        <ListTodo className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" />
        <span className="truncate text-[13px] font-semibold text-foreground">{task.title}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} />
          {humanizeStatus(task.status)}
        </span>
        <span>· {assignee ?? t('chat.unassigned')}</span>
        {due && !Number.isNaN(due.getTime()) && (
          <span className="inline-flex items-center gap-1">
            · <CalendarClock className="h-3 w-3" /> {t('chat.taskDue', { date: due.toLocaleDateString() })}
          </span>
        )}
      </div>
    </button>
  )
}

/**
 * Renders a chat message body (Plan §6.3). Plain messages keep the cheap inline
 * path (mentions + inline markdown in a `whitespace-pre-wrap` span) so ordinary
 * one-liners aren't reflowed and stay fast. When the author uses block markdown
 * (lists, blockquotes, fenced code, headings, rules) we render the full block
 * layout instead, with mentions still rendered as chips inside every text run.
 *
 * Pasted task URLs (Plan §6.10) are additionally unfurled into a rich task card
 * below the text; the URL itself stays linkified as a graceful fallback.
 */
export function ChatMessageBody({
  text,
  namesById,
  className,
  linkPreviews = true,
  customEmoji,
}: {
  text: string
  namesById: Record<string, string>
  className?: string
  /** Render inline unfurled previews for external links (Plan §6.3). Off in the
   *  edit-history diff, where preview cards would be noise. Task cards are
   *  unaffected. */
  linkPreviews?: boolean
  /** Workspace custom emoji map (shortcode → image URL) so `:shortcode:` tokens
   *  render as inline emoji images (Plan §6.3). Same map the reactions use. */
  customEmoji?: Map<string, string>
}) {
  const inline = chatInline(namesById, customEmoji)
  const taskLinks = useMemo(() => extractTaskLinks(text), [text])
  const externalLinks = useMemo(
    () => (linkPreviews ? extractExternalLinks(text) : []),
    [text, linkPreviews],
  )
  /*
   * A CLIP'S LINK IS DRAWN AS THE CLIP — "Clip links auto-embed in Chat for
   * instant viewing" (ClickUp; `resume-defects/s4-clip-link`). Off where the
   * previews are, in the edit history.
   */
  const clipTokens = useMemo(
    () => (linkPreviews && typeof window !== 'undefined' ? clipTokensIn(text, window.location.origin) : []),
    [text, linkPreviews],
  )

  const body = hasBlockMarkdown(text) ? (
    <div className={cn('break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0', className)}>
      {renderMarkdownBlocks(text, inline)}
    </div>
  ) : (
    <span className={cn('whitespace-pre-wrap break-words', className)}>{inline(text, 't')}</span>
  )

  if (taskLinks.length === 0 && externalLinks.length === 0 && clipTokens.length === 0) return body

  return (
    <>
      {body}
      {taskLinks.map((link) => (
        <ChatTaskCard key={link.taskId} link={link} />
      ))}
      {externalLinks.map((link) => (
        <ChatLinkPreview key={link} url={link} />
      ))}
      <ClipEmbeds tokens={clipTokens} />
    </>
  )
}
