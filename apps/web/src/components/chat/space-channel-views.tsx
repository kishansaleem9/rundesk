import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Folder, List as ListIcon, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import { useTranslation } from '../../lib/i18n'

type Place = { id: string; name: string }
type SavedView = { id: string; name: string; type: string; visibility?: string }
type ListWithViews = Place & { projectId: string; views: SavedView[] }
type FolderWithLists = Place & { lists: ListWithViews[] }

/**
 * A SPACE'S CHANNEL HAS ITS VIEWS TAB (`found-14-oct/space-channel-views-unbuilt`).
 *
 * ClickUp's Chat channel of a Space "contains a Views tab with all the views you have access to in the
 * Channel's related Space, Folder, or List". Here: the Space's Folders and Lists the reader may open —
 * each read by the same routes the sidebar reads them by, which answer only what the reader may see — and
 * each List's saved views, each opening its List on that view.
 */
export function SpaceChannelViews({ workspaceId, spaceId }: { workspaceId: string; spaceId: string }) {
  const { t } = useTranslation()
  const tree = useQuery({
    queryKey: ['chat-space-views', spaceId],
    queryFn: async () => {
      const withViews = async (l: Place & { projectId: string }): Promise<ListWithViews> => ({
        ...l,
        views: await api<SavedView[]>(`/lists/${l.id}/views`).catch(() => []),
      })
      const [projects, own] = await Promise.all([
        api<Place[]>(`/projects/space/${spaceId}`),
        api<Array<Place & { projectId: string }>>(`/lists/space/${spaceId}`).catch(() => []),
      ])
      const folders: FolderWithLists[] = await Promise.all(
        projects.map(async (p) => ({
          ...p,
          lists: await Promise.all((await api<Place[]>(`/lists/project/${p.id}`)).map((l) => withViews({ ...l, projectId: p.id }))),
        })),
      )
      return { folders, lists: await Promise.all(own.map(withViews)) }
    },
  })

  const listRow = (l: ListWithViews) => (
    <li key={l.id} className="py-2" data-testid="chat-space-view-list" data-list-id={l.id}>
      <Link
        to="/app/$workspaceId/$spaceId/$projectId/$listId"
        params={{ workspaceId, spaceId, projectId: l.projectId, listId: l.id }}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline"
      >
        <ListIcon className="h-3.5 w-3.5 text-muted-foreground" /> {l.name}
      </Link>
      {l.views.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5 pl-5">
          {l.views.map((v) => (
            <Link
              key={v.id}
              to="/app/$workspaceId/$spaceId/$projectId/$listId"
              params={{ workspaceId, spaceId, projectId: l.projectId, listId: l.id }}
              search={{ view: v.id }}
              data-testid="chat-space-view"
              data-view-id={v.id}
              className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-accent/40 hover:text-foreground"
            >
              {v.name}
            </Link>
          ))}
        </div>
      )}
    </li>
  )

  if (tree.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground" data-testid="chat-space-views-loading">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('common.loading')}
      </div>
    )
  }
  if (tree.isError) {
    return (
      <div className="flex-1 px-5 py-4 text-sm text-destructive" data-testid="chat-space-views-failed">
        {t('chat.spaceViewsFailed')}
      </div>
    )
  }
  const folders = tree.data?.folders ?? []
  const lists = tree.data?.lists ?? []
  return (
    <div className="flex-1 overflow-y-auto px-5 py-4" data-testid="chat-space-views">
      {folders.length === 0 && lists.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('chat.spaceViewsEmpty')}</p>
      ) : (
        <>
          {folders.map((f) => (
            <section key={f.id} className="mb-4" data-testid="chat-space-view-folder" data-folder-id={f.id}>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Folder className="h-3.5 w-3.5" /> {f.name}
              </h3>
              <ul className="divide-y divide-border">{f.lists.map(listRow)}</ul>
            </section>
          ))}
          {lists.length > 0 && <ul className="divide-y divide-border">{lists.map(listRow)}</ul>}
        </>
      )}
    </div>
  )
}
