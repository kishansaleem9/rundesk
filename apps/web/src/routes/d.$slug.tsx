import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { TableKit } from '@tiptap/extension-table'
import { useEffect } from 'react'
import { Callout, ListEmbedStatic } from '../lib/tiptap-doc-blocks'
import { useRetryAfter } from '../lib/use-retry-after'
import { PublicBusy } from '../components/public-busy'

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

/**
 * Why the doc did not load. A 404 is a link that no longer opens (revoked,
 * archived or never made) and the page says so; anything else is a failure to
 * load it, which is not the same sentence.
 */
class PublicDocError extends Error {
  constructor(
    readonly status: number,
    /** For a 429, the wait its `Retry-After` asked for, in seconds. */
    readonly retryAfter: number | null = null,
  ) {
    super(status === 404 ? 'Not found' : 'Failed to load')
  }
}

/** A 429's wait from its `Retry-After`, five seconds if it names none (`found-30-sep/public-pages-read-429-as-gone`). */
const retryAfterOf = (res: Response) => {
  if (res.status !== 429) return null
  const seconds = Number(res.headers.get('retry-after'))
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 5
}

function PublicDocViewer() {
  const { slug } = Route.useParams() as { slug: string }

  const docQuery = useQuery({
    queryKey: ['public-doc', slug],
    queryFn: async () => {
      // Same-origin relative path (the Vite proxy in dev, same host in prod) so a
      // public share link resolves on whatever hostname it's opened from — not
      // only the one pinned in VITE_DEV_API_ORIGIN.
      const res = await fetch(`/api/v1/public/docs/${encodeURIComponent(slug)}`)
      if (!res.ok) throw new PublicDocError(res.status, retryAfterOf(res))
      // Every answer is wrapped as `{ data, meta, error }` (ResponseInterceptor):
      // the doc is `data`. Read as the doc itself, the envelope drew no title,
      // "Invalid Date" and an empty page
      // (found-30-sep/public-doc-page-reads-the-envelope).
      const body = (await res.json().catch(() => null)) as { data?: PublicDoc | null } | null
      if (!body?.data) throw new PublicDocError(res.status)
      return body.data
    },
    retry: false,
  })

  const editor = useEditor(
    {
      // A5.8 — a shared doc must keep the blocks it was written with; an
      // unregistered node type is silently stripped on parse.
      extensions: [
        StarterKit,
        TaskList,
        TaskItem.configure({ nested: true }),
        TableKit,
        Callout,
        ListEmbedStatic,
      ],
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

  /* Refused for too many requests: say so, count the wait down, then ask again. */
  const busyFor =
    !docQuery.data && docQuery.error instanceof PublicDocError && docQuery.error.status === 429
      ? docQuery.error.retryAfter
      : null
  const busyLeft = useRetryAfter(busyFor, docQuery.errorUpdatedAt, () => void docQuery.refetch())

  if (docQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (busyFor !== null) {
    return <PublicBusy seconds={busyLeft ?? busyFor} onRetry={() => void docQuery.refetch()} testId="public-doc-busy" />
  }

  if (docQuery.isError || !docQuery.data) {
    const gone = docQuery.error instanceof PublicDocError && docQuery.error.status === 404
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center bg-background gap-2"
        data-testid={gone ? 'public-doc-not-found' : 'public-doc-failed'}
      >
        <h1 className="text-2xl font-display font-semibold">
          {gone ? 'Doc not found' : 'This doc could not be loaded'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {gone
            ? 'This share link may have been revoked or the doc has been archived.'
            : 'Something went wrong while loading it. Try again in a moment.'}
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
          {doc.icon && (
            <span className="text-3xl" data-testid="public-doc-icon">
              {doc.icon}
            </span>
          )}
          <div className="flex-1">
            <h1 className="font-display text-3xl font-semibold tracking-tight" data-testid="public-doc-title">
              {doc.title}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Public shared doc · last updated{' '}
              <time dateTime={doc.updatedAt} data-testid="public-doc-updated">
                {new Date(doc.updatedAt).toLocaleString()}
              </time>
            </p>
          </div>
        </header>
        <article className="prose prose-sm dark:prose-invert max-w-none" data-testid="public-doc-content">
          <EditorContent editor={editor} />
        </article>
        <footer className="mt-16 border-t border-border/40 pt-4 text-[11px] text-muted-foreground">
          Powered by Rundesk · this is a read-only public share.
        </footer>
      </main>
    </div>
  )
}
