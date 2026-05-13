import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { useEffect } from 'react'

export const Route = createFileRoute('/d/$slug')({
  component: PublicDocViewer,
})

type PublicDoc = {
  id: string
  title: string
  icon: string | null
  coverImageUrl: string | null
  content: Record<string, unknown>
  updatedAt: string
}

function PublicDocViewer() {
  const { slug } = Route.useParams() as { slug: string }

  const apiOrigin =
    typeof window !== 'undefined' && window.location.port === '5173'
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : ''

  const docQuery = useQuery({
    queryKey: ['public-doc', slug],
    queryFn: async () => {
      const res = await fetch(`${apiOrigin}/api/v1/public/docs/${encodeURIComponent(slug)}`)
      if (!res.ok) throw new Error(res.status === 404 ? 'Not found' : 'Failed to load')
      return (await res.json()) as PublicDoc
    },
    retry: false,
  })

  const editor = useEditor(
    {
      extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true })],
      content: docQuery.data?.content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
      editable: false,
    },
    [docQuery.data?.id],
  )

  useEffect(() => {
    if (editor && docQuery.data?.content) {
      editor.commands.setContent(docQuery.data.content as never)
    }
  }, [editor, docQuery.data?.content])

  if (docQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (docQuery.isError || !docQuery.data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-2">
        <h1 className="text-2xl font-display font-semibold">Doc not found</h1>
        <p className="text-sm text-muted-foreground">
          This share link may have been revoked or the doc has been archived.
        </p>
      </div>
    )
  }

  const doc = docQuery.data

  return (
    <div className="min-h-screen bg-background">
      {doc.coverImageUrl && (
        <div
          className="h-40 w-full bg-cover bg-center"
          style={{ backgroundImage: `url(${doc.coverImageUrl})` }}
        />
      )}
      <main className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-8 flex items-start gap-3">
          {doc.icon && <span className="text-3xl">{doc.icon}</span>}
          <div className="flex-1">
            <h1 className="font-display text-3xl font-semibold tracking-tight">{doc.title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Public shared doc · last updated{' '}
              {new Date(doc.updatedAt).toLocaleString()}
            </p>
          </div>
        </header>
        <article className="prose prose-sm dark:prose-invert max-w-none">
          <EditorContent editor={editor} />
        </article>
        <footer className="mt-16 border-t border-border/40 pt-4 text-[11px] text-muted-foreground">
          Powered by Rundesk · this is a read-only public share.
        </footer>
      </main>
    </div>
  )
}
