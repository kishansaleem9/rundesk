import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { CreateType } from '../lib/create-types'
import { usePermissions } from './use-permissions'
import { useWorkspaceRole } from './use-workspace-role'

/**
 * WHETHER THIS PERSON MAY MAKE ONE, AS THE API WOULD ANSWER — the one question
 * the Create menu, a space's "+", the creators' space pickers and a project's
 * "Add list" all ask, so none of them can drift from the others.
 *
 *   - a type the API files under a permission key (`requires`) once the key is
 *     known to be held (`usePermissions`);
 *   - a type that goes IN a space (`scopedToSpace`: a task, a form, a list, a
 *     folder, a project) only where this person may add to it — the create
 *     gate's own answer, `GET /spaces/workspace/:id/writable`. A space whose
 *     default is "View only" or "Comment" refused its members every one of
 *     them, and its "+" offered them all
 *     (`found-24-sep/view-only-space-offers-members-what-it-refuses`);
 *   - for a GUEST, what the row's `guests` says: a reminder, yes; a list or a
 *     task only in a space they may add to; the rest, never
 *     (`found-24-sep/create-menu-offers-guests-what-they-cannot-make`).
 *
 * `spaceId` asks about one space (its own "+"); without it, anywhere. Until the
 * spaces have answered, a guest is offered nothing that goes in a space, and a
 * member what they were before — so a menu opened at once still has its tasks,
 * and settles to the answer the moment it arrives.
 */
export function useCreatable(workspaceId: string | undefined) {
  const permissions = usePermissions(workspaceId)
  const { role } = useWorkspaceRole(workspaceId)
  const guest = role === 'guest'
  const writable = useQuery({
    queryKey: ['writable-spaces', workspaceId],
    queryFn: () => api<Array<{ id: string }>>(`/spaces/workspace/${workspaceId}/writable`),
    enabled: !!workspaceId,
    staleTime: 60_000,
  })
  const answered = writable.data !== undefined
  const writableIds = useMemo(() => new Set((writable.data ?? []).map((s) => s.id)), [writable.data])
  const { loaded, granted } = permissions
  return useCallback(
    (type: CreateType, spaceId?: string): boolean => {
      if (type.requires && !(loaded && granted.has(type.requires))) return false
      const mayAddHere = spaceId ? writableIds.has(spaceId) : writableIds.size > 0
      if (guest) {
        if (type.guests === 'yes') return true
        if (type.guests === 'where-writable') return mayAddHere
        return false
      }
      if (type.scopedToSpace && answered) return mayAddHere
      return true
    },
    [guest, loaded, granted, writableIds, answered],
  )
}
