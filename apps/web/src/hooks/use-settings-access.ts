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
  'announcements',
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
  // A member's capacity and reporting line are set on the roster.
  members: ['members.invite', 'members.remove', 'members.role.change', 'members.profile.manage'],
  groups: ['groups.manage'],
  roles: ['roles.manage'],
  workSchedule: ['workspace.schedule.manage'],
  security: ['security.policy.manage'],
  features: ['workspace.clickapps.manage'],
  announcements: ['announcement.manage'],
  // The workspace's data export sits on Integrations.
  integrations: ['webhook.manage', 'integrations.manage', 'workspace.export'],
  sso: ['sso.manage'],
}

/**
 * THE TABS EVERY MEMBER OPENS, a guest excepted: Archived lists the archived
 * tasks each reader may open, and restores those they may change — the task's
 * own rules, as ClickUp's Show archived is
 * (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`). Trash
 * lists what they deleted and restores it, as the API answers them; deleting
 * for good and emptying it stay an admin's (ClickUp: "Members and guests can
 * only see and restore items they have deleted";
 * `found-28-sep/members-have-no-trash-to-open`).
 */
// Features lists which ClickApps are on, read-only without
// `workspace.clickapps.manage` (ClickUp: "Members can view, but not activate or
// deactivate ClickApps"; `found-28-sep/members-see-no-clickapps-list`). In the
// order a member lands on them.
const OPEN_TABS: readonly SettingsTabId[] = ['archived', 'trash', 'features']

/**
 * The tabs this person may open: every one for an admin; else those their keys
 * open, and the open tabs unless they are a guest.
 */
export function settingsTabsFor(isAdmin: boolean, granted: ReadonlySet<string>, role?: string | null): SettingsTabId[] {
  if (isAdmin) return [...SETTINGS_TABS]
  const member = !!role && role !== 'guest'
  return SETTINGS_TABS.filter(
    (tab) => (member && OPEN_TABS.includes(tab)) || (TAB_KEYS[tab] ?? []).some((key) => granted.has(key)),
  )
}

/**
 * The tab Settings opens on without one in its address: General where it
 * opens, else the first tab a key opens, else the first open tab — Archived
 * for a plain member, not whichever open tab the rail happens to draw first.
 */
export function landingTab(tabs: readonly SettingsTabId[]): SettingsTabId {
  if (tabs.includes('general')) return 'general'
  return tabs.find((tab) => !OPEN_TABS.includes(tab)) ?? OPEN_TABS.find((tab) => tabs.includes(tab)) ?? 'general'
}

/**
 * WHETHER TO OFFER WORKSPACE SETTINGS, and which of its tabs — one answer for
 * the rail, the dock, the avatar menu and the palette, so none of them offers a
 * way in that the route then refuses.
 */
export function useSettingsAccess(workspaceId: string | undefined) {
  const { isAdmin, role } = useWorkspaceRole(workspaceId)
  const { loaded, granted } = usePermissions(workspaceId)
  const tabs = useMemo(() => settingsTabsFor(isAdmin, granted, role), [isAdmin, granted, role])
  return { loaded: isAdmin || loaded, tabs, mayOpen: tabs.length > 0 }
}
