import { createFileRoute, redirect } from '@tanstack/react-router'
import { getWorkspaceRole } from '../hooks/use-workspace-role'
import { permissionsQuery } from '../hooks/use-permissions'
import { SETTINGS_TABS, settingsTabsFor, type SettingsTabId } from '../hooks/use-settings-access'

export const Route = createFileRoute('/app/$workspaceId/settings')({
  // §A4.5 — the workspace panel links straight at People, so the tab has to
  // survive the navigation.
  validateSearch: (search: Record<string, unknown>): { tab?: SettingsTabId } => ({
    tab: (SETTINGS_TABS as readonly string[]).includes(search.tab as string)
      ? (search.tab as SettingsTabId)
      : undefined,
  }),
  beforeLoad: async ({ params, search, context }) => {
    const workspaceId = (params as any)?.workspaceId as string | undefined
    const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      workspaceId ?? '',
    )
    if (!ok) {
      throw redirect({ to: '/app/profile' })
    }
    // Workspace settings (branding, members, integrations, security) are an
    // admin's — and a tab is also the holder's of a key it serves, which a
    // custom role can grant (`useSettingsAccess`): webhooks, integrations, SSO.
    // The API already honoured those grants; this route sent their holders back
    // to the start (`product-siblings/custom-role-permissions-unread-by-web`).
    if (getWorkspaceRole(workspaceId).isAdmin) return
    const held = await context.queryClient.ensureQueryData(permissionsQuery(workspaceId)).catch(() => null)
    const tabs = settingsTabsFor(false, new Set(held?.permissions ?? []))
    if (tabs.length === 0) {
      throw redirect({ to: '/app' })
    }
    // Arriving on a tab that is not theirs (or on none, which is General), they
    // are taken to the first that is, not shown an admin's form to be refused.
    if (!search.tab || !tabs.includes(search.tab)) {
      throw redirect({ to: '/app/$workspaceId/settings', params: { workspaceId: workspaceId! }, search: { tab: tabs[0] } })
    }
  },
})
