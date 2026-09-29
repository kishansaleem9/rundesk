import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  toast,
} from '@rundesk/ui'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Archive,
  ArchiveRestore,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  Globe,
  GlobeLock,
  Heading1,
  Heading3,
  History,
  Info,
  Layers,
  Link,
  Link2,
  ListOrdered,
  MessageCircle,
  MessagesSquare,
  Minus,
  MoreHorizontal,
  Network,
  Palette,
  Pilcrow,
  Plus,
  RotateCcw,
  Rows3,
  Slash,
  Sparkles,
  Star,
  Strikethrough,
  Table as TableIcon,
  Trash2,
  Underline,
  // §1.3 [10:13] — the tree's own collapse control.
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { useSidebarStore } from '../store/sidebar'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import TextAlign from '@tiptap/extension-text-align'
import { TableKit } from '@tiptap/extension-table'
import { api, ApiError, downloadFile } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { getRealtimeSocket } from '../lib/realtime'
import { createMentionExtension, type MentionMember } from '../lib/tiptap-mention'
import { useFavorites, useToggleFavorite } from '../lib/use-favorites'
import { Callout, ListEmbed } from '../lib/tiptap-doc-blocks'
import { MentionText } from './mention-text'
import { DocTemplatesDialog, DOC_TEMPLATES, type DocTemplate } from './doc-templates'
import { useMentionNames } from '../hooks/use-mention-names'
import { InlineSkeleton } from './loading-skeletons'
import { relativeTime } from '../lib/relative-time'

type Doc = {
  id: string
  title: string
  content: Record<string, unknown>
  createdAt: string
  updatedAt: string
  parentDocId?: string | null
  icon?: string | null
  position?: number
  publicShareId?: string | null
  publicShareEnabledAt?: string | null
  // A5.7 — the index-table columns; all denormalised by the list endpoint.
  createdById?: string | null
  createdByName?: string | null
  createdByEmail?: string | null
  spaceId?: string | null
  spaceName?: string | null
  subpageCount?: number
  shareCount?: number
  isArchived?: boolean
}

/**
 * What the reader may do to a doc: the checks its routes ask
 * (`GET /docs/:id/capabilities`). One query for the page and its share button.
 */
type DocCapabilities = { edit: boolean; delete: boolean; makeLink: boolean; revokeLink: boolean }
function useDocCapabilities(docId: string | null | undefined) {
  return useQuery({
    queryKey: ['doc-capabilities', docId],
    queryFn: () => api<DocCapabilities>(`/docs/${docId}/capabilities`),
    enabled: Boolean(docId),
    staleTime: 30_000,
  })
}

/** A5.6 — the docs-hub buckets. Mirrors DOC_SCOPES on the API. */
const DOC_SCOPES = ['all', 'mine', 'shared', 'archived'] as const
type DocScope = (typeof DOC_SCOPES)[number]

