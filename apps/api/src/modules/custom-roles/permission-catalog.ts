/**
 * Canonical permission catalog. Permission strings live in the DB as
 * free text — this module is the single source of truth for what's
 * valid. Adding a new permission is a code change, not a schema change.
 *
 * Categories drive the admin UI grouping; descriptions are surfaced in
 * the role editor so admins know what each grant lets a user do.
 */

import { WORKSPACE_ROLE_RANK } from '../../common/permissions/workspace-roles'

export type Permission =
  // Workspace-level
  | 'workspace.manage'
  | 'workspace.billing'
  | 'workspace.export'
  | 'workspace.import'
  | 'workspace.audit.view'
  | 'workspace.clickapps.manage'
  | 'workspace.schedule.manage'
  | 'announcement.manage'
  | 'client.manage'
  // Member management
  | 'members.invite'
  | 'members.remove'
  | 'members.role.change'
  | 'roles.manage'
  | 'members.profile.manage'
  | 'groups.manage'
  // Integrations
  | 'integrations.manage'
  | 'integrations.access_requests.manage'
  // Security
  | 'sso.manage'
  | 'security.policy.manage'
  // Content
  | 'space.create'
  | 'project.create'
  | 'space.delete'
  | 'project.delete'
  | 'list.delete'
  // Automation
  | 'automation.manage'
  | 'webhook.manage'
  | 'template.manage'
  // Reporting
  | 'report.view.basic'
  | 'report.export'
  | 'time.approval.manage'
  | 'dashboard.workspace_default.manage'

export type PermissionCategory =
  | 'Workspace'
  | 'Members'
  | 'Integrations'
  | 'Security'
  | 'Content'
  | 'Automation'
  | 'Reporting'

export type PermissionDef = {
  key: Permission
  label: string
  description: string
  category: PermissionCategory
}

export const PERMISSION_CATALOG: readonly PermissionDef[] = [
  // Workspace
  { key: 'workspace.manage',     label: 'Manage workspace settings',  description: 'Rename, set logo, change colour, restore an archived one', category: 'Workspace' },
  { key: 'workspace.billing',    label: 'Manage billing',             description: 'View invoices, change plan, manage payment method', category: 'Workspace' },
  // ClickUp: exporting the workspace's data and its people, and importing, are the owner's and
  // admins' (help centre, "Import and export feature availability and limits"); a custom role can grant them.
  { key: 'workspace.export',     label: 'Export workspace data',      description: 'Download every task and the people list as CSV or JSON', category: 'Workspace' },
  { key: 'workspace.import',     label: 'Import data',                description: 'Import from ClickUp or a spreadsheet, and load sample data', category: 'Workspace' },
  { key: 'workspace.audit.view', label: 'View audit log',             description: 'Read the workspace activity / audit trail', category: 'Workspace' },
  // The rest of `WorkspaceAdminGuard`'s routes, each on a key of its own
  // (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`).
  // ClickUp (help centre "Intro to ClickApps"): only owners and admins turn Workspace
  // ClickApps on or off; members see which are on. The switch is the admins'.
  { key: 'workspace.clickapps.manage', label: 'Manage ClickApps',       description: 'Turn the workspace\'s features on or off', category: 'Workspace' },
  // ClickUp: the Workspace's work week and time off are set by owners and admins.
  { key: 'workspace.schedule.manage',  label: 'Manage the work schedule', description: 'Set the working days and the holidays', category: 'Workspace' },
  { key: 'announcement.manage',        label: 'Post announcements',     description: 'Publish, pause and delete workspace announcements', category: 'Workspace' },
  // Clients are a workspace's shared record for billing time; a manager bills their projects' time.
  { key: 'client.manage',              label: 'Manage clients',         description: 'Add and remove the workspace\'s clients', category: 'Workspace' },
  // Members
  { key: 'members.invite',        label: 'Invite members',     description: 'Send invitations and create new accounts', category: 'Members' },
  { key: 'members.remove',        label: 'Remove members',     description: 'Revoke a member’s workspace access', category: 'Members' },
  { key: 'members.role.change',   label: 'Change member roles', description: 'Promote / demote members (legacy and custom roles)', category: 'Members' },
  { key: 'roles.manage',          label: 'Manage custom roles', description: 'Create / edit / delete custom roles and assign them', category: 'Members' },
  // A member's capacity and who they report to: a manager's for the people they manage, within their rank.
  { key: 'members.profile.manage', label: 'Set member profiles', description: 'Change a member\'s job title, weekly capacity and who they report to', category: 'Members' },
  // ClickUp: owners and admins create and edit User Groups (Teams); a custom role can grant it.
  { key: 'groups.manage',          label: 'Manage user groups',   description: 'Create, rename and delete groups, and set who is in them', category: 'Members' },
  // Integrations
  { key: 'integrations.manage',                 label: 'Manage integrations',          description: 'Connect / disconnect Slack, GitHub, Google, etc.', category: 'Integrations' },
  { key: 'integrations.access_requests.manage', label: 'Approve access requests',      description: 'Approve / deny member requests to use integrations', category: 'Integrations' },
  // Security
  { key: 'sso.manage',             label: 'Manage SSO / SCIM',          description: 'Configure OIDC, SAML, and SCIM provisioning', category: 'Security' },
  { key: 'security.policy.manage', label: 'Manage security policies',   description: 'IP allowlists, MFA enforcement, session policies', category: 'Security' },
  // Content
  { key: 'space.create',     label: 'Create spaces',             description: 'Spin up new spaces in this workspace', category: 'Content' },
  { key: 'project.create',   label: 'Create projects',           description: 'Create projects inside a space', category: 'Content' },
  // Deleting a container somebody else made, ANDed with Full edit there (`assertCanManageContainer`);
  // its maker deletes it with Full edit alone. ClickUp: deleting follows the location's level.
  // Deleting sends to the Trash. A task and a doc have no key: their level decides (Full edit),
  // and publishing a doc is Edit on it, never a guest's — so `task.delete.any`, `doc.delete.any`
  // and `doc.publish`, which nothing asked, left the catalog (`role-editor-offers-unenforced-permissions`).
  { key: 'space.delete',     label: 'Delete spaces',             description: 'Move a space someone else made, with everything in it, to the Trash, where you have Full edit', category: 'Content' },
  { key: 'project.delete',   label: 'Delete projects',           description: 'Move a project someone else made to the Trash, where you have Full edit', category: 'Content' },
  { key: 'list.delete',      label: 'Delete lists',              description: 'Move a list someone else made to the Trash, where you have Full edit', category: 'Content' },
  // Automation
  { key: 'automation.manage', label: 'Manage automations', description: 'Create / edit / disable workspace automations', category: 'Automation' },
  { key: 'webhook.manage',    label: 'Manage webhooks',    description: 'Create / rotate outbound webhook endpoints', category: 'Automation' },
  { key: 'template.manage',   label: 'Manage templates',   description: 'Save / edit / delete project + task templates', category: 'Automation' },
  // Reporting
  { key: 'report.view.basic',     label: 'View reports',             description: 'Open dashboards and reports', category: 'Reporting' },
  { key: 'report.export',         label: 'Export reports',           description: 'Download dashboards / reports as CSV or PDF', category: 'Reporting' },
  { key: 'time.approval.manage',  label: 'Manage time approvals',    description: 'Approve or reject time entries submitted by others', category: 'Reporting' },
  { key: 'dashboard.workspace_default.manage', label: 'Set the workspace dashboard', description: 'Choose the dashboard members land on when they have none of their own', category: 'Reporting' },
]

