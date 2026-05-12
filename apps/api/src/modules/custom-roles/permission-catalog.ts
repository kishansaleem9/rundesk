/**
 * Canonical permission catalog. Permission strings live in the DB as
 * free text — this module is the single source of truth for what's
 * valid. Adding a new permission is a code change, not a schema change.
 *
 * Categories drive the admin UI grouping; descriptions are surfaced in
 * the role editor so admins know what each grant lets a user do.
 */

export type Permission =
  // Workspace-level
  | 'workspace.manage'
  | 'workspace.billing'
  | 'workspace.delete'
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
  { key: 'workspace.delete',     label: 'Delete workspace',           description: 'Permanently delete the workspace and all data', category: 'Workspace' },
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
  { key: 'report.export',         label: 'Export reports',           description: 'Download dashboards / reports as CSV or PDF', category: 'Reporting' },
  { key: 'time.approval.manage',  label: 'Manage time approvals',    description: 'Approve or reject time entries submitted by others', category: 'Reporting' },
]

export const PERMISSION_KEYS: ReadonlySet<Permission> = new Set(
  PERMISSION_CATALOG.map((p) => p.key),
)

/**
 * Default permission bundles granted by each legacy role. Used by
 * hasPermission() so the existing 4-role model continues to gate
 * features that haven't migrated to custom roles yet.
 */
export type LegacyWorkspaceRole = 'super_admin' | 'workspace_admin' | 'manager' | 'member' | 'guest'

export const LEGACY_ROLE_PERMISSIONS: Record<LegacyWorkspaceRole, readonly Permission[]> = {
  super_admin:     PERMISSION_CATALOG.map((p) => p.key),
  workspace_admin: PERMISSION_CATALOG.map((p) => p.key),
  manager: [
    'members.invite',
    'integrations.manage',
    'space.create',
    'project.delete',
    'list.delete',
    'task.delete.any',
    'doc.publish',
    'automation.manage',
    'webhook.manage',
    'template.manage',
    'report.export',
    'time.approval.manage',
  ],
  member: [
    'space.create',
    'doc.publish',
    'report.export',
  ],
  guest: [],
}

export function isKnownPermission(key: string): key is Permission {
  return PERMISSION_KEYS.has(key as Permission)
}
