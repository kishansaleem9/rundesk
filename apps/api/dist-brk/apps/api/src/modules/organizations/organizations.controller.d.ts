import { OrganizationsService } from './organizations.service';
import type { CurrentUserPayload } from '../tasks/types';
export declare class OrganizationsController {
    private readonly organizationsService;
    constructor(organizationsService: OrganizationsService);
    list(user: CurrentUserPayload): Promise<{
        id: string;
        name: string;
        slug: string;
        logoUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
        membersCount: number;
        workspacesCount: number;
    }[]>;
    listDirectory(user: CurrentUserPayload, q?: string, limit?: string, offset?: string): Promise<import("./organizations.service").DirectoryResult>;
    get(id: string): Promise<{
        id: string;
        name: string;
        slug: string;
        logoUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(id: string, body: {
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
    listMembers(id: string): Promise<{
        id: string;
        email: string;
        displayName: string;
        avatarUrl: string | null;
        role: "member" | "owner" | "admin" | "billing";
        joinedAt: Date;
    }[]>;
    listWorkspaces(id: string): Promise<{
        id: string;
        name: string;
        slug: string;
        plan: string;
        isArchived: boolean;
        createdAt: Date;
    }[]>;
    updateMemberRole(orgId: string, userId: string, body: {
        role: 'owner' | 'admin' | 'billing' | 'member';
    }, user: CurrentUserPayload): Promise<{
        id: string;
        organizationId: string;
        userId: string;
        role: "member" | "owner" | "admin" | "billing";
        joinedAt: Date;
    }>;
    removeMember(orgId: string, userId: string): Promise<{
        ok: boolean;
    }>;
    leave(orgId: string, user: any): Promise<{
        ok: boolean;
    }>;
}
