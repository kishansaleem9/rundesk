import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, toast } from '@rundesk/ui'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Globe,
  GlobeLock,
  Heading1,
  Heading3,
  History,
  Layers,
  Link,
  Link2,
  ListOrdered,
  MessageCircle,
  MessagesSquare,
  Palette,
  Pilcrow,
  Plus,
  RotateCcw,
  Slash,
  Sparkles,
  Strikethrough,
  Trash2,
  Underline,
} from 'lucide-react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import TextAlign from '@tiptap/extension-text-align'
import { api, ApiError } from '../lib/api'
import { getRealtimeSocket } from '../lib/realtime'
import { createMentionExtension, type MentionMember } from '../lib/tiptap-mention'
import { MentionText } from './mention-text'
import { DocTemplatesDialog, type DocTemplate } from './doc-templates'
import { useMentionNames } from '../hooks/use-mention-names'

type Doc = {
  id: string
  title: string
  content: Record<string, unknown>
  updatedAt: string
  parentDocId?: string | null
  icon?: string | null
  position?: number
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
  // Honor a ?doc=<id> deep link (e.g. from global search) by preselecting it.
  const [selectedDocId, setSelectedDocId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const fromUrl = new URLSearchParams(window.location.search).get('doc')
      if (fromUrl) return fromUrl
    }
    return null
  })
  const [newDocName, setNewDocName] = useState('')
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashFilter, setSlashFilter] = useState('')
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [improving, setImproving] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set())
  const [colorOpen, setColorOpen] = useState(false)
  const [aiMenuOpen, setAiMenuOpen] = useState(false)
  const [insertOpen, setInsertOpen] = useState(false)
  const [createTask, setCreateTask] = useState<{ open: boolean; title: string }>({ open: false, title: '' })
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

  // Group docs by parent so the sidebar can render a real nested tree
  // (the backend already returns parentDocId/position on every doc).
  const docsByParent = useMemo(() => {
    const all = docsQuery.data ?? []
    const presentIds = new Set(all.map((d) => d.id))
    const map = new Map<string | null, Doc[]>()
    for (const d of all) {
      // Treat a doc whose parent isn't in the list (e.g. the parent was
      // archived) as a root, so its subtree never disappears from the sidebar.
      const key = d.parentDocId && presentIds.has(d.parentDocId) ? d.parentDocId : null
      const arr = map.get(key)
      if (arr) arr.push(d)
      else map.set(key, [d])
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.title.localeCompare(b.title))
    }
    return map
  }, [docsQuery.data])

  const toggleExpanded = (id: string) =>
    setExpandedDocs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

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
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
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
    mutationFn: async (
      vars: { title?: string; parentDocId?: string | null; content?: Record<string, unknown> } = {},
    ) => {
      const doc = await api<Doc>(`/workspaces/${workspaceId}/docs`, {
        method: 'POST',
        body: JSON.stringify({
          title: vars.title ?? (newDocName.trim() || 'Untitled'),
          parentDocId: vars.parentDocId ?? null,
        }),
      })
      // Templates ship their body separately via a follow-up content update.
      if (vars.content) {
        await api(`/docs/${doc.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ content: vars.content }),
        })
      }
      return { doc, parentDocId: vars.parentDocId ?? null }
    },
    onSuccess: async ({ doc, parentDocId }) => {
      setNewDocName('')
      setSelectedDocId(doc.id)
      if (parentDocId) setExpandedDocs((prev) => new Set(prev).add(parentDocId))
      await qc.invalidateQueries({ queryKey: ['docs', workspaceId] })
    },
  })

  // Create a doc from a saved workspace template (content copied server-side).
  const createFromTemplate = useMutation({
    mutationFn: (templateId: string) =>
      api<Doc>(`/workspaces/${workspaceId}/doc-templates/${templateId}/create-doc`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: async (doc) => {
      setSelectedDocId(doc.id)
      await qc.invalidateQueries({ queryKey: ['docs', workspaceId] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not create from template'),
  })

  // Save the open doc as a reusable workspace template.
  const saveAsTemplate = useMutation({
    mutationFn: (name: string) =>
      api(`/workspaces/${workspaceId}/doc-templates`, {
        method: 'POST',
        body: { docId: selectedDocId, name },
      }),
    onSuccess: async () => {
      toast.success('Saved as a template')
      await qc.invalidateQueries({ queryKey: ['doc-templates', workspaceId] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not save template'),
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

  const toggleLink = () => {
    if (!editor) return
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run()
      return
    }
    const url = window.prompt('Link URL')
    if (url) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }

  // AI actions — "improve" plus the edit modes the bug doc asked for. All four
  // are backed by the real /ai/writing/improve endpoint (mode = improve | shorten
  // | expand | format). Operates on the selection if there is one, else the doc.
  const runAi = async (mode: 'improve' | 'shorten' | 'expand' | 'format') => {
    if (!editor || improving) return
    setAiMenuOpen(false)
    const { from, to, empty } = editor.state.selection
    const hasSelection = !empty && from !== to
    const text = hasSelection
      ? editor.state.doc.textBetween(from, to, '\n', '\n')
      : editor.getText()
    if (!text.trim()) {
      toast.error('Nothing to edit — add or select some text first.')
      return
    }
    setImproving(true)
    try {
      const result = await api<{ improved: string }>('/ai/writing/improve', {
        method: 'POST',
        body: { text, mode },
      })
      if (hasSelection) {
        editor.chain().focus().deleteSelection().insertContent(result.improved).run()
      } else {
        editor.commands.setContent(result.improved)
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'AI request failed')
    } finally {
      setImproving(false)
    }
  }

  const TEXT_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#6366f1', '#a855f7', '#ec4899', '#0f172a', '#94a3b8']
  const applyColor = (c: string) => { editor?.chain().focus().setColor(c).run(); setColorOpen(false) }
  const clearColor = () => { editor?.chain().focus().unsetColor().run(); setColorOpen(false) }
  const setAlign = (align: 'left' | 'center' | 'right' | 'justify') =>
    editor?.chain().focus().setTextAlign(align).run()

  // Insert a link to another doc (deep link the docs route honors via ?doc=).
  const embedDoc = (d: Doc) => {
    if (!editor) return
    editor
      .chain()
      .focus()
      .insertContent([
        { type: 'text', marks: [{ type: 'link', attrs: { href: `/app/${workspaceId}/docs?doc=${d.id}` } }], text: d.title || 'Untitled doc' },
        { type: 'text', text: ' ' },
      ])
      .run()
    setInsertOpen(false)
  }

  // Open the "create task from selection" dialog, prefilling the selected text.
  const openCreateTaskFromSelection = () => {
    const sel = editor && !editor.state.selection.empty
      ? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ', ' ').trim()
      : ''
    setInsertOpen(false)
    setCreateTask({ open: true, title: sel })
  }

  const slashItems = [
    { id: 'h2' as const, label: 'Heading 2' },
    { id: 'todo' as const, label: 'Todo list' },
    { id: 'bullet' as const, label: 'Bullet list' },
    { id: 'quote' as const, label: 'Quote block' },
    { id: 'code' as const, label: 'Code block' },
  ].filter((item) => item.label.toLowerCase().includes(slashFilter.toLowerCase()))

  const renderDocNodes = (parentId: string | null, depth: number): React.ReactNode =>
    (docsByParent.get(parentId) ?? []).map((node) => {
      const children = docsByParent.get(node.id) ?? []
      const hasChildren = children.length > 0
      const isOpen = expandedDocs.has(node.id)
      return (
        <div key={node.id}>
          <div
            className={`group flex items-center gap-0.5 rounded-md pr-1 transition-colors ${
              node.id === selectedDocId
                ? 'bg-accent/15 text-foreground font-medium'
                : 'hover:bg-card/60 text-muted-foreground hover:text-foreground'
            }`}
            style={{ paddingLeft: `${depth * 12}px` }}
          >
            {hasChildren ? (
              <button
                type="button"
                className="p-0.5 text-muted-foreground/70 hover:text-foreground shrink-0"
                onClick={() => toggleExpanded(node.id)}
                title={isOpen ? 'Collapse' : 'Expand'}
              >
                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <button
              className="flex-1 truncate text-left py-1.5 text-sm"
              onClick={() => setSelectedDocId(node.id)}
            >
              {node.icon ? <span className="mr-1">{node.icon}</span> : null}
              {node.title}
            </button>
            <button
              type="button"
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-card/80 text-muted-foreground shrink-0"
              title="Add sub-page"
              onClick={() => createDoc.mutate({ parentDocId: node.id })}
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          {hasChildren && isOpen && renderDocNodes(node.id, depth + 1)}
        </div>
      )
    })

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
          {renderDocNodes(null, 0)}
        </div>
        <div className="border-t border-border/60 p-2 space-y-2">
          <Input
            value={newDocName}
            onChange={(e) => setNewDocName(e.target.value)}
            placeholder="New page name"
            className="h-9"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => createDoc.mutate({})}
              disabled={createDoc.isPending}
            >
              <Plus className="h-3.5 w-3.5" /> Add page
            </Button>
            <Button
              size="sm"
              variant="ghost"
              title="Create from a template"
              onClick={() => setTemplatesOpen(true)}
            >
              <Layers className="h-3.5 w-3.5" /> Templates
            </Button>
          </div>
        </div>
      </div>

      <DocTemplatesDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        workspaceId={workspaceId}
        onPick={(t: DocTemplate) => createDoc.mutate({ title: t.title, content: t.content })}
        onPickSaved={(templateId) => createFromTemplate.mutate(templateId)}
      />

      {createTask.open && (
        <CreateTaskFromDocDialog
          workspaceId={workspaceId}
          initialTitle={createTask.title}
          onClose={() => setCreateTask({ open: false, title: '' })}
          onCreated={(task, taskPath) =>
            editor
              ?.chain()
              .focus()
              .insertContent([
                { type: 'text', marks: [{ type: 'link', attrs: { href: taskPath } }], text: `↗ ${task.title}` },
                { type: 'text', text: ' ' },
              ])
              .run()
          }
        />
      )}

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
                title="Save this doc as a reusable template"
                disabled={saveAsTemplate.isPending}
                onClick={() => {
                  const name = window.prompt('Template name', activeDoc.title)?.trim()
                  if (name) saveAsTemplate.mutate(name)
                }}
              >
                <Layers className="h-3.5 w-3.5" />
              </Button>
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
                variant={editor?.isActive('underline') ? 'secondary' : 'ghost'}
                onClick={() => editor?.chain().focus().toggleUnderline().run()}
                disabled={!editor}
                title="Underline"
              >
                <Underline className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={editor?.isActive('strike') ? 'secondary' : 'ghost'}
                onClick={() => editor?.chain().focus().toggleStrike().run()}
                disabled={!editor}
                title="Strikethrough"
              >
                <Strikethrough className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={editor?.isActive('link') ? 'secondary' : 'ghost'}
                onClick={toggleLink}
                disabled={!editor}
                title="Link"
              >
                <Link className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={editor?.isActive('heading', { level: 1 }) ? 'secondary' : 'ghost'}
                onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
                disabled={!editor}
                title="Heading 1"
              >
                <Heading1 className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={editor?.isActive('heading', { level: 2 }) ? 'secondary' : 'ghost'}
                onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                disabled={!editor}
                title="Heading 2"
              >
                H2
              </Button>
              <Button
                size="sm"
                variant={editor?.isActive('heading', { level: 3 }) ? 'secondary' : 'ghost'}
                onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
                disabled={!editor}
                title="Heading 3"
              >
                <Heading3 className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={editor?.isActive('paragraph') ? 'secondary' : 'ghost'}
                onClick={() => editor?.chain().focus().setParagraph().run()}
                disabled={!editor}
                title="Normal text"
              >
                <Pilcrow className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={editor?.isActive('bulletList') ? 'secondary' : 'ghost'}
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
                disabled={!editor}
                title="Bullet list"
              >
                List
              </Button>
              <Button
                size="sm"
                variant={editor?.isActive('orderedList') ? 'secondary' : 'ghost'}
                onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                disabled={!editor}
                title="Numbered list"
              >
                <ListOrdered className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={editor?.isActive('taskList') ? 'secondary' : 'ghost'}
                onClick={() => editor?.chain().focus().toggleTaskList().run()}
                disabled={!editor}
                title="Todo list"
              >
                Todo
              </Button>
              <Button
                size="sm"
                variant={editor?.isActive('codeBlock') ? 'secondary' : 'ghost'}
                onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
                disabled={!editor}
                title="Code block"
              >
                Code
              </Button>
              {/* Font color */}
              <span className="relative inline-flex">
                <Button
                  size="sm"
                  variant={colorOpen ? 'secondary' : 'ghost'}
                  onClick={() => setColorOpen((v) => !v)}
                  disabled={!editor}
                  title="Text color"
                >
                  <Palette className="h-3.5 w-3.5" />
                </Button>
                {colorOpen && (
                  <div className="absolute z-40 top-9 left-0 w-44 rounded-md border border-border bg-card shadow-lg p-2">
                    <div className="grid grid-cols-5 gap-1.5">
                      {TEXT_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="h-6 w-6 rounded-full border border-border/60"
                          style={{ backgroundColor: c }}
                          onClick={() => applyColor(c)}
                          title={c}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <label className="text-[11px] text-muted-foreground flex items-center gap-1 cursor-pointer">
                        Custom
                        <input
                          type="color"
                          className="h-6 w-6 cursor-pointer rounded border border-border bg-transparent p-0"
                          onChange={(e) => applyColor(e.target.value)}
                        />
                      </label>
                      <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={clearColor}>
                        Clear
                      </button>
                    </div>
                  </div>
                )}
              </span>
              {/* Alignment */}
              <Button size="sm" variant={editor?.isActive({ textAlign: 'left' }) ? 'secondary' : 'ghost'} onClick={() => setAlign('left')} disabled={!editor} title="Align left">
                <AlignLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant={editor?.isActive({ textAlign: 'center' }) ? 'secondary' : 'ghost'} onClick={() => setAlign('center')} disabled={!editor} title="Align center">
                <AlignCenter className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant={editor?.isActive({ textAlign: 'right' }) ? 'secondary' : 'ghost'} onClick={() => setAlign('right')} disabled={!editor} title="Align right">
                <AlignRight className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant={editor?.isActive({ textAlign: 'justify' }) ? 'secondary' : 'ghost'} onClick={() => setAlign('justify')} disabled={!editor} title="Justify">
                <AlignJustify className="h-3.5 w-3.5" />
              </Button>
              {/* Insert menu */}
              <span className="relative inline-flex">
                <Button
                  size="sm"
                  variant={insertOpen ? 'secondary' : 'ghost'}
                  onClick={() => setInsertOpen((v) => !v)}
                  disabled={!editor}
                  title="Insert"
                >
                  <Plus className="h-3.5 w-3.5 mr-0.5" /> Insert <ChevronDown className="h-3 w-3 ml-0.5" />
                </Button>
                {insertOpen && (
                  <div className="absolute z-40 top-9 left-0 w-56 rounded-md border border-border bg-card shadow-lg overflow-hidden">
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 flex items-center gap-2" onClick={() => { setInsertOpen(false); toggleLink() }}>
                      <Link className="h-3.5 w-3.5" /> Link
                    </button>
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 flex items-center gap-2" onClick={() => { setInsertOpen(false); editor?.chain().focus().toggleTaskList().run() }}>
                      <CheckSquare className="h-3.5 w-3.5" /> Checklist
                    </button>
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 flex items-center gap-2" onClick={openCreateTaskFromSelection}>
                      <Plus className="h-3.5 w-3.5" /> Create task from selection
                    </button>
                    <div className="border-t border-border max-h-40 overflow-auto">
                      <div className="px-3 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">Embed doc</div>
                      {(docsQuery.data ?? []).filter((d) => d.id !== selectedDocId).slice(0, 20).map((d) => (
                        <button key={d.id} className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-50 truncate flex items-center gap-2" onClick={() => embedDoc(d)}>
                          <FileText className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{d.title || 'Untitled'}</span>
                        </button>
                      ))}
                      {(docsQuery.data ?? []).filter((d) => d.id !== selectedDocId).length === 0 && (
                        <div className="px-3 py-1.5 text-xs text-muted-foreground">No other docs to embed</div>
                      )}
                    </div>
                  </div>
                )}
              </span>
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
              <span className="relative inline-flex">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => runAi('improve')}
                  disabled={!editor || improving}
                  title="Improve writing with AI"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  {improving ? 'Working…' : 'AI'}
                </Button>
                <Button
                  size="sm"
                  variant={aiMenuOpen ? 'secondary' : 'ghost'}
                  onClick={() => setAiMenuOpen((v) => !v)}
                  disabled={!editor || improving}
                  title="More AI actions"
                >
                  <ChevronDown className="h-3 w-3" />
                </Button>
                {aiMenuOpen && (
                  <div className="absolute z-40 top-9 right-0 w-44 rounded-md border border-border bg-card shadow-lg overflow-hidden">
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50" onClick={() => runAi('improve')}>Improve writing</button>
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50" onClick={() => runAi('shorten')}>Make shorter</button>
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50" onClick={() => runAi('expand')}>Expand</button>
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50" onClick={() => runAi('format')}>Fix grammar &amp; format</button>
                  </div>
                )}
              </span>
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

function CreateTaskFromDocDialog({
  workspaceId,
  initialTitle,
  onClose,
  onCreated,
}: {
  workspaceId: string
  initialTitle: string
  onClose: () => void
  onCreated: (task: { id: string; title: string }, taskPath: string) => void
}) {
  const [title, setTitle] = useState(initialTitle)
  const [spaceId, setSpaceId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [listId, setListId] = useState('')

  const spaces = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/spaces/workspace/${workspaceId}`),
  })
  const projects = useQuery({
    enabled: !!spaceId,
    queryKey: ['projects', spaceId],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/projects/space/${spaceId}`),
  })
  const lists = useQuery({
    enabled: !!projectId,
    queryKey: ['lists', projectId],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/lists/project/${projectId}`),
  })

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string; title: string }>(`/tasks`, { method: 'POST', body: { listId, title: title.trim() } }),
    onSuccess: (task) => {
      toast.success('Task created')
      onCreated(task, `/app/${workspaceId}/${spaceId}/${projectId}/${listId}?task=${task.id}`)
      onClose()
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not create task'),
  })

  const selectCls =
    'w-full h-9 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 space-y-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold">Create task from selection</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" title="Close">
            ✕
          </button>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Task title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
        </div>
        <div className="grid grid-cols-1 gap-2">
          <select
            className={selectCls}
            value={spaceId}
            onChange={(e) => {
              setSpaceId(e.target.value)
              setProjectId('')
              setListId('')
            }}
          >
            <option value="">Select space…</option>
            {(spaces.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            className={selectCls}
            value={projectId}
            disabled={!spaceId}
            onChange={(e) => {
              setProjectId(e.target.value)
              setListId('')
            }}
          >
            <option value="">Select project…</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select className={selectCls} value={listId} disabled={!projectId} onChange={(e) => setListId(e.target.value)}>
            <option value="">Select list…</option>
            {(lists.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="gradient"
            disabled={!title.trim() || !listId || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Creating…' : 'Create task'}
          </Button>
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