export const PERMISSION_KEYS: ReadonlySet<Permission> = new Set(
  PERMISSION_CATALOG.map((p) => p.key),
)

/**
 * Strict role hierarchy. Higher roles inherit every permission of all lower
 * roles (a cascade). CASCADE_DELTAS lists only what each tier ADDS on top of
 * the tier below it; effectiveCascade() rolls them up. This is the single
 * source of truth — LEGACY_ROLE_PERMISSIONS below is derived from it.
 */
export type LegacyWorkspaceRole = 'super_admin' | 'workspace_admin' | 'manager' | 'member' | 'guest'

// The one rank table, in `common/permissions/workspace-roles.ts`.
export const ROLE_RANK: Record<LegacyWorkspaceRole, number> = WORKSPACE_ROLE_RANK

// Permissions each lower tier adds. workspace_admin (and super_admin) inherit
// everything else, so a newly-added catalog permission defaults to admin-only
// until it is explicitly granted to a lower tier here.
const MEMBER_DELTA: readonly Permission[] = ['space.create', 'report.export', 'report.view.basic']
// Managers manage their projects, their people's capacity and reporting lines,
// clients, and time — but NOT workspace-level infrastructure (user groups,
// ClickApps, the work schedule and announcements are admins'). `integrations.manage`, `webhook.manage`, and
// `automation.manage` were demoted to workspace_admin (0037); existing managers
// keep them via the grandfather custom role created in that migration.
const MANAGER_DELTA: readonly Permission[] = [
  'members.invite',
  'project.create',
  'project.delete',
  'list.delete',
  'template.manage',
  'time.approval.manage',
  'members.profile.manage',
  'client.manage',
]
const LOWER_TIER_KEYS = new Set<Permission>([...MEMBER_DELTA, ...MANAGER_DELTA])

const CASCADE_DELTAS: Record<LegacyWorkspaceRole, readonly Permission[]> = {
  guest: [],
  member: MEMBER_DELTA,
  manager: MANAGER_DELTA,
  workspace_admin: PERMISSION_CATALOG.map((p) => p.key).filter((k) => !LOWER_TIER_KEYS.has(k)),
  super_admin: [],
}

/** Full permission set for a role = its delta unioned with every lower tier's. */
export function effectiveCascade(role: LegacyWorkspaceRole): Permission[] {
  const rank = ROLE_RANK[role] ?? 0
  const out = new Set<Permission>()
  for (const r of Object.keys(ROLE_RANK) as LegacyWorkspaceRole[]) {
    if (ROLE_RANK[r] <= rank) for (const p of CASCADE_DELTAS[r]) out.add(p)
  }
  return Array.from(out)
}

/**
 * Default permission bundles per legacy role, derived from the cascade so
 * there is one source of truth. Used by hasPermission() for members that
 * haven't migrated to custom roles yet.
 */
export const LEGACY_ROLE_PERMISSIONS: Record<LegacyWorkspaceRole, readonly Permission[]> = {
  super_admin: effectiveCascade('super_admin'),
  workspace_admin: effectiveCascade('workspace_admin'),
  manager: effectiveCascade('manager'),
  member: effectiveCascade('member'),
  guest: effectiveCascade('guest'),
}

export function isKnownPermission(key: string): key is Permission {
  return PERMISSION_KEYS.has(key as Permission)
}
