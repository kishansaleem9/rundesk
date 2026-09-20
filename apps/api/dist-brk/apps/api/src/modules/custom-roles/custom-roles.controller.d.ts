import { CustomRolesService } from './custom-roles.service';
/**
 * CRUD for the roles themselves, plus a catalog endpoint and a helper
 * for the current user to introspect their own effective permissions.
 */
export declare class CustomRolesController {
    private readonly roles;
    constructor(roles: CustomRolesService);
    catalog(): {
        permissions: readonly import("./permission-catalog").PermissionDef[];
    };
    myPermissions(workspaceId: string, user: any): Promise<import("./custom-roles.service").PermissionResolution | {
        permissions: never[];
        legacyRole: string;
        customRoleIds: never[];
    }>;
    list(workspaceId: string): Promise<import("./custom-roles.service").RoleView[]>;
    getOne(workspaceId: string, roleId: string): Promise<import("./custom-roles.service").RoleView>;
    assignees(workspaceId: string, roleId: string): Promise<{
        workspaceMemberIds: string[];
    }>;
    create(workspaceId: string, body: {
        name: string;
        description?: string | null;
        color?: string;
        permissions?: string[];
    }, user: any): Promise<import("./custom-roles.service").RoleView>;
    update(workspaceId: string, roleId: string, body: {
        name?: string;
        description?: string | null;
        color?: string;
        permissions?: string[];
    }, user: any): Promise<import("./custom-roles.service").RoleView>;
    remove(workspaceId: string, roleId: string, user: any): Promise<{
        ok: boolean;
    }>;
}
/**
 * Per-member role assignment lives at the natural URL
 * `/workspaces/:workspaceId/members/:memberId/roles`. Split out to
 * avoid the awkward `/roles/members/...` nesting.
 */
export declare class MemberRolesController {
    private readonly roles;
    constructor(roles: CustomRolesService);
    list(workspaceId: string, memberId: string): Promise<import("./custom-roles.service").RoleView[]>;
    assign(workspaceId: string, memberId: string, roleId: string, user: any): Promise<{
        ok: boolean;
    }>;
    unassign(workspaceId: string, memberId: string, roleId: string, user: any): Promise<{
        ok: boolean;
    }>;
}
