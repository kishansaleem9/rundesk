import { useMemo } from 'react'
import { usePermissions, type WorkspacePermission } from './use-permissions'
import { useWorkspaceRole } from './use-workspace-role'

/** Every tab of workspace settings, in the order the rail draws them. */
export const SETTINGS_TABS = [
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

export type SettingsTabId = (typeof SETTINGS_TABS)[number]

/**
 * THE TABS A KEY OPENS, for somebody who is not an admin: the keys the API
 * honours from a role — a manager's defaults, or a custom role's — where a
 * settings tab is the only place the web offers them. A manager holds
 * `members.invite`, so Members opens to them; a member granted `roles.manage`
 * gets Roles (`product-siblings/custom-role-permissions-unread-by-web`,
 * `role-editor-offers-unenforced-permissions`). Inside a tab each control asks
 * its own key. Every other tab is an admin's.
 */
const TAB_KEYS: Partial<Record<SettingsTabId, WorkspacePermission[]>> = {
  general: ['workspace.manage'],
  members: ['members.invite', 'members.remove', 'members.role.change'],
  roles: ['roles.manage'],
  security: ['security.policy.manage'],
  integrations: ['webhook.manage', 'integrations.manage'],
  sso: ['sso.manage'],
}

/** The tabs this person may open: every one for an admin, else those their keys open. */
export function settingsTabsFor(isAdmin: boolean, granted: ReadonlySet<string>): SettingsTabId[] {
  if (isAdmin) return [...SETTINGS_TABS]
  return SETTINGS_TABS.filter((tab) => (TAB_KEYS[tab] ?? []).some((key) => granted.has(key)))
}

/**
 * WHETHER TO OFFER WORKSPACE SETTINGS, and which of its tabs — one answer for
 * the rail, the dock, the avatar menu and the palette, so none of them offers a
 * way in that the route then refuses.
 */
export function useSettingsAccess(workspaceId: string | undefined) {
  const { isAdmin } = useWorkspaceRole(workspaceId)
  const { loaded, granted } = usePermissions(workspaceId)
  const tabs = useMemo(() => settingsTabsFor(isAdmin, granted), [isAdmin, granted])
  return { loaded: isAdmin || loaded, tabs, mayOpen: tabs.length > 0 }
}
