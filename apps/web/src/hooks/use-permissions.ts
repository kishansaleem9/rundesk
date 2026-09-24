import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

/**
 * The permission keys a control in the web is gated on. Each is enforced by
 * the API (`@RequirePermissions`), and each is the key the API names.
 */
export type WorkspacePermission = 'project.create' | 'space.create' | 'template.manage' | 'report.view.basic'

/**
 * WHAT THIS PERSON MAY DO HERE, as the API decides it: their role's
 * permissions and whatever custom roles add (`GET /roles/me/permissions`).
 *
 * The web gated on the base role alone, so a control could be offered to a
 * role the API refuses (a member's "Project" in the Create menu, a 403), or
 * hidden from a member a custom role had granted it to
 * (`product-siblings/custom-role-permissions-unread-by-web`). `can` answers
 * true or false once the set has loaded, and null until it has.
 */
export function usePermissions(workspaceId: string | undefined) {
  const query = useQuery({
    queryKey: ['my-permissions', workspaceId],
    queryFn: () => api<{ permissions: string[] }>(`/workspaces/${workspaceId}/roles/me/permissions`),
    enabled: !!workspaceId,
    staleTime: 60_000,
  })
  const granted = useMemo(() => new Set(query.data?.permissions ?? []), [query.data])
  const loaded = query.data !== undefined
  return {
    loaded,
    /** The keys held, stable while they are the same: something to memo on. */
    granted,
    can: (permission: WorkspacePermission): boolean | null => (loaded ? granted.has(permission) : null),
  }
}