const SCOPE_LABEL: Record<DocScope, TranslationKey> = {
  all: 'docs.scopeAll',
  mine: 'docs.scopeMine',
  shared: 'docs.scopeShared',
  archived: 'docs.scopeArchived',
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
  const navigate = useNavigate()
  const { t } = useTranslation()
  // §1.3 [10:13] — the page tree collapses too, and remembers per person.
  const treeCollapsed = useSidebarStore((s) => s.panels.docs === true)
  const togglePanel = useSidebarStore((s) => s.togglePanel)
  /*
   * Which doc is open is the URL, not a copy of it taken at mount.
   *
   * `?doc=` was read once here, out of `window.location.search`, and never
   * written — this file contained no `navigate` at all. So the deep link was
   * inbound-only: clicking a page in the tree changed nothing in the address,
   * a reload put you on `docsQuery.data[0]` (the auto-select below), and
   * copying the address bar sent a colleague the docs index rather than the
   * doc you were writing.
   *
   * The app has been generating exactly this link the whole time — the insert
   * menu writes `/app/<ws>/docs?doc=<id>` into doc bodies, and the search
   * indexer builds the same URL — so the format was settled; only the write
   * was missing.
   */
  const search = useSearch({ from: '/app/$workspaceId/docs' })
  const selectedDocId = search.doc ?? null
  const setSelectedDocId = (id: string | null) =>
    navigate({
      to: '/app/$workspaceId/docs',
      params: { workspaceId },
      search: (prev: Record<string, unknown>) => ({ ...prev, doc: id ?? undefined }),
      replace: true,
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
  /*
   * The bucket rail is an address too: "the archived docs" is a thing to send
   * somebody, and it survives a reload for the same reason the doc does.
   * Changing bucket drops `doc`, because the doc you had open is usually not
   * in the bucket you just moved to.
   */
  const scope: DocScope = search.scope ?? 'all'
  const setScope = (next: DocScope) =>
    navigate({
      to: '/app/$workspaceId/docs',
      params: { workspaceId },
      search: { scope: next === 'all' ? undefined : next },
      replace: true,
    })
  const [pane, setPane] = useState<'editor' | 'index'>('editor')
  const [pickerMode, setPickerMode] = useState<'listEmbed' | 'linkTask' | null>(null)
  const editorWrapRef = useRef<HTMLDivElement | null>(null)

  const docsQuery = useQuery({
    queryKey: ['docs', workspaceId, scope],
    queryFn: () => api<Doc[]>(`/workspaces/${workspaceId}/docs?scope=${scope}`),
  })

  // A5.6 — bucket totals sit on the rail itself, so switching scope is an
  // informed choice rather than a probe.
  const scopeCountsQuery = useQuery({
    queryKey: ['doc-scope-counts', workspaceId],
    queryFn: () => api<Record<DocScope, number>>(`/workspaces/${workspaceId}/docs/scope-counts`),
  })

  const favoritesQuery = useFavorites(workspaceId)
  const favoriteDocs = useMemo(
    () => (favoritesQuery.data ?? []).filter((f) => f.entityType === 'doc'),
    [favoritesQuery.data],
  )
  const favoriteDocIds = useMemo(() => new Set(favoriteDocs.map((f) => f.entityId)), [favoriteDocs])
  const toggleFavorite = useToggleFavorite(workspaceId)

  useEffect(() => {
    // Landing with no doc named picks the first and says so in the address,
    // so what you are looking at is always shareable — including the default.
    if (!selectedDocId && docsQuery.data?.length) {
      setSelectedDocId(docsQuery.data[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      Placeholder.configure({ placeholder: t('docs.editorPlaceholder') }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      // A5.8 — table + the two blocks that don't exist upstream.
      TableKit.configure({ table: { resizable: true } }),
      Callout,
      ListEmbed,
      mentionExtension,
    ],
    content: activeDoc?.content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    immediatelyRender: false,
    // Read only until the doc's capabilities say Edit (`mayEdit` below).
    editable: false,
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
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('docs.couldNotCreateFromTemplate')),
  })

  // Save the open doc as a reusable workspace template.
  const saveAsTemplate = useMutation({
    mutationFn: (name: string) =>
      api(`/workspaces/${workspaceId}/doc-templates`, {
        method: 'POST',
        body: { docId: selectedDocId, name },
      }),
    onSuccess: async () => {
      toast.success(t('docs.savedAsTemplate'))
      await qc.invalidateQueries({ queryKey: ['doc-templates', workspaceId] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('docs.couldNotSaveTemplate')),
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
        toast(t('docs.docUpdatedByTeammate'), {
          description: t('docs.docUpdatedDescription'),
        })
      } else {
        // Any other refusal is said, and the level asked again: a View or
        // Comment share's 403 was dropped, and the words looked saved until a
        // reload (`found-28-sep/doc-editor-open-to-readers`).
        toast.error(error instanceof ApiError ? error.message : t('docs.couldNotSave'))
        await qc.invalidateQueries({ queryKey: ['doc-capabilities', selectedDocId] })
      }
      await qc.invalidateQueries({ queryKey: ['docs', workspaceId] })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['docs', workspaceId] })
    },
  })

  /*
   * THE OPEN DOC AT THE READER'S LEVEL (`found-28-sep/doc-editor-open-to-readers`):
   * below Edit the editor is read only and nothing that changes the doc is
   * offered, and until the answer comes nothing is editable. The editor took
   * typing from everyone who could open the doc.
   */
  const capsQuery = useDocCapabilities(activeDoc?.id)
  const mayEdit = capsQuery.data?.edit === true
  const mayDelete = capsQuery.data?.delete === true
  const readOnlyShown = Boolean(activeDoc && capsQuery.data && !mayEdit)
  useEffect(() => {
    if (editor && editor.isEditable !== mayEdit) editor.setEditable(mayEdit)
  }, [editor, mayEdit])

  /*
   * ARCHIVE, UNARCHIVE AND DELETE, from the doc's own menu, at Edit
   * (`found-28-sep/docs-offer-no-archive-or-delete`): the panel had an Archived
   * bucket and nothing that sent a doc there. ClickUp: "Anyone, including
   * guests, with Edit permissions can archive and unarchive Docs". An archived
   * doc is opened in the Archived bucket, where Unarchive is; either way it is
   * in the Trash of whoever sent it (`doc-archive-and-delete-at-two-levels`).
   */
  const openIn = (docId: string | null, nextScope: DocScope) =>
    navigate({
      to: '/app/$workspaceId/docs',
      params: { workspaceId },
      search: { scope: nextScope === 'all' ? undefined : nextScope, doc: docId ?? undefined },
      replace: true,
    })
  const refreshDocs = async () => {
    await qc.invalidateQueries({ queryKey: ['docs', workspaceId] })
    await qc.invalidateQueries({ queryKey: ['doc-scope-counts', workspaceId] })
  }
  const archiveDoc = useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) =>
      api(`/docs/${id}`, { method: 'PATCH', body: JSON.stringify({ isArchived: archive }) }),
    onSuccess: async (_row, { id, archive }) => {
      toast.success(t(archive ? 'docs.archivedToast' : 'docs.unarchivedToast'))
      await refreshDocs()
      openIn(id, archive ? 'archived' : 'all')
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('docs.couldNotArchive')),
  })
  const deleteDoc = useMutation({
    mutationFn: (id: string) => api(`/docs/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(t('docs.movedToTrash'))
      setSelectedDocId(null)
      await refreshDocs()
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('docs.couldNotDelete')),
  })

  type SlashCommand = 'h2' | 'todo' | 'bullet' | 'code' | 'quote' | 'divider' | 'callout' | 'table' | 'listEmbed'

  const runSlashCommand = (id: SlashCommand) => {
    if (!editor) return
    const chain = editor.chain().focus()
    if (id === 'h2') chain.toggleHeading({ level: 2 }).run()
    if (id === 'todo') chain.toggleTaskList().run()
    if (id === 'bullet') chain.toggleBulletList().run()
    if (id === 'code') chain.toggleCodeBlock().run()
    if (id === 'quote') chain.toggleBlockquote().run()
    if (id === 'divider') chain.setHorizontalRule().run()
    if (id === 'callout') chain.toggleCallout().run()
    if (id === 'table') chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    // The embed needs a target, so the command opens the list picker instead
    // of inserting a block that points at nothing.
    if (id === 'listEmbed') setPickerMode('listEmbed')
    setSlashOpen(false)
  }

  const insertListEmbed = (list: { id: string; name: string }) => {
    editor?.chain().focus().insertListEmbed({ listId: list.id, listName: list.name }).run()
    setPickerMode(null)
    setInsertOpen(false)
  }

  // A5.8 — linking a task from the doc side; the task detail already links the
  // other way (task-linked-docs.tsx).
  const linkExistingTask = (task: { id: string; title: string }, taskPath: string) => {
    editor
      ?.chain()
      .focus()
      .insertContent([
        { type: 'text', marks: [{ type: 'link', attrs: { href: taskPath } }], text: `↗ ${task.title}` },
        { type: 'text', text: ' ' },
      ])
      .run()
    setPickerMode(null)
    setInsertOpen(false)
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
    const url = window.prompt(t('docs.linkUrlPrompt'))
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
      toast.error(t('docs.nothingToEdit'))
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
      toast.error(error instanceof ApiError ? error.message : t('docs.aiRequestFailed'))
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

  const slashCommands: Array<{ id: SlashCommand; label: string }> = [
    { id: 'h2', label: t('docs.heading2') },
    { id: 'todo', label: t('docs.todoList') },
    { id: 'bullet', label: t('docs.bulletList') },
    { id: 'quote', label: t('docs.quoteBlock') },
    { id: 'code', label: t('docs.codeBlock') },
    { id: 'table', label: t('docs.tableBlock') },
    { id: 'divider', label: t('docs.dividerBlock') },
    { id: 'callout', label: t('docs.calloutBlock') },
    { id: 'listEmbed', label: t('docs.listEmbedBlock') },
  ]
  const slashItems = slashCommands.filter((item) =>
    item.label.toLowerCase().includes(slashFilter.toLowerCase()),
  )

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
                title={isOpen ? t('docs.collapse') : t('docs.expandNode')}
              >
                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <button
              className="flex-1 truncate text-left py-1.5 text-sm"
              data-testid={`docs-tree-item-${node.id}`}
              onClick={() => setSelectedDocId(node.id)}
            >
              {node.icon ? <span className="mr-1">{node.icon}</span> : null}
              {node.title}
            </button>
            <button
              type="button"
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-card/80 text-muted-foreground shrink-0"
              title={t('docs.addSubPage')}
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
      /*
       * §1.3 [10:13] — the tree collapses to a strip.
       *
       * "yeh DOUBLE NAVIGATION rakhi hui hai… kyunke yeh SPACE leta hai." On
       * /docs this column stacks against the 288px workspace sidebar, and with
       * comments and history both open the editor was down to whatever was
       * left of the screen after 1128px of chrome. 48px is enough for the
       * control that brings it back and nothing else — unlike chat, a document
       * tree has no icon that means anything at that width.
       */
      className={`grid grid-cols-1 ${
        treeCollapsed
          ? commentsOpen && historyOpen
            ? 'md:grid-cols-[48px_1fr_300px_300px]'
            : commentsOpen || historyOpen
              ? 'md:grid-cols-[48px_1fr_300px]'
              : 'md:grid-cols-[48px_1fr]'
          : commentsOpen && historyOpen
            ? 'md:grid-cols-[240px_1fr_300px_300px]'
            : commentsOpen || historyOpen
              ? 'md:grid-cols-[240px_1fr_300px]'
              : 'md:grid-cols-[240px_1fr]'
      } gap-0 h-[640px] overflow-hidden p-0`}
    >
      {/* Sidebar */}
      {treeCollapsed ? (
        <div
          data-testid="docs-tree-rail"
          data-collapsed="true"
          className="hidden md:flex border-b md:border-b-0 md:border-r border-border/60 bg-card/30 flex-col items-center py-3"
        >
          <button
            type="button"
            data-testid="docs-tree-expand"
            title={t('docs.expandTree')}
            aria-label={t('docs.expandTree')}
            onClick={() => togglePanel('docs')}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-card/60 hover:text-foreground"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
          {/* Vertical, because 48px of horizontal is not a word. It says what
              the strip is, so the arrow is not the only clue. */}
          <span
            className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
            style={{ writingMode: 'vertical-rl' }}
          >
            {t('docs.pages')}
          </span>
        </div>
      ) : (
      <div data-testid="docs-tree" data-collapsed="false" className="border-b md:border-b-0 md:border-r border-border/60 bg-card/30 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t('docs.pages')}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setPane((p) => (p === 'index' ? 'editor' : 'index'))}
              title={pane === 'index' ? t('docs.backToEditor') : t('docs.openIndex')}
              className={`p-1 rounded ${pane === 'index' ? 'text-accent' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Rows3 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              data-testid="docs-tree-collapse"
              title={t('docs.collapseTree')}
              aria-label={t('docs.collapseTree')}
              onClick={() => togglePanel('docs')}
              className="p-1 rounded text-muted-foreground hover:text-foreground"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* A5.6 — All / My / Shared with me / Archived, with counts. */}
        <div className="px-2 pt-2 grid grid-cols-2 gap-1">
          {DOC_SCOPES.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setScope(id)}
              className={`flex items-center justify-between gap-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
                scope === id
                  ? 'bg-accent/15 text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'
              }`}
            >
              <span className="truncate">{t(SCOPE_LABEL[id])}</span>
              <span className="tabular-nums opacity-70">{scopeCountsQuery.data?.[id] ?? 0}</span>
            </button>
          ))}
        </div>

        {favoriteDocs.length > 0 && (
          <div className="px-2 pt-2">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t('docs.favorites')}
            </div>
            {favoriteDocs.map((fav) => (
              <button
                key={fav.entityId}
                type="button"
                onClick={() => setSelectedDocId(fav.entityId)}
                className="w-full flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-card/60 hover:text-foreground"
              >
                <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                <span className="truncate">{fav.label}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-auto px-2 py-2 space-y-0.5">
          {docsQuery.data?.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              {scope === 'all' ? t('docs.noDocsYet') : t('docs.noDocsInScope')}
            </p>
          )}
          {renderDocNodes(null, 0)}
        </div>
        <div className="border-t border-border/60 p-2 space-y-2">
          <Input
            value={newDocName}
            onChange={(e) => setNewDocName(e.target.value)}
            placeholder={t('docs.newPageName')}
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
              <Plus className="h-3.5 w-3.5" /> {t('docs.addPage')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              title={t('docs.createFromTemplate')}
              onClick={() => setTemplatesOpen(true)}
            >
              <Layers className="h-3.5 w-3.5" /> {t('nav.templates')}
            </Button>
          </div>
        </div>
      </div>
      )}

      <DocTemplatesDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        workspaceId={workspaceId}
        onPick={(tpl: DocTemplate) => createDoc.mutate({ title: tpl.title, content: tpl.content })}
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

      {pickerMode && (
        <EmbedListPickerDialog
          workspaceId={workspaceId}
          mode={pickerMode}
          onClose={() => setPickerMode(null)}
          onPickList={insertListEmbed}
          onPickTask={linkExistingTask}
        />
      )}

      {/* Editor pane — or, in index mode, the A5.7 table over the same read. */}
      {pane === 'index' ? (
        <DocsIndexPane
          docs={docsQuery.data ?? []}
          isLoading={docsQuery.isLoading}
          favoriteDocIds={favoriteDocIds}
          onOpenDoc={(id) => {
            setSelectedDocId(id)
            setPane('editor')
          }}
          onToggleFavorite={(id) => toggleFavorite.mutate({ entityType: 'doc', entityId: id })}
        />
      ) : (
      <div className="flex flex-col min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-border/60">
          <h3 className="font-display text-base font-semibold truncate" data-testid="docs-active-title">
            {activeDoc?.title ?? t('docs.selectADoc')}
          </h3>
          {activeDoc && (
            <div className="flex flex-wrap items-center gap-1.5">
              {readOnlyShown && (
                <span
                  data-testid="doc-read-only"
                  title={t('docs.readOnlyHint')}
                  className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {t('docs.readOnly')}
                </span>
              )}
              <Button
                size="sm"
                variant="ghost"
                title={favoriteDocIds.has(activeDoc.id) ? t('docs.unfavorite') : t('docs.favorite')}
                onClick={() => toggleFavorite.mutate({ entityType: 'doc', entityId: activeDoc.id })}
              >
                <Star
                  className={`h-3.5 w-3.5 ${favoriteDocIds.has(activeDoc.id) ? 'fill-amber-400 text-amber-400' : ''}`}
                />
              </Button>
              <ShareDocButton doc={activeDoc} onShareChange={() => docsQuery.refetch()} />
              <Button
                size="sm"
                variant="ghost"
                title={t('docs.saveAsTemplateTip')}
                disabled={saveAsTemplate.isPending}
                onClick={() => {
                  const name = window.prompt(t('docs.templateNamePrompt'), activeDoc.title)?.trim()
                  if (name) saveAsTemplate.mutate(name)
                }}
              >
                <Layers className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                title={t('docs.exportMarkdown')}
                onClick={() => {
                  const base = (activeDoc.title || 'document').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document'
                  void downloadFile(`/docs/${activeDoc.id}/export`, `${base}.md`).catch(() =>
                    toast.error(t('docs.couldNotExport')),
                  )
                }}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                title={t('docs.exportPdf')}
                onClick={() => {
                  const base = (activeDoc.title || 'document').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document'
                  void downloadFile(`/docs/${activeDoc.id}/export?format=pdf`, `${base}.pdf`).catch(() =>
                    toast.error(t('docs.couldNotExport')),
                  )
                }}
              >
                <FileText className="h-3.5 w-3.5" />
              </Button>
              {mayEdit && (
              <>
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
                title={t('docs.underline')}
              >
                <Underline className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={editor?.isActive('strike') ? 'secondary' : 'ghost'}
                onClick={() => editor?.chain().focus().toggleStrike().run()}
                disabled={!editor}
                title={t('docs.strikethrough')}
              >
                <Strikethrough className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={editor?.isActive('link') ? 'secondary' : 'ghost'}
                onClick={toggleLink}
                disabled={!editor}
                title={t('docs.link')}
              >
                <Link className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={editor?.isActive('heading', { level: 1 }) ? 'secondary' : 'ghost'}
                onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
                disabled={!editor}
                title={t('docs.heading1')}
              >
                <Heading1 className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={editor?.isActive('heading', { level: 2 }) ? 'secondary' : 'ghost'}
                onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                disabled={!editor}
                title={t('docs.heading2')}
              >
                H2
              </Button>
              <Button
                size="sm"
                variant={editor?.isActive('heading', { level: 3 }) ? 'secondary' : 'ghost'}
                onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
                disabled={!editor}
                title={t('docs.heading3')}
              >
                <Heading3 className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={editor?.isActive('paragraph') ? 'secondary' : 'ghost'}
                onClick={() => editor?.chain().focus().setParagraph().run()}
                disabled={!editor}
                title={t('docs.normalText')}
              >
                <Pilcrow className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={editor?.isActive('bulletList') ? 'secondary' : 'ghost'}
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
                disabled={!editor}
                title={t('docs.bulletList')}
              >
                {t('docs.listShort')}
              </Button>
              <Button
                size="sm"
                variant={editor?.isActive('orderedList') ? 'secondary' : 'ghost'}
                onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                disabled={!editor}
                title={t('docs.numberedList')}
              >
                <ListOrdered className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={editor?.isActive('taskList') ? 'secondary' : 'ghost'}
                onClick={() => editor?.chain().focus().toggleTaskList().run()}
                disabled={!editor}
                title={t('docs.todoList')}
              >
                {t('docs.todoShort')}
              </Button>
              <Button
                size="sm"
                variant={editor?.isActive('codeBlock') ? 'secondary' : 'ghost'}
                onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
                disabled={!editor}
                title={t('docs.codeBlock')}
              >
                {t('docs.codeShort')}
              </Button>
              {/* Font color */}
              <span className="relative inline-flex">
                <Button
                  size="sm"
                  variant={colorOpen ? 'secondary' : 'ghost'}
                  onClick={() => setColorOpen((v) => !v)}
                  disabled={!editor}
                  title={t('docs.textColor')}
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
                        {t('docs.custom')}
                        <input
                          type="color"
                          className="h-6 w-6 cursor-pointer rounded border border-border bg-transparent p-0"
                          onChange={(e) => applyColor(e.target.value)}
                        />
                      </label>
                      <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={clearColor}>
                        {t('docs.clear')}
                      </button>
                    </div>
                  </div>
                )}
              </span>
              {/* Alignment */}
              <Button size="sm" variant={editor?.isActive({ textAlign: 'left' }) ? 'secondary' : 'ghost'} onClick={() => setAlign('left')} disabled={!editor} title={t('docs.alignLeft')}>
                <AlignLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant={editor?.isActive({ textAlign: 'center' }) ? 'secondary' : 'ghost'} onClick={() => setAlign('center')} disabled={!editor} title={t('docs.alignCenter')}>
                <AlignCenter className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant={editor?.isActive({ textAlign: 'right' }) ? 'secondary' : 'ghost'} onClick={() => setAlign('right')} disabled={!editor} title={t('docs.alignRight')}>
                <AlignRight className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant={editor?.isActive({ textAlign: 'justify' }) ? 'secondary' : 'ghost'} onClick={() => setAlign('justify')} disabled={!editor} title={t('docs.justify')}>
                <AlignJustify className="h-3.5 w-3.5" />
              </Button>
              {/* Insert menu */}
              <span className="relative inline-flex">
                <Button
                  size="sm"
                  variant={insertOpen ? 'secondary' : 'ghost'}
                  onClick={() => setInsertOpen((v) => !v)}
                  disabled={!editor}
                  title={t('docs.insert')}
                >
                  <Plus className="h-3.5 w-3.5 mr-0.5" /> {t('docs.insert')} <ChevronDown className="h-3 w-3 ml-0.5" />
                </Button>
                {insertOpen && (
                  <div className="absolute z-40 top-9 left-0 w-56 rounded-md border border-border bg-card shadow-lg overflow-hidden">
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 flex items-center gap-2" onClick={() => { setInsertOpen(false); toggleLink() }}>
                      <Link className="h-3.5 w-3.5" /> {t('docs.link')}
                    </button>
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 flex items-center gap-2" onClick={() => { setInsertOpen(false); editor?.chain().focus().toggleTaskList().run() }}>
                      <CheckSquare className="h-3.5 w-3.5" /> {t('docs.checklist')}
                    </button>
                    {/* A5.8 blocks */}
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 flex items-center gap-2" onClick={() => { setInsertOpen(false); runSlashCommand('table') }}>
                      <TableIcon className="h-3.5 w-3.5" /> {t('docs.tableBlock')}
                    </button>
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 flex items-center gap-2" onClick={() => { setInsertOpen(false); runSlashCommand('divider') }}>
                      <Minus className="h-3.5 w-3.5" /> {t('docs.dividerBlock')}
                    </button>
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 flex items-center gap-2" onClick={() => { setInsertOpen(false); runSlashCommand('callout') }}>
                      <Info className="h-3.5 w-3.5" /> {t('docs.calloutBlock')}
                    </button>
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 flex items-center gap-2" onClick={() => { setInsertOpen(false); setPickerMode('listEmbed') }}>
                      <ClipboardList className="h-3.5 w-3.5" /> {t('docs.listEmbedBlock')}
                    </button>
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 flex items-center gap-2" onClick={() => { setInsertOpen(false); setPickerMode('linkTask') }}>
                      <CheckSquare className="h-3.5 w-3.5" /> {t('docs.linkTask')}
                    </button>
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 flex items-center gap-2" onClick={openCreateTaskFromSelection}>
                      <Plus className="h-3.5 w-3.5" /> {t('docs.createTaskFromSelection')}
                    </button>
                    <div className="border-t border-border max-h-40 overflow-auto">
                      <div className="px-3 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">{t('docs.embedDoc')}</div>
                      {(docsQuery.data ?? []).filter((d) => d.id !== selectedDocId).slice(0, 20).map((d) => (
                        <button key={d.id} className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-50 truncate flex items-center gap-2" onClick={() => embedDoc(d)}>
                          <FileText className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{d.title || t('docs.untitled')}</span>
                        </button>
                      ))}
                      {(docsQuery.data ?? []).filter((d) => d.id !== selectedDocId).length === 0 && (
                        <div className="px-3 py-1.5 text-xs text-muted-foreground">{t('docs.noOtherDocs')}</div>
                      )}
                    </div>
                  </div>
                )}
              </span>
              </>
              )}
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
                title={commentsOpen ? t('docs.hideComments') : t('docs.showComments')}
              >
                <MessagesSquare className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={historyOpen ? 'secondary' : 'ghost'}
                onClick={() => setHistoryOpen((v) => !v)}
                disabled={!activeDoc}
                title={historyOpen ? t('docs.hideVersionHistory') : t('docs.versionHistory')}
              >
                <History className="h-3.5 w-3.5" />
              </Button>
              {mayEdit && (
              <>
              <span className="relative inline-flex">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => runAi('improve')}
                  disabled={!editor || improving}
                  title={t('docs.improveWritingAi')}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  {improving ? t('docs.working') : t('docs.ai')}
                </Button>
                <Button
                  size="sm"
                  variant={aiMenuOpen ? 'secondary' : 'ghost'}
                  onClick={() => setAiMenuOpen((v) => !v)}
                  disabled={!editor || improving}
                  title={t('docs.moreAiActions')}
                >
                  <ChevronDown className="h-3 w-3" />
                </Button>
                {aiMenuOpen && (
                  <div className="absolute z-40 top-9 right-0 w-44 rounded-md border border-border bg-card shadow-lg overflow-hidden">
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50" onClick={() => runAi('improve')}>{t('docs.improveWriting')}</button>
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50" onClick={() => runAi('shorten')}>{t('docs.makeShorter')}</button>
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50" onClick={() => runAi('expand')}>{t('docs.expand')}</button>
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50" onClick={() => runAi('format')}>{t('docs.fixGrammar')}</button>
                  </div>
                )}
              </span>
              <Button
                size="sm"
                variant="gradient"
                onClick={() => saveDoc.mutate()}
                disabled={saveDoc.isPending}
              >
                {saveDoc.isPending ? t('common.saving') : t('common.save')}
              </Button>
              </>
              )}
              {(mayEdit || mayDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      data-testid="doc-more-menu"
                      aria-label={t('docs.moreActions')}
                      title={t('docs.moreActions')}
                      className="inline-flex h-8 items-center rounded-md px-2 text-muted-foreground hover:bg-surface-50 hover:text-foreground"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {mayEdit && (
                      <DropdownMenuItem
                        disabled={archiveDoc.isPending}
                        onSelect={() => archiveDoc.mutate({ id: activeDoc.id, archive: !activeDoc.isArchived })}
                      >
                        {activeDoc.isArchived ? (
                          <ArchiveRestore className="h-3.5 w-3.5 mr-2" />
                        ) : (
                          <Archive className="h-3.5 w-3.5 mr-2" />
                        )}
                        {t(activeDoc.isArchived ? 'docs.unarchive' : 'docs.archive')}
                      </DropdownMenuItem>
                    )}
                    {/* An archived doc is in the Trash already: Delete would change nothing. */}
                    {mayDelete && !activeDoc.isArchived && (
                      <DropdownMenuItem
                        className="text-destructive"
                        disabled={deleteDoc.isPending}
                        onSelect={() => deleteDoc.mutate(activeDoc.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        {t('docs.delete')}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>
        <div ref={editorWrapRef} className="relative flex-1 overflow-auto px-6 py-5 prose prose-invert prose-sm max-w-none">
          {activeDoc ? (
            <EditorContent editor={editor} />
          ) : (
            /* A5.9 — the starter templates belong where a new user actually
               lands, not behind an icon in the sidebar. */
            <DocsEmptyState
              hasDocs={(docsQuery.data ?? []).length > 0}
              onPickTemplate={(tpl) => createDoc.mutate({ title: tpl.title, content: tpl.content })}
              onBlank={() => createDoc.mutate({})}
            />
          )}
          {slashOpen && activeDoc && (
            <div className="absolute top-4 right-4 z-30 w-52 rounded-md border border-border bg-card shadow-lg overflow-hidden">
              <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border flex items-center gap-1">
                <Slash className="h-3 w-3" /> {t('docs.slashMenu')}
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
                <div className="px-3 py-2 text-xs text-muted-foreground">{t('docs.noCommands')}</div>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {activeDoc && <DocLinkedTasks docId={activeDoc.id} workspaceId={workspaceId} />}

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

/**
 * A5.7 — the sortable index ClickUp shows beside the tree: Name (with subpage
 * count and a padlock for a doc nobody else can reach), Location, Created by,
 * Date updated, Sharing. Every column is already on the list response; "Date
 * viewed" is dropped because nothing in the product records it.
 */
function DocsIndexPane({
  docs,
  isLoading,
  favoriteDocIds,
  onOpenDoc,
  onToggleFavorite,
}: {
  docs: Doc[]
  isLoading: boolean
  favoriteDocIds: Set<string>
  onOpenDoc: (id: string) => void
  onToggleFavorite: (id: string) => void
}) {
  const { t, locale } = useTranslation()
  const [sortBy, setSortBy] = useState<'title' | 'updatedAt' | 'createdByName'>('updatedAt')
  const [asc, setAsc] = useState(false)

  const byId = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs])
  const rows = useMemo(() => {
    const sorted = [...docs]
    sorted.sort((a, b) => {
      const av = (sortBy === 'updatedAt' ? a.updatedAt : (a[sortBy] ?? '')) as string
      const bv = (sortBy === 'updatedAt' ? b.updatedAt : (b[sortBy] ?? '')) as string
      const cmp = sortBy === 'updatedAt' ? av.localeCompare(bv) : av.localeCompare(bv, undefined, { sensitivity: 'base' })
      return asc ? cmp : -cmp
    })
    return sorted
  }, [docs, sortBy, asc])

  const toggleSort = (column: typeof sortBy) => {
    if (column === sortBy) setAsc((v) => !v)
    else {
      setSortBy(column)
      setAsc(column !== 'updatedAt')
    }
  }

  const headerCls = 'text-start font-semibold px-3 py-2 cursor-pointer select-none hover:text-foreground'

  return (
    <div className="flex flex-col min-w-0 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card/95 backdrop-blur">
          <tr className="border-b border-border/60 text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className={headerCls} onClick={() => toggleSort('title')}>{t('docs.colName')}</th>
            <th className="text-start font-semibold px-3 py-2">{t('docs.colLocation')}</th>
            <th className={headerCls} onClick={() => toggleSort('createdByName')}>{t('docs.colCreatedBy')}</th>
            <th className={headerCls} onClick={() => toggleSort('updatedAt')}>{t('docs.colUpdated')}</th>
            <th className="text-start font-semibold px-3 py-2">{t('docs.colSharing')}</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr><td colSpan={5} className="px-3 py-4 text-xs text-muted-foreground"><InlineSkeleton /></td></tr>
          )}
          {!isLoading && rows.length === 0 && (
            <tr><td colSpan={5} className="px-3 py-4 text-xs text-muted-foreground">{t('docs.noDocsInScope')}</td></tr>
          )}
          {rows.map((doc) => {
            const parent = doc.parentDocId ? byId.get(doc.parentDocId) : undefined
            const location = parent?.title ?? doc.spaceName ?? t('common.workspace')
            return (
              <tr key={doc.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30 group">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(doc.id)}
                      title={favoriteDocIds.has(doc.id) ? t('docs.unfavorite') : t('docs.favorite')}
                      className="shrink-0 text-muted-foreground hover:text-amber-400"
                    >
                      <Star className={`h-3 w-3 ${favoriteDocIds.has(doc.id) ? 'fill-amber-400 text-amber-400' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenDoc(doc.id)}
                      className="truncate text-start hover:text-accent"
                    >
                      {doc.icon ? <span className="me-1">{doc.icon}</span> : null}
                      {doc.title}
                    </button>
                    {(doc.subpageCount ?? 0) > 0 && (
                      <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Network className="h-3 w-3" />
                        {doc.subpageCount}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground truncate">{location}</td>
                <td className="px-3 py-2 text-muted-foreground truncate">
                  {doc.createdByName ?? doc.createdByEmail ?? t('docs.unknown')}
                </td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{relativeTime(doc.updatedAt, locale)}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  <span className="inline-flex items-center gap-1 text-xs">
                    {doc.publicShareId ? (
                      <><Globe className="h-3 w-3" /> {t('docs.sharingPublic')}</>
                    ) : (doc.shareCount ?? 0) > 0 ? (
                      <><Link2 className="h-3 w-3" /> {t('docs.sharingShared', { count: doc.shareCount ?? 0 })}</>
                    ) : (
                      <><GlobeLock className="h-3 w-3" /> {t('docs.sharingPrivate')}</>
                    )}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** A5.9 — starter cards on the surface a new user actually lands on. */
function DocsEmptyState({
  hasDocs,
  onPickTemplate,
  onBlank,
}: {
  hasDocs: boolean
  onPickTemplate: (template: DocTemplate) => void
  onBlank: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="max-w-2xl">
      <h4 className="font-display text-lg font-semibold">{hasDocs ? t('docs.pickAPage') : t('docs.startHere')}</h4>
      <p className="text-sm text-muted-foreground mt-1">{t('docs.startHereDesc')}</p>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
        {DOC_TEMPLATES.slice(0, 3).map((tpl) => (
          <button
            key={tpl.id}
            onClick={() => onPickTemplate(tpl)}
            className="text-left rounded-lg border border-border/60 bg-card/40 p-3 hover:border-accent/50 hover:bg-card/70 transition-all"
          >
            <div className="text-xl">{tpl.emoji}</div>
            <div className="text-sm font-medium mt-1.5">{t(tpl.nameKey)}</div>
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t(tpl.descKey)}</p>
          </button>
        ))}
      </div>
      <Button size="sm" variant="outline" className="mt-3" onClick={onBlank}>
        <Plus className="h-3.5 w-3.5" /> {t('docs.blankDoc')}
      </Button>
    </div>
  )
}

/**
 * Space → project → list picker, shared by the two A5.8 features that need a
 * target: the live-List embed block, and linking an existing task from the doc
 * side (task→doc linking previously only worked from the task).
 */
function EmbedListPickerDialog({
  workspaceId,
  mode,
  onClose,
  onPickList,
  onPickTask,
}: {
  workspaceId: string
  mode: 'listEmbed' | 'linkTask'
  onClose: () => void
  onPickList: (list: { id: string; name: string }) => void
  onPickTask: (task: { id: string; title: string }, taskPath: string) => void
}) {
  const { t } = useTranslation()
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
  const tasks = useQuery({
    enabled: mode === 'linkTask' && !!listId,
    queryKey: ['doc-link-tasks', listId],
    queryFn: () => api<Array<{ id: string; title: string }>>(`/tasks/list/${listId}`),
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
          <h3 className="font-display text-base font-semibold">
            {mode === 'linkTask' ? t('docs.linkTask') : t('docs.listEmbedBlock')}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" title={t('common.close')}>
            ✕
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {mode === 'linkTask' ? t('docs.linkTaskHint') : t('docs.listEmbedHint')}
        </p>
        <select
          className={selectCls}
          value={spaceId}
          onChange={(e) => {
            setSpaceId(e.target.value)
            setProjectId('')
            setListId('')
          }}
        >
          <option value="">{t('docs.selectSpace')}</option>
          {(spaces.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
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
          <option value="">{t('docs.selectProject')}</option>
          {(projects.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {mode === 'linkTask' && (
          <select className={selectCls} value={listId} disabled={!projectId} onChange={(e) => setListId(e.target.value)}>
            <option value="">{t('docs.selectList')}</option>
            {(lists.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}
        <div className="max-h-48 overflow-auto rounded-md border border-border/60 divide-y divide-border/40">
          {mode === 'listEmbed' ? (
            <>
              {!projectId && <p className="px-3 py-2 text-xs text-muted-foreground">{t('docs.selectList')}</p>}
              {projectId && (lists.data ?? []).length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">{t('docs.noListsInProject')}</p>
              )}
              {projectId &&
                (lists.data ?? []).map((l) => (
                  <button
                    key={l.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50"
                    onClick={() => onPickList({ id: l.id, name: l.name })}
                  >
                    {l.name}
                  </button>
                ))}
            </>
          ) : (
            <>
              {!listId && <p className="px-3 py-2 text-xs text-muted-foreground">{t('docs.selectList')}</p>}
              {listId && (tasks.data ?? []).length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">{t('docs.noTasksInList')}</p>
              )}
              {listId &&
                (tasks.data ?? []).map((task) => (
                  <button
                    key={task.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 truncate"
                    onClick={() =>
                      onPickTask(task, `/app/${workspaceId}/${spaceId}/${projectId}/${listId}?task=${task.id}`)
                    }
                  >
                    {task.title}
                  </button>
                ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
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
  const { t, locale } = useTranslation()
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
      toast.success(t('docs.versionRestored'))
    },
    onError: () => toast.error(t('docs.couldNotRestoreVersion')),
  })
  const revs = revisionsQuery.data ?? []
  return (
    <div className="border-l border-border/60 bg-card/40 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4" /> {t('docs.versionHistory')}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} title={t('common.close')}>
          ✕
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-1.5">
        {revisionsQuery.isLoading && <p className="text-xs text-muted-foreground px-2 py-1"><InlineSkeleton /></p>}
        {!revisionsQuery.isLoading && revs.length === 0 && (
          <p className="text-xs text-muted-foreground px-2 py-1">{t('docs.noSavedVersions')}</p>
        )}
        {revs.map((r, i) => (
          <div
            key={r.id}
            className="rounded-md border border-border/50 px-3 py-2 flex items-center justify-between gap-2 hover:bg-muted/40"
          >
            <div className="min-w-0">
              <div className="text-xs font-medium truncate">
                {i === 0 ? t('docs.currentVersion') : t('docs.versionN', { n: revs.length - i })}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {r.editor?.displayName ?? t('docs.unknown')} · {relativeTime(r.updatedAt, locale)}
              </div>
            </div>
            {i !== 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={restore.isPending}
                onClick={() => restore.mutate(r.id)}
                title={t('docs.restoreThisVersion')}
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
  const { t } = useTranslation()
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
    onSuccess: (_data, vars) => {
      invalidate()
      // Resolving hides the thread from the default view; surface feedback + a
      // hint that it's still reachable via "Show resolved" so it doesn't feel lost.
      toast.success(vars.resolved ? t('docs.commentResolvedHint') : t('docs.commentReopened'))
    },
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
          <MessageCircle className="h-3 w-3" /> {t('docs.comments')}
        </span>
        <button
          onClick={() => setShowResolved((v) => !v)}
          className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          {showResolved ? t('docs.hideResolved') : t('docs.showResolved')}
        </button>
      </header>
      <div className="flex-1 overflow-auto px-3 py-3 space-y-3">
        {commentsQuery.isLoading && (
          <p className="text-xs text-muted-foreground"><InlineSkeleton /></p>
        )}
        {!commentsQuery.isLoading && grouped.roots.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t('docs.noComments')}
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
                  placeholder={t('docs.writeReply')}
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
                    {t('common.cancel')}
                  </button>
                  <Button type="submit" size="sm" disabled={!replyBody.trim() || createComment.isPending}>
                    {t('docs.reply')}
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
                {t('docs.reply')}
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
          placeholder={t('docs.addComment')}
          className="w-full text-xs px-2 py-1.5 rounded border border-border bg-card focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button
          type="submit"
          size="sm"
          variant="gradient"
          className="w-full"
          disabled={!newBody.trim() || createComment.isPending}
        >
          {createComment.isPending ? t('docs.posting') : t('docs.postComment')}
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
  const { t } = useTranslation()
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
              {comment.authorName ?? comment.authorEmail ?? t('docs.member')}
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
              {comment.isResolved ? t('docs.resolved') : t('docs.resolve')}
            </button>
            <button
              onClick={onDelete}
              className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-destructive flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" />
              {t('common.delete')}
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
  const { t } = useTranslation()
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
      toast.success(t('docs.taskCreated'))
      onCreated(task, `/app/${workspaceId}/${spaceId}/${projectId}/${listId}?task=${task.id}`)
      onClose()
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('docs.couldNotCreateTask')),
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
          <h3 className="font-display text-base font-semibold">{t('docs.createTaskFromSelection')}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" title={t('common.close')}>
            ✕
          </button>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">{t('docs.taskTitle')}</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('docs.taskTitle')} />
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
            <option value="">{t('docs.selectSpace')}</option>
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
            <option value="">{t('docs.selectProject')}</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select className={selectCls} value={listId} disabled={!projectId} onChange={(e) => setListId(e.target.value)}>
            <option value="">{t('docs.selectList')}</option>
            {(lists.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="gradient"
            disabled={!title.trim() || !listId || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? t('docs.creating') : t('docs.createTask')}
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
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const isShared = Boolean(doc.publicShareId)
  const shareUrl = isShared ? `${window.location.origin}/d/${doc.publicShareId}` : null
  /*
   * The switch is offered by what `POST` and `DELETE /docs/:id/share` would
   * accept — Edit on the doc, not a guest, and to make a link a workspace that
   * allows one — answered by the rule those routes ask. It was drawn for
   * everyone who could open the doc, guests and readers included
   * (found-28-sep/delete-and-public-link-offered-to-everyone). The copy button
   * stays for anyone who can see an existing link.
   */
  const caps = useDocCapabilities(doc.id)
  const mayToggle = caps.isError ? true : caps.data ? (isShared ? caps.data.revokeLink : caps.data.makeLink) : null

  const toggle = async () => {
    setBusy(true)
    try {
      if (isShared) {
        await api(`/docs/${doc.id}/share`, { method: 'DELETE' })
        toast.success(t('docs.publicShareDisabled'))
      } else {
        const result = await api<{ publicShareId: string }>(`/docs/${doc.id}/share`, {
          method: 'POST',
        })
        const url = `${window.location.origin}/d/${result.publicShareId}`
        await navigator.clipboard.writeText(url).catch(() => undefined)
        toast.success(t('docs.publicLinkCopiedClipboard'))
      }
      onShareChange()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('docs.failedToggleShare'))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    toast.success(t('docs.publicLinkCopied'))
  }

  return (
    <>
      {mayToggle !== false && (
        <Button
          size="sm"
          variant={isShared ? 'secondary' : 'ghost'}
          onClick={toggle}
          disabled={busy || mayToggle === null}
          data-testid="doc-public-link-toggle"
          title={isShared ? t('docs.disablePublicShare') : t('docs.shareDocPublicly')}
        >
          {isShared ? <Globe className="h-3.5 w-3.5" /> : <GlobeLock className="h-3.5 w-3.5" />}
        </Button>
      )}
      {isShared && (
        <Button size="sm" variant="ghost" onClick={copy} title={t('docs.copyPublicLink')}>
          <Link2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </>
  )
}

/**
 * §V2-10 — the tasks that point at this doc.
 *
 * `[06:15]` "acha, is document ka yeh task hai" — she reads the relationship
 * from the DOCUMENT'S side. Rundesk stored `task_doc_links` and only ever read
 * it by `taskId`, so a task knew its docs and a doc knew nothing: you could
 * link them from the task, open the doc, and see no sign it had happened.
 *
 * Hidden entirely when there are none, rather than showing an empty heading on
 * every doc that has no tasks — which is most of them.
 */
function DocLinkedTasks({ docId, workspaceId }: { docId: string; workspaceId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const linked = useQuery({
    queryKey: ['doc-linked-tasks', docId],
    queryFn: () =>
      api<Array<{ id: string; taskId: string; title: string; statusCategory: string }>>(
        `/docs/${docId}/tasks`,
      ),
    enabled: Boolean(docId),
  })
  const rows = linked.data ?? []
  if (rows.length === 0) return null

  return (
    <div className="border-t border-border/40 px-4 py-3" data-testid="doc-linked-tasks">
      <div className="mb-2 text-xs font-medium text-muted-foreground">
        {t('docs.linkedTasks')}
      </div>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              data-testid="doc-linked-task"
              onClick={() =>
                navigate({ to: '/app/$workspaceId', params: { workspaceId }, search: { task: row.taskId } as never })
              }
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted/50"
            >
              <CheckSquare
                className={`h-3.5 w-3.5 shrink-0 ${
                  row.statusCategory === 'closed' ? 'text-emerald-500' : 'text-muted-foreground'
                }`}
              />
              <span className="truncate">{row.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
