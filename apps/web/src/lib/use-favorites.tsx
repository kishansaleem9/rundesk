import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { cn, toast } from '@rundesk/ui'
import { api, ApiError } from './api'
import { useTranslation } from './i18n'

export type FavoriteEntityType = 'space' | 'list' | 'task' | 'doc' | 'channel'

export type FavoriteItem = {
  id: string
  entityType: FavoriteEntityType
  entityId: string
  label: string
  url: string
  createdAt: string
}

/** A user's pinned items in a workspace (durable, cross-device — Plan §2). */
export function useFavorites(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['favorites', workspaceId],
    enabled: !!workspaceId,
    queryFn: () => api<FavoriteItem[]>(`/workspaces/${workspaceId}/favorites`),
    staleTime: 30_000,
  })
}

/** Toggle an entity's pinned state; refreshes the favorites list on success. */
export function useToggleFavorite(workspaceId: string | undefined) {
  const qc = useQueryClient()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: (input: { entityType: FavoriteEntityType; entityId: string }) =>
      api<{ favorited: boolean; entityType: FavoriteEntityType; entityId: string }>(
        `/workspaces/${workspaceId}/favorites/toggle`,
        { method: 'POST', body: input },
      ),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['favorites', workspaceId] })
      toast(res.favorited ? t('favorites.pinned') : t('favorites.removed'))
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('favorites.updateError'))
    },
  })
}

/**
 * A star button that pins/unpins an entity (Plan §2 quick access). Reads the
 * current pinned state from the workspace favorites list so it stays in sync
 * wherever the same entity is shown.
 */
export function FavoriteStar({
  workspaceId,
  entityType,
  entityId,
  size = 'md',
  className,
}: {
  workspaceId: string | undefined
  entityType: FavoriteEntityType
  entityId: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const { data: favorites } = useFavorites(workspaceId)
  const { t } = useTranslation()
  const toggle = useToggleFavorite(workspaceId)
  const favorited = !!favorites?.some((f) => f.entityType === entityType && f.entityId === entityId)
  const dim = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'

  return (
    <button
      type="button"
      title={favorited ? t('favorites.remove') : t('favorites.add')}
      aria-pressed={favorited}
      disabled={!workspaceId || toggle.isPending}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        toggle.mutate({ entityType, entityId })
      }}
      className={cn(
        'inline-flex items-center justify-center rounded text-muted-foreground hover:text-amber-500 disabled:opacity-50',
        className,
      )}
    >
      <Star className={cn(dim, favorited && 'fill-amber-400 text-amber-400')} />
    </button>
  )
}
