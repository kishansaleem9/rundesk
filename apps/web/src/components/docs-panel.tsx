import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, toast } from '@rundesk/ui'
import {
  Check,
  CheckCircle2,
  Download,
  Globe,
  GlobeLock,
  History,
  Link2,
  MessageCircle,
  MessagesSquare,
  Plus,
  RotateCcw,
  Slash,
  Trash2,
} from 'lucide-react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { api, ApiError } from '../lib/api'
import { getRealtimeSocket } from '../lib/realtime'
import { createMentionExtension, type MentionMember } from '../lib/tiptap-mention'
import { MentionText } from './mention-text'
import { useMentionNames } from '../hooks/use-mention-names'

type Doc = {
  id: string
  title: string
  content: Record<string, unknown>
  updatedAt: string
  publicShareId?: string | null
  publicShareEnabledAt?: string | null
}

type DocComment = {
  id: string
  docId: string
  workspaceId: string
  authorId: string | null
  parentCommentId: string | null
  body: string
  selection: { from: number; to: number; quote?: string } | null
  isResolved: boolean
  resolvedById: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
  authorName?: string | null
  authorEmail?: string | null
  authorAvatarUrl?: string | null
}

export function DocsPanel({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [newDocName, setNewDocName] = useState('')
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashFilter, setSlashFilter] = useState('')
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const editorWrapRef = useRef<HTMLDivElement | null>(null)

  const docsQuery = useQuery({
    queryKey: ['docs', workspaceId],
    queryFn: () => api<Doc[]>(`/workspaces/${workspaceId}/docs`),
  })

  useEffect(() => {
    if (!selectedDocId && docsQuery.data?.length) {
      setSelectedDocId(docsQuery.data[0].id)
    }
  }, [docsQuery.data, selectedDocId])

  const activeDoc = useMemo(
    () => docsQuery.data?.find((d) => d.id === selectedDocId) ?? null,
    [docsQuery.data, selectedDocId],
  )

  const mentionExtension = useMemo(
    () =>
      createMentionExtension({
        fetchMembers: async (query: string): Promise<MentionMember[]> => {
          try {
            const members = await api<
              Array<{ userId: string; email: string; displayName: string; avatarUrl?: string | null }>
            >(`/workspaces/${workspaceId}/members`, { method: 'GET' })
            const filter = query.toLowerCase().trim()
            const filtered = filter
              ? members.filter(
                  (m) =>
                    m.email.toLowerCase().includes(filter) ||
                    (m.displayName ?? '').toLowerCase().includes(filter),
                )
              : members
            return filtered.map((m) => ({
              id: m.userId,
              email: m.email,
              displayName: m.displayName ?? m.email,
              avatarUrl: m.avatarUrl ?? null,
            }))
          } catch {
            return []
          }
        },
      }),
    [workspaceId],
  )

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write your doc... type @ to mention' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      mentionExtension,
    ],
    content: activeDoc?.content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const from = editor.state.selection.from
      const text = editor.state.doc.textBetween(Math.max(0, from - 30), from, '\n', '\n')
      const slashMatch = text.match(/\/([a-z]*)$/i)
      if (!slashMatch) {
        setSlashOpen(false)
        return
      }
      setSlashFilter(slashMatch[1] ?? '')
      setSlashOpen(true)
    },
  })

  useEffect(() => {
    if (!editor || !activeDoc) return
    editor.commands.setContent(activeDoc.content)
  }, [editor, activeDoc])

  useEffect(() => {
    if (!selectedDocId) return
    const socket = getRealtimeSocket()
    socket.emit('subscribe', { rooms: [`doc:${selectedDocId}`] })
    const onEvent = (event: { type: string; docId?: string }) => {
      if (!event.docId) return
      if (event.type === 'doc.updated') {
        void qc.invalidateQueries({ queryKey: ['docs', workspaceId] })
      }
      if (event.type.startsWith('doc.comment.')) {
        void qc.invalidateQueries({ queryKey: ['doc-comments', event.docId] })
      }
    }
    socket.on('event', onEvent)
    return () => {
      socket.off('event', onEvent)
      socket.emit('unsubscribe', { rooms: [`doc:${selectedDocId}`] })
    }
  }, [selectedDocId, qc, workspaceId])

  const createDoc = useMutation({
    mutationFn: async () =>
      api<Doc>(`/workspaces/${workspaceId}/docs`, {
        method: 'POST',
        body: JSON.stringify({ title: newDocName.trim() || 'Untitled' }),
      }),
    onSuccess: async (doc) => {
      setNewDocName('')
      setSelectedDocId(doc.id)
      await qc.invalidateQueries({ queryKey: ['docs', workspaceId] })
    },
  })

  const saveDoc = useMutation({
    mutationFn: async () => {
      if (!selectedDocId || !editor) return
      const content = editor.getJSON()
      return api(`/docs/${selectedDocId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content, expectedUpdatedAt: activeDoc?.updatedAt }),
      })
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) {
        toast('Doc updated by teammate', {
          description: 'Latest content was loaded. Re-apply your change and save again.',
        })
      }
      await qc.invalidateQueries({ queryKey: ['docs', workspaceId] })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['docs', workspaceId] })
    },
  })

  const runSlashCommand = (id: 'h2' | 'todo' | 'bullet' | 'code' | 'quote') => {
    if (!editor) return
    const chain = editor.chain().focus()
    if (id === 'h2') chain.toggleHeading({ level: 2 }).run()
    if (id === 'todo') chain.toggleTaskList().run()
    if (id === 'bullet') chain.toggleBulletList().run()
    if (id === 'code') chain.toggleCodeBlock().run()
    if (id === 'quote') chain.toggleBlockquote().run()
    setSlashOpen(false)
  }

  const exportDoc = (format: 'html' | 'txt' | 'md') => {
    if (!editor || !activeDoc) return
    const html = editor.getHTML()
    const plain = editor.getText()
    const body = format === 'html' ? html : plain
    const ext = format === 'txt' ? 'txt' : format
    const type = format === 'html' ? 'text/html' : 'text/plain'
    const blob = new Blob([body], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeDoc.title.replace(/\s+/g, '-').toLowerCase() || 'doc'}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const slashItems = [
    { id: 'h2' as const, label: 'Heading 2' },
    { id: 'todo' as const, label: 'Todo list' },
    { id: 'bullet' as const, label: 'Bullet list' },
    { id: 'quote' as const, label: 'Quote block' },
    { id: 'code' as const, label: 'Code block' },
  ].filter((item) => item.label.toLowerCase().includes(slashFilter.toLowerCase()))

  return (
    <Card
      variant="glass"
      className={`grid grid-cols-1 ${
        commentsOpen && historyOpen
          ? 'md:grid-cols-[240px_1fr_300px_300px]'
          : commentsOpen || historyOpen
            ? 'md:grid-cols-[240px_1fr_300px]'
            : 'md:grid-cols-[240px_1fr]'
      } gap-0 h-[640px] overflow-hidden p-0`}
    >
      {/* Sidebar */}
      <div className="border-b md:border-b-0 md:border-r border-border/60 bg-card/30 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Pages
          </span>
        </div>
        <div className="flex-1 overflow-auto px-2 py-2 space-y-0.5">
          {docsQuery.data?.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No docs yet — create your first page below.
            </p>
          )}
          {docsQuery.data?.map((doc) => (
            <button
              key={doc.id}
              className={`w-full truncate text-left rounded-md px-2 py-1.5 text-sm transition-colors ${
                doc.id === selectedDocId
                  ? 'bg-accent/15 text-foreground font-medium'
                  : 'hover:bg-card/60 text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setSelectedDocId(doc.id)}
            >
              {doc.title}
            </button>
          ))}
        </div>
        <div className="border-t border-border/60 p-2 space-y-2">
          <Input
            value={newDocName}
            onChange={(e) => setNewDocName(e.target.value)}
            placeholder="New page name"
            className="h-9"
          />
          <Button size="sm" variant="outline" className="w-full" onClick={() => createDoc.mutate()}>
            <Plus className="h-3.5 w-3.5" /> Add page
          </Button>
        </div>
      </div>

      {/* Editor pane */}
      <div className="flex flex-col min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-border/60">
          <h3 className="font-display text-base font-semibold truncate">
            {activeDoc?.title ?? 'Select a doc'}
          </h3>
          {activeDoc && (
            <div className="flex flex-wrap gap-1.5">
              <ShareDocButton doc={activeDoc} onShareChange={() => docsQuery.refetch()} />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => editor?.chain().focus().toggleBold().run()}
                disabled={!editor}
              >
                <strong>B</strong>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => editor?.chain().focus().toggleItalic().run()}
                disabled={!editor}
              >
                <em>I</em>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                disabled={!editor}
              >
                H2
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
                disabled={!editor}
              >
                List
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => editor?.chain().focus().toggleTaskList().run()}
                disabled={!editor}
              >
                Todo
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
                disabled={!editor}
              >
                Code
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => exportDoc('md')}
                disabled={!editor}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                MD
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => exportDoc('txt')}
                disabled={!editor}
              >
                TXT
              </Button>
              <Button
                size="sm"
                variant={commentsOpen ? 'secondary' : 'ghost'}
                onClick={() => setCommentsOpen((v) => !v)}
                disabled={!activeDoc}
                title={commentsOpen ? 'Hide comments' : 'Show comments'}
              >
                <MessagesSquare className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={historyOpen ? 'secondary' : 'ghost'}
                onClick={() => setHistoryOpen((v) => !v)}
                disabled={!activeDoc}
                title={historyOpen ? 'Hide version history' : 'Version history'}
              >
                <History className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="gradient"
                onClick={() => saveDoc.mutate()}
                disabled={saveDoc.isPending}
              >
                {saveDoc.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          )}
        </div>
        <div ref={editorWrapRef} className="relative flex-1 overflow-auto px-6 py-5 prose prose-invert prose-sm max-w-none">
          {activeDoc ? (
            <EditorContent editor={editor} />
          ) : (
            <p className="text-sm text-muted-foreground">Pick a page on the left to start editing.</p>
          )}
          {slashOpen && activeDoc && (
            <div className="absolute top-4 right-4 z-30 w-52 rounded-md border border-border bg-card shadow-lg overflow-hidden">
              <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border flex items-center gap-1">
                <Slash className="h-3 w-3" /> Slash menu
              </div>
              {slashItems.map((item) => (
                <button
                  key={item.id}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50"
                  onClick={() => runSlashCommand(item.id)}
                >
                  {item.label}
                </button>
              ))}
              {slashItems.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">No commands</div>
              )}
            </div>
          )}
        </div>
      </div>

      {commentsOpen && activeDoc && (
        <DocCommentsPane docId={activeDoc.id} workspaceId={workspaceId} />
      )}

      {historyOpen && activeDoc && (
        <DocHistoryPane
          docId={activeDoc.id}
          onRestored={(content) => {
            editor?.commands.setContent(content as never)
            docsQuery.refetch()
          }}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </Card>
  )
}

function relativeTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

type DocRevision = {
  id: string
  title: string
  updatedAt: string
  editor?: { displayName?: string | null } | null
}

function DocHistoryPane({
  docId,
  onRestored,
  onClose,
}: {
  docId: string
  onRestored: (content: unknown) => void
  onClose: () => void
}) {
  const qc = useQueryClient()
  const revisionsQuery = useQuery({
    queryKey: ['doc-revisions', docId],
    queryFn: () => api<DocRevision[]>(`/docs/${docId}/revisions`),
  })
  const restore = useMutation({
    mutationFn: (revisionId: string) =>
      api<{ content: unknown }>(`/docs/${docId}/revisions/${revisionId}/restore`, { method: 'POST' }),
    onSuccess: (doc) => {
      onRestored(doc.content)
      qc.invalidateQueries({ queryKey: ['doc-revisions', docId] })
      toast.success('Version restored')
    },
    onError: () => toast.error('Could not restore that version'),
  })
  const revs = revisionsQuery.data ?? []
  return (
    <div className="border-l border-border/60 bg-card/40 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4" /> Version history
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} title="Close">
          ✕
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-1.5">
        {revisionsQuery.isLoading && <p className="text-xs text-muted-foreground px-2 py-1">Loading…</p>}
        {!revisionsQuery.isLoading && revs.length === 0 && (
          <p className="text-xs text-muted-foreground px-2 py-1">No saved versions yet.</p>
        )}
        {revs.map((r, i) => (
          <div
            key={r.id}
            className="rounded-md border border-border/50 px-3 py-2 flex items-center justify-between gap-2 hover:bg-muted/40"
          >
            <div className="min-w-0">
              <div className="text-xs font-medium truncate">
                {i === 0 ? 'Current version' : `Version ${revs.length - i}`}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {r.editor?.displayName ?? 'Unknown'} · {relativeTime(r.updatedAt)}
              </div>
            </div>
            {i !== 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={restore.isPending}
                onClick={() => restore.mutate(r.id)}
                title="Restore this version"
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function DocCommentsPane({ docId, workspaceId }: { docId: string; workspaceId: string }) {
  const qc = useQueryClient()
  const { namesById } = useMentionNames(workspaceId)
  const [showResolved, setShowResolved] = useState(false)
  const [newBody, setNewBody] = useState('')
  const [replyParentId, setReplyParentId] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')

  const commentsQuery = useQuery({
    queryKey: ['doc-comments', docId, { showResolved }],
    queryFn: () =>
      api<{ comments: DocComment[] }>(
        `/docs/${docId}/comments?includeResolved=${showResolved ? 'true' : 'false'}`,
      ),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['doc-comments', docId] })

  const createComment = useMutation({
    mutationFn: (body: { body: string; parentCommentId?: string | null }) =>
      api(`/docs/${docId}/comments`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      setNewBody('')
      setReplyBody('')
      setReplyParentId(null)
      await invalidate()
    },
    onError: (error) => {
      if (error instanceof ApiError) toast.error(error.message)
    },
  })

  const resolveComment = useMutation({
    mutationFn: ({ commentId, resolved }: { commentId: string; resolved: boolean }) =>
      api(`/docs/comments/${commentId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolved }),
      }),
    onSuccess: invalidate,
  })

  const deleteComment = useMutation({
    mutationFn: (commentId: string) => api(`/docs/comments/${commentId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  const grouped = useMemo(() => {
    const all = commentsQuery.data?.comments ?? []
    const roots: DocComment[] = []
    const replies = new Map<string, DocComment[]>()
    for (const c of all) {
      if (!c.parentCommentId) roots.push(c)
      else {
        const arr = replies.get(c.parentCommentId) ?? []
        arr.push(c)
        replies.set(c.parentCommentId, arr)
      }
    }
    return { roots, replies }
  }, [commentsQuery.data])

  return (
    <aside className="border-t md:border-t-0 md:border-l border-border/60 bg-card/30 flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <MessageCircle className="h-3 w-3" /> Comments
        </span>
        <button
          onClick={() => setShowResolved((v) => !v)}
          className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          {showResolved ? 'Hide resolved' : 'Show resolved'}
        </button>
      </header>
      <div className="flex-1 overflow-auto px-3 py-3 space-y-3">
        {commentsQuery.isLoading && (
          <p className="text-xs text-muted-foreground">Loading…</p>
        )}
        {!commentsQuery.isLoading && grouped.roots.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No comments yet. Start a thread below.
          </p>
        )}
        {grouped.roots.map((c) => (
          <article
            key={c.id}
            className={`rounded-md border border-border/60 bg-card/60 p-2.5 space-y-2 ${
              c.isResolved ? 'opacity-70' : ''
            }`}
          >
            <CommentBody
              comment={c}
              namesById={namesById}
              onResolveToggle={() =>
                resolveComment.mutate({ commentId: c.id, resolved: !c.isResolved })
              }
              onDelete={() => deleteComment.mutate(c.id)}
            />
            {(grouped.replies.get(c.id) ?? []).map((reply) => (
              <div key={reply.id} className="ml-3 pl-2 border-l border-border/60">
                <CommentBody
                  comment={reply}
                  namesById={namesById}
                  onResolveToggle={() =>
                    resolveComment.mutate({ commentId: reply.id, resolved: !reply.isResolved })
                  }
                  onDelete={() => deleteComment.mutate(reply.id)}
                />
              </div>
            ))}
            {replyParentId === c.id ? (
              <form
                className="space-y-1.5"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (replyBody.trim()) {
                    createComment.mutate({ body: replyBody, parentCommentId: c.id })
                  }
                }}
              >
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  rows={2}
                  className="w-full text-xs px-2 py-1.5 rounded border border-border bg-card focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Write a reply…"
                  autoFocus
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setReplyParentId(null)
                      setReplyBody('')
                    }}
                  >
                    Cancel
                  </button>
                  <Button type="submit" size="sm" disabled={!replyBody.trim() || createComment.isPending}>
                    Reply
                  </Button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setReplyParentId(c.id)
                  setReplyBody('')
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Reply
              </button>
            )}
          </article>
        ))}
      </div>
      <form
        className="border-t border-border/60 p-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (newBody.trim()) createComment.mutate({ body: newBody })
        }}
      >
        <textarea
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          rows={2}
          placeholder="Add a comment…"
          className="w-full text-xs px-2 py-1.5 rounded border border-border bg-card focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button
          type="submit"
          size="sm"
          variant="gradient"
          className="w-full"
          disabled={!newBody.trim() || createComment.isPending}
        >
          {createComment.isPending ? 'Posting…' : 'Post comment'}
        </Button>
      </form>
    </aside>
  )
}

function CommentBody({
  comment,
  namesById,
  onResolveToggle,
  onDelete,
}: {
  comment: DocComment
  namesById: Record<string, string>
  onResolveToggle: () => void
  onDelete: () => void
}) {
  const initials = (comment.authorName ?? comment.authorEmail ?? 'U').slice(0, 1).toUpperCase()
  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        <div className="h-6 w-6 rounded-full bg-accent/15 text-foreground flex items-center justify-center text-[10px] font-semibold shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium truncate">
              {comment.authorName ?? comment.authorEmail ?? 'Member'}
            </p>
            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
              {new Date(comment.createdAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          {comment.selection?.quote && (
            <blockquote className="mt-1 text-[11px] text-muted-foreground border-l-2 border-accent/40 pl-2 italic line-clamp-2">
              {comment.selection.quote}
            </blockquote>
          )}
          <MentionText text={comment.body} namesById={namesById} className="text-xs mt-1" />
          <div className="flex items-center gap-2 mt-1.5">
            <button
              onClick={onResolveToggle}
              className={`text-[10px] uppercase tracking-widest flex items-center gap-1 ${
                comment.isResolved ? 'text-emerald-600' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {comment.isResolved ? <CheckCircle2 className="h-3 w-3" /> : <Check className="h-3 w-3" />}
              {comment.isResolved ? 'Resolved' : 'Resolve'}
            </button>
            <button
              onClick={onDelete}
              className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-destructive flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ShareDocButton({
  doc,
  onShareChange,
}: {
  doc: Doc
  onShareChange: () => void
}) {
  const [busy, setBusy] = useState(false)
  const isShared = Boolean(doc.publicShareId)
  const shareUrl = isShared ? `${window.location.origin}/d/${doc.publicShareId}` : null

  const toggle = async () => {
    setBusy(true)
    try {
      if (isShared) {
        await api(`/docs/${doc.id}/share`, { method: 'DELETE' })
        toast.success('Public share disabled')
      } else {
        const result = await api<{ publicShareId: string }>(`/docs/${doc.id}/share`, {
          method: 'POST',
        })
        const url = `${window.location.origin}/d/${result.publicShareId}`
        await navigator.clipboard.writeText(url).catch(() => undefined)
        toast.success('Public link copied to clipboard')
      }
      onShareChange()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to toggle share')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    toast.success('Public link copied')
  }

  return (
    <>
      <Button
        size="sm"
        variant={isShared ? 'secondary' : 'ghost'}
        onClick={toggle}
        disabled={busy}
        title={isShared ? 'Disable public share' : 'Share doc publicly'}
      >
        {isShared ? <Globe className="h-3.5 w-3.5" /> : <GlobeLock className="h-3.5 w-3.5" />}
      </Button>
      {isShared && (
        <Button size="sm" variant="ghost" onClick={copy} title="Copy public link">
          <Link2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </>
  )
}
