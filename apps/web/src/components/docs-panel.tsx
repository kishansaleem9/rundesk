import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input } from '@rundesk/ui'
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
    <Card className="p-4 h-[520px] flex gap-4">
      <div className="w-64 border-r border-border pr-3 space-y-2 overflow-auto">
        <div className="font-semibold">Docs</div>
        {docsQuery.data?.map((doc) => (
          <button
            key={doc.id}
            className={`w-full text-left rounded px-2 py-1 text-sm ${doc.id === selectedDocId ? 'bg-muted font-medium' : 'hover:bg-muted'}`}
            onClick={() => setSelectedDocId(doc.id)}
          >
            {doc.title}
          </button>
        ))}
        <div className="pt-2 space-y-2">
          <Input
            value={newDocName}
            onChange={(e) => setNewDocName(e.target.value)}
            placeholder="New doc name"
          />
          <Button size="sm" className="w-full" onClick={() => createDoc.mutate()}>
            Add doc
          </Button>
        </div>
      </div>
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">{activeDoc?.title ?? 'Select a doc'}</h3>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => editor?.chain().focus().toggleBold().run()}
              disabled={!editor}
            >
              Bold
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              disabled={!editor}
            >
              Italic
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
              disabled={!editor}
            >
              H2
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              disabled={!editor}
            >
              List
            </Button>
            <Button size="sm" onClick={() => saveDoc.mutate()} disabled={!activeDoc || saveDoc.isPending}>
              Save
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto rounded border border-border p-3 bg-background">
          {activeDoc ? <EditorContent editor={editor} /> : <p className="text-sm text-muted-foreground">No doc selected</p>}
        </div>
      </div>
    </Card>
  )
}
