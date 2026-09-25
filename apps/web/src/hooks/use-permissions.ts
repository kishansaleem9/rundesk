import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

/**
 * The permission keys a control in the web is gated on. Each is enforced by
 * the API (`@RequirePermissions`), and each is the key the API names.
 */
export type WorkspacePermission =
  | 'project.create'
  | 'space.create'
  | 'template.manage'
  | 'report.view.basic'
  | 'webhook.manage'
  | 'sso.manage'
  | 'integrations.manage'
  | 'automation.manage'

/**
 * The one read of this person's keys, as a query the router can also wait on:
 * settings decides whether to let somebody in before its page renders
 * (`routes/app.$workspaceId.settings.tsx`), from the same cache the hook reads.
 */
export const permissionsQuery = (workspaceId: string | undefined) => ({
  queryKey: ['my-permissions', workspaceId] as const,
  queryFn: () => api<{ permissions: string[] }>(`/workspaces/${workspaceId}/roles/me/permissions`),
  staleTime: 60_000,
})

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
  const query = useQuery({ ...permissionsQuery(workspaceId), enabled: !!workspaceId })
  const granted = useMemo(() => new Set(query.data?.permissions ?? []), [query.data])
  const loaded = query.data !== undefined
  return {
    loaded,
    /** The keys held, stable while they are the same: something to memo on. */
    granted,
    can: (permission: WorkspacePermission): boolean | null => (loaded ? granted.has(permission) : null),
  }
}
