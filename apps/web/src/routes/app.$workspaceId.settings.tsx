import { createFileRoute, redirect } from '@tanstack/react-router'
import { getWorkspaceRole } from '../hooks/use-workspace-role'

const TABS = [
  'general',
  'members',
  'groups',
  'roles',
  'spaces',
  'workSchedule',
  'security',
  'sso',
  'features',
  'integrations',
  'labels',
  'taskTypes',
  'aiUsage',
  'archived',
  'trash',
] as const

export const Route = createFileRoute('/app/$workspaceId/settings')({
  // §A4.5 — the workspace panel links straight at People, so the tab has to
  // survive the navigation.
  validateSearch: (search: Record<string, unknown>): { tab?: (typeof TABS)[number] } => ({
    tab: (TABS as readonly string[]).includes(search.tab as string)
      ? (search.tab as (typeof TABS)[number])
      : undefined,
  }),
  beforeLoad: ({ params }) => {
    const workspaceId = (params as any)?.workspaceId as string | undefined
    const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      workspaceId ?? '',
    )
    if (!ok) {
      throw redirect({ to: '/app/profile' })
    }
    // Workspace settings (branding, members, integrations, security) are admin-only.
    if (!getWorkspaceRole(workspaceId).isAdmin) {
      throw redirect({ to: '/app' })
    }
  },
})
