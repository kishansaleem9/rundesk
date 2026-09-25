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
  // Member management
  | 'members.invite'
  | 'members.remove'
  | 'members.role.change'
  | 'roles.manage'
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
  | 'task.delete.any'
  | 'doc.publish'
  | 'doc.delete.any'
  // Automation
  | 'automation.manage'
  | 'webhook.manage'
  | 'template.manage'
  // Reporting
  | 'report.view.basic'
  | 'report.export'
  | 'time.approval.manage'

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
  { key: 'workspace.manage',     label: 'Manage workspace settings',  description: 'Rename, set logo, change colour, archive', category: 'Workspace' },
  { key: 'workspace.billing',    label: 'Manage billing',             description: 'View invoices, change plan, manage payment method', category: 'Workspace' },
  // ClickUp: exporting the workspace's data and its people, and importing, are the owner's and
  // admins' (help centre, "Import and export feature availability and limits"); a custom role can grant them.
  { key: 'workspace.export',     label: 'Export workspace data',      description: 'Download every task and the people list as CSV or JSON', category: 'Workspace' },
  { key: 'workspace.import',     label: 'Import data',                description: 'Import from ClickUp or a spreadsheet, and load sample data', category: 'Workspace' },
  { key: 'workspace.audit.view', label: 'View audit log',             description: 'Read the workspace activity / audit trail', category: 'Workspace' },
  // Members
  { key: 'members.invite',        label: 'Invite members',     description: 'Send invitations and create new accounts', category: 'Members' },
  { key: 'members.remove',        label: 'Remove members',     description: 'Revoke a member’s workspace access', category: 'Members' },
  { key: 'members.role.change',   label: 'Change member roles', description: 'Promote / demote members (legacy and custom roles)', category: 'Members' },
  { key: 'roles.manage',          label: 'Manage custom roles', description: 'Create / edit / delete custom roles and assign them', category: 'Members' },
  // Integrations
  { key: 'integrations.manage',                 label: 'Manage integrations',          description: 'Connect / disconnect Slack, GitHub, Google, etc.', category: 'Integrations' },
  { key: 'integrations.access_requests.manage', label: 'Approve access requests',      description: 'Approve / deny member requests to use integrations', category: 'Integrations' },
  // Security
  { key: 'sso.manage',             label: 'Manage SSO / SCIM',          description: 'Configure OIDC, SAML, and SCIM provisioning', category: 'Security' },
  { key: 'security.policy.manage', label: 'Manage security policies',   description: 'IP allowlists, MFA enforcement, session policies', category: 'Security' },
  // Content
  { key: 'space.create',     label: 'Create spaces',             description: 'Spin up new spaces in this workspace', category: 'Content' },
  { key: 'project.create',   label: 'Create projects',           description: 'Create projects inside a space', category: 'Content' },
  { key: 'space.delete',     label: 'Delete spaces',             description: 'Permanently delete a space and its contents', category: 'Content' },
  { key: 'project.delete',   label: 'Delete projects',           description: 'Permanently delete projects', category: 'Content' },
  { key: 'list.delete',      label: 'Delete lists',              description: 'Permanently delete lists', category: 'Content' },
  { key: 'task.delete.any',  label: 'Delete any task',           description: 'Delete tasks created by anyone (not just your own)', category: 'Content' },
  { key: 'doc.publish',      label: 'Publish docs externally',   description: 'Toggle public read-only sharing on docs', category: 'Content' },
  { key: 'doc.delete.any',   label: 'Delete any doc',            description: 'Delete docs created by anyone', category: 'Content' },
  // Automation
  { key: 'automation.manage', label: 'Manage automations', description: 'Create / edit / disable workspace automations', category: 'Automation' },
  { key: 'webhook.manage',    label: 'Manage webhooks',    description: 'Create / rotate outbound webhook endpoints', category: 'Automation' },
  { key: 'template.manage',   label: 'Manage templates',   description: 'Save / edit / delete project + task templates', category: 'Automation' },
  // Reporting
  { key: 'report.view.basic',     label: 'View reports',             description: 'Open dashboards and reports', category: 'Reporting' },
  { key: 'report.export',         label: 'Export reports',           description: 'Download dashboards / reports as CSV or PDF', category: 'Reporting' },
  { key: 'time.approval.manage',  label: 'Manage time approvals',    description: 'Approve or reject time entries submitted by others', category: 'Reporting' },
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
const MEMBER_DELTA: readonly Permission[] = ['space.create', 'doc.publish', 'report.export', 'report.view.basic']
// Managers manage their projects, teams, and time — but NOT workspace-level
// infrastructure. `integrations.manage`, `webhook.manage`, and
// `automation.manage` were demoted to workspace_admin (0037); existing managers
// keep them via the grandfather custom role created in that migration.
const MANAGER_DELTA: readonly Permission[] = [
  'members.invite',
  'project.create',
  'project.delete',
  'list.delete',
  'task.delete.any',
  'template.manage',
  'time.approval.manage',
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
