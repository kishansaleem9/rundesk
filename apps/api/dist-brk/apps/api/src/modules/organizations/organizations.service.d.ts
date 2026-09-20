import type { Db } from '@rundesk/db';
export type DirectoryWorkspace = {
    workspaceId: string;
    workspaceName: string;
    workspaceSlug: string;
    role: string;
};
export type DirectoryUser = {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
    role: string;
    emailVerified: boolean;
    isActive: boolean;
    lastSeenAt: Date | null;
    createdAt: Date;
    workspaces: DirectoryWorkspace[];
};
export type DirectoryResult = {
    users: DirectoryUser[];
    total: number;
    limit: number;
    offset: number;
};
export declare class OrganizationsService {
    private db;
    constructor(db: Db);
    findById(id: string): Promise<{
        id: string;
        name: string;
        slug: string;
        logoUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    listAll(): Promise<{
        id: string;
        name: string;
        slug: string;
        logoUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
        membersCount: number;
        workspacesCount: number;
    }[]>;
    /**
     * Global user directory (Plan §2.1) — a platform-wide, cross-workspace list of
     * every user, each with their per-workspace memberships. Super-admin only; the
     * caller (controller) enforces the super_admin gate. Read-only.
     *
     * `q` matches name OR email (case-insensitive). Results are paginated with
     * limit/offset and ordered newest-first; `total` is the unpaginated count so
     * the UI can render pagination.
     */
    listDirectory(opts?: {
        q?: string;
        limit?: number;
        offset?: number;
    }): Promise<DirectoryResult>;
    update(id: string, patch: {
        name?: string;
        logoUrl?: string | null;
    }): Promise<{
        id: string;
        name: string;
        slug: string;
        logoUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    listMembers(organizationId: string): Promise<{
        id: string;
        email: string;
        displayName: string;
        avatarUrl: string | null;
        role: "member" | "owner" | "admin" | "billing";
        joinedAt: Date;
    }[]>;
    /**
     * §G08 [08:35–09:57] — the org-admin roster, narrowed to what a roster needs.
     *
     * This returned `select()` — every column of every workspace in the
     * organization, to an admin who need not be a member of any of them. Among
     * those columns is `customDomainToken`, the `rundesk-verify=…` secret used to
     * prove control of a domain, plus branding, `purpose` and `comingFrom`, which
     * are answers somebody gave inside their own workspace.
     *
     * Its one caller asks for four fields (master-admin-panel.tsx:762), so the
     * breadth bought nothing and exposed a secret to people outside the
     * workspace. Projected explicitly now: a new column is not published to this
     * audience by default, which is the property that failed here.
     *
     * NOT narrowed by membership. She settles that a workspace someone makes is
     * theirs until they share it — "woh meri email pe ban rahi hai" — and the
     * member-facing list already honours that (`findByMember` joins through
     * `workspace_members`). What she never settles is whether a company admin
     * keeps a residual right to *enumerate* for billing or offboarding, so that
     * is left exactly as it was rather than decided here.
     */
    listWorkspaces(organizationId: string): Promise<{
        id: string;
        name: string;
        slug: string;
        plan: string;
        isArchived: boolean;
        createdAt: Date;
    }[]>;
    updateMemberRole(organizationId: string, userId: string, role: 'owner' | 'admin' | 'billing' | 'member', actorId?: string): Promise<{
        id: string;
        organizationId: string;
        userId: string;
        role: "member" | "owner" | "admin" | "billing";
        joinedAt: Date;
    }>;
    removeMember(organizationId: string, userId: string): Promise<{
        ok: boolean;
    }>;
    leaveOrganization(organizationId: string, userId: string): Promise<{
        ok: boolean;
    }>;
}
