import type { Db } from '@rundesk/db';
import { SecurityService } from '../security/security.service';
import { type LegacyWorkspaceRole, type Permission } from './permission-catalog';
type LegacyRole = LegacyWorkspaceRole;
export interface RoleView {
    id: string;
    workspaceId: string;
    name: string;
    description: string | null;
    color: string;
    isLocked: boolean;
    position: number;
    permissions: Permission[];
    memberCount: number;
    createdAt: Date;
    updatedAt: Date;
}
export interface PermissionResolution {
    permissions: Permission[];
    legacyRole: LegacyRole;
    customRoleIds: string[];
}
export declare class CustomRolesService {
    private readonly db;
    private readonly security;
    /**
     * Tiny in-process cache of resolved permission sets keyed by
     * `workspaceMemberId`. Invalidated on any role / assignment mutation
     * for that member. Sized small and intentionally not LRU — this is a
     * hot read path for permission checks and we'd rather rebuild than
     * over-engineer eviction.
     */
    private readonly permissionCache;
    private static readonly CACHE_MAX;
    constructor(db: Db, security: SecurityService);
    list(workspaceId: string): Promise<RoleView[]>;
    getById(workspaceId: string, roleId: string): Promise<RoleView>;
    create(workspaceId: string, input: {
        name: string;
        description?: string | null;
        color?: string;
        permissions?: string[];
    }, actor: {
        id: string;
        email?: string;
    }): Promise<RoleView>;
    update(workspaceId: string, roleId: string, patch: {
        name?: string;
        description?: string | null;
        color?: string;
        permissions?: string[];
    }, actor: {
        id: string;
        email?: string;
    }): Promise<RoleView>;
    remove(workspaceId: string, roleId: string, actor: {
        id: string;
        email?: string;
    }): Promise<void>;
    listAssignees(workspaceId: string, roleId: string): Promise<string[]>;
    listForMember(workspaceId: string, workspaceMemberId: string): Promise<RoleView[]>;
    assign(workspaceId: string, workspaceMemberId: string, roleId: string, actor: {
        id: string;
        email?: string;
    }): Promise<void>;
    unassign(workspaceId: string, workspaceMemberId: string, roleId: string, actor: {
        id: string;
        email?: string;
    }): Promise<void>;
    /**
     * Resolve the effective permission set for a user within a workspace,
     * unioning the legacy-role grant with every assigned custom role.
     * Returns null if the user is not a member of the workspace.
     */
    resolveForUser(workspaceId: string, userId: string): Promise<PermissionResolution | null>;
    resolveForMember(workspaceMemberId: string, legacyRole: LegacyRole): Promise<PermissionResolution>;
    /**
     * Convenience helper for callers that already know the workspaceId
     * and userId (e.g. controllers). Returns `false` if the user is not
     * a member of the workspace at all.
     */
    hasPermission(workspaceId: string, userId: string, permission: Permission): Promise<boolean>;
    private requireRole;
    private requireMember;
    private assertNameAvailable;
    private invalidateAfterRoleChange;
    private normaliseName;
    private normaliseDescription;
    private normaliseColor;
    private normalisePermissions;
    private toView;
    /**
     * Static export of the catalog so the controller can serve it without
     * needing to inject the service in a request scope. Lives here so
     * future filtering by feature flag stays in one place.
     */
    getCatalog(): readonly import("./permission-catalog").PermissionDef[];
}
export {};
