/**
 * Canonical permission catalog. Permission strings live in the DB as
 * free text — this module is the single source of truth for what's
 * valid. Adding a new permission is a code change, not a schema change.
 *
 * Categories drive the admin UI grouping; descriptions are surfaced in
 * the role editor so admins know what each grant lets a user do.
 */
export type Permission = 'workspace.manage' | 'workspace.billing' | 'workspace.delete' | 'workspace.audit.view' | 'members.invite' | 'members.remove' | 'members.role.change' | 'roles.manage' | 'integrations.manage' | 'integrations.access_requests.manage' | 'sso.manage' | 'security.policy.manage' | 'space.create' | 'project.create' | 'space.delete' | 'project.delete' | 'list.delete' | 'task.delete.any' | 'doc.publish' | 'doc.delete.any' | 'automation.manage' | 'webhook.manage' | 'template.manage' | 'report.view.basic' | 'report.export' | 'time.approval.manage';
export type PermissionCategory = 'Workspace' | 'Members' | 'Integrations' | 'Security' | 'Content' | 'Automation' | 'Reporting';
export type PermissionDef = {
    key: Permission;
    label: string;
    description: string;
    category: PermissionCategory;
};
export declare const PERMISSION_CATALOG: readonly PermissionDef[];
export declare const PERMISSION_KEYS: ReadonlySet<Permission>;
/**
 * Strict role hierarchy. Higher roles inherit every permission of all lower
 * roles (a cascade). CASCADE_DELTAS lists only what each tier ADDS on top of
 * the tier below it; effectiveCascade() rolls them up. This is the single
 * source of truth — LEGACY_ROLE_PERMISSIONS below is derived from it.
 */
export type LegacyWorkspaceRole = 'super_admin' | 'workspace_admin' | 'manager' | 'member' | 'guest';
export declare const ROLE_RANK: Record<LegacyWorkspaceRole, number>;
/** Full permission set for a role = its delta unioned with every lower tier's. */
export declare function effectiveCascade(role: LegacyWorkspaceRole): Permission[];
/**
 * Default permission bundles per legacy role, derived from the cascade so
 * there is one source of truth. Used by hasPermission() for members that
 * haven't migrated to custom roles yet.
 */
export declare const LEGACY_ROLE_PERMISSIONS: Record<LegacyWorkspaceRole, readonly Permission[]>;
export declare function isKnownPermission(key: string): key is Permission;
