import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input } from '@rundesk/ui'
import { Plus } from 'lucide-react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { api } from '../lib/api'
import { getRealtimeSocket } from '../lib/realtime'

type Doc = {
  id: string
  title: string
  content: Record<string, unknown>
  updatedAt: string
}

export function DocsPanel({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [newDocName, setNewDocName] = useState('')

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

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write your doc...' }),
    ],
    content: activeDoc?.content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    immediatelyRender: false,
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
      if (event.type === 'doc.updated' && event.docId) {
        void qc.invalidateQueries({ queryKey: ['docs', workspaceId] })
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
        body: JSON.stringify({ content }),
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['docs', workspaceId] })
    },
  })

  return (
    <Card variant="glass" className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-0 h-[640px] overflow-hidden p-0">
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
                variant="gradient"
                onClick={() => saveDoc.mutate()}
                disabled={saveDoc.isPending}
              >
                {saveDoc.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-auto px-6 py-5 prose prose-invert prose-sm max-w-none">
          {activeDoc ? (
            <EditorContent editor={editor} />
          ) : (
            <p className="text-sm text-muted-foreground">Pick a page on the left to start editing.</p>
          )}
        </div>
      </div>
    </Card>
  )
}
