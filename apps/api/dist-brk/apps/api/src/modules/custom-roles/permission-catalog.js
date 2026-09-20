"use strict";
/**
 * Canonical permission catalog. Permission strings live in the DB as
 * free text — this module is the single source of truth for what's
 * valid. Adding a new permission is a code change, not a schema change.
 *
 * Categories drive the admin UI grouping; descriptions are surfaced in
 * the role editor so admins know what each grant lets a user do.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_ROLE_PERMISSIONS = exports.ROLE_RANK = exports.PERMISSION_KEYS = exports.PERMISSION_CATALOG = void 0;
exports.effectiveCascade = effectiveCascade;
exports.isKnownPermission = isKnownPermission;
exports.PERMISSION_CATALOG = [
    // Workspace
    { key: 'workspace.manage', label: 'Manage workspace settings', description: 'Rename, set logo, change colour, archive', category: 'Workspace' },
    { key: 'workspace.billing', label: 'Manage billing', description: 'View invoices, change plan, manage payment method', category: 'Workspace' },
    { key: 'workspace.delete', label: 'Delete workspace', description: 'Permanently delete the workspace and all data', category: 'Workspace' },
    { key: 'workspace.audit.view', label: 'View audit log', description: 'Read the workspace activity / audit trail', category: 'Workspace' },
    // Members
    { key: 'members.invite', label: 'Invite members', description: 'Send invitations and create new accounts', category: 'Members' },
    { key: 'members.remove', label: 'Remove members', description: 'Revoke a member’s workspace access', category: 'Members' },
    { key: 'members.role.change', label: 'Change member roles', description: 'Promote / demote members (legacy and custom roles)', category: 'Members' },
    { key: 'roles.manage', label: 'Manage custom roles', description: 'Create / edit / delete custom roles and assign them', category: 'Members' },
    // Integrations
    { key: 'integrations.manage', label: 'Manage integrations', description: 'Connect / disconnect Slack, GitHub, Google, etc.', category: 'Integrations' },
    { key: 'integrations.access_requests.manage', label: 'Approve access requests', description: 'Approve / deny member requests to use integrations', category: 'Integrations' },
    // Security
    { key: 'sso.manage', label: 'Manage SSO / SCIM', description: 'Configure OIDC, SAML, and SCIM provisioning', category: 'Security' },
    { key: 'security.policy.manage', label: 'Manage security policies', description: 'IP allowlists, MFA enforcement, session policies', category: 'Security' },
    // Content
    { key: 'space.create', label: 'Create spaces', description: 'Spin up new spaces in this workspace', category: 'Content' },
    { key: 'project.create', label: 'Create projects', description: 'Create projects inside a space', category: 'Content' },
    { key: 'space.delete', label: 'Delete spaces', description: 'Permanently delete a space and its contents', category: 'Content' },
    { key: 'project.delete', label: 'Delete projects', description: 'Permanently delete projects', category: 'Content' },
    { key: 'list.delete', label: 'Delete lists', description: 'Permanently delete lists', category: 'Content' },
    { key: 'task.delete.any', label: 'Delete any task', description: 'Delete tasks created by anyone (not just your own)', category: 'Content' },
    { key: 'doc.publish', label: 'Publish docs externally', description: 'Toggle public read-only sharing on docs', category: 'Content' },
    { key: 'doc.delete.any', label: 'Delete any doc', description: 'Delete docs created by anyone', category: 'Content' },
    // Automation
    { key: 'automation.manage', label: 'Manage automations', description: 'Create / edit / disable workspace automations', category: 'Automation' },
    { key: 'webhook.manage', label: 'Manage webhooks', description: 'Create / rotate outbound webhook endpoints', category: 'Automation' },
    { key: 'template.manage', label: 'Manage templates', description: 'Save / edit / delete project + task templates', category: 'Automation' },
    // Reporting
    { key: 'report.view.basic', label: 'View reports', description: 'Open dashboards and reports', category: 'Reporting' },
    { key: 'report.export', label: 'Export reports', description: 'Download dashboards / reports as CSV or PDF', category: 'Reporting' },
    { key: 'time.approval.manage', label: 'Manage time approvals', description: 'Approve or reject time entries submitted by others', category: 'Reporting' },
];
exports.PERMISSION_KEYS = new Set(exports.PERMISSION_CATALOG.map((p) => p.key));
exports.ROLE_RANK = {
    guest: 0,
    member: 1,
    manager: 2,
    workspace_admin: 3,
    super_admin: 4,
};
// Permissions each lower tier adds. workspace_admin (and super_admin) inherit
// everything else, so a newly-added catalog permission defaults to admin-only
// until it is explicitly granted to a lower tier here.
const MEMBER_DELTA = ['space.create', 'doc.publish', 'report.export', 'report.view.basic'];
// Managers manage their projects, teams, and time — but NOT workspace-level
// infrastructure. `integrations.manage`, `webhook.manage`, and
// `automation.manage` were demoted to workspace_admin (0037); existing managers
// keep them via the grandfather custom role created in that migration.
const MANAGER_DELTA = [
    'members.invite',
    'project.create',
    'project.delete',
    'list.delete',
    'task.delete.any',
    'template.manage',
    'time.approval.manage',
];
const LOWER_TIER_KEYS = new Set([...MEMBER_DELTA, ...MANAGER_DELTA]);
const CASCADE_DELTAS = {
    guest: [],
    member: MEMBER_DELTA,
    manager: MANAGER_DELTA,
    workspace_admin: exports.PERMISSION_CATALOG.map((p) => p.key).filter((k) => !LOWER_TIER_KEYS.has(k)),
    super_admin: [],
};
/** Full permission set for a role = its delta unioned with every lower tier's. */
function effectiveCascade(role) {
    const rank = exports.ROLE_RANK[role] ?? 0;
    const out = new Set();
    for (const r of Object.keys(exports.ROLE_RANK)) {
        if (exports.ROLE_RANK[r] <= rank)
            for (const p of CASCADE_DELTAS[r])
                out.add(p);
    }
    return Array.from(out);
}
/**
 * Default permission bundles per legacy role, derived from the cascade so
 * there is one source of truth. Used by hasPermission() for members that
 * haven't migrated to custom roles yet.
 */
exports.LEGACY_ROLE_PERMISSIONS = {
    super_admin: effectiveCascade('super_admin'),
    workspace_admin: effectiveCascade('workspace_admin'),
    manager: effectiveCascade('manager'),
    member: effectiveCascade('member'),
    guest: effectiveCascade('guest'),
};
function isKnownPermission(key) {
    return exports.PERMISSION_KEYS.has(key);
}
//# sourceMappingURL=permission-catalog.js.map