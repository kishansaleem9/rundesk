import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { CreateType } from '../lib/create-types'
import { usePermissions } from './use-permissions'
import { useWorkspaceRole } from './use-workspace-role'

/**
 * WHETHER THIS PERSON MAY MAKE ONE, AS THE API WOULD ANSWER — the one question
 * the Create menu and a space's own "+" both ask, so the two cannot drift.
 *
 *   - a type the API files under a permission key (`requires`) once the key is
 *     known to be held (`usePermissions`);
 *   - for a GUEST, what the row's `guests` says: a reminder, yes; a list only
 *     in a space they may add to (the Move picker's own answer, the spaces the
 *     API lets them write); the rest, never
 *     (`found-24-sep/create-menu-offers-guests-what-they-cannot-make`).
 *
 * `spaceId` asks about one space (its own "+"); without it, anywhere.
 */
export function useCreatable(workspaceId: string | undefined) {
  const permissions = usePermissions(workspaceId)
  const { role } = useWorkspaceRole(workspaceId)
  const guest = role === 'guest'
  // The Move picker's own query (same key, same answer), so a move or a new
  // space that refreshes one refreshes both.
  const writable = useQuery({
    queryKey: ['move-targets', workspaceId],
    queryFn: () => api<Array<{ id: string }>>(`/spaces/workspace/${workspaceId}/move-targets`),
    enabled: !!workspaceId && guest,
    staleTime: 60_000,
  })
  const writableIds = useMemo(() => new Set((writable.data ?? []).map((s) => s.id)), [writable.data])
  const { loaded, granted } = permissions
  return useCallback(
    (type: CreateType, spaceId?: string): boolean => {
      if (type.requires && !(loaded && granted.has(type.requires))) return false
      if (!guest) return true
      if (type.guests === 'yes') return true
      if (type.guests === 'where-writable') return spaceId ? writableIds.has(spaceId) : writableIds.size > 0
      return false
    },
    [guest, loaded, granted, writableIds],
  )
}
