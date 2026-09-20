import type { Db } from '@rundesk/db';
export declare class ContainerMembersService {
    private db;
    constructor(db: Db);
    private isWorkspaceManager;
    private spaceCtx;
    private assertCanManageSpace;
    listSpaceMembers(spaceId: string): Promise<{
        userId: string;
        role: "admin" | "edit" | "comment" | "view";
        email: string;
        displayName: string;
        avatarUrl: string | null;
    }[]>;
    addSpaceMember(spaceId: string, actorId: string, userId: string, role?: string): Promise<{
        ok: boolean;
    }>;
    updateSpaceMemberRole(spaceId: string, actorId: string, userId: string, role: string): Promise<{
        id: string;
        spaceId: string;
        userId: string;
        role: "admin" | "edit" | "comment" | "view";
        addedById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    removeSpaceMember(spaceId: string, actorId: string, userId: string): Promise<{
        ok: boolean;
    }>;
    setSpaceVisibility(spaceId: string, actorId: string, visibility: string): Promise<{
        id: string;
        workspaceId: string;
        name: string;
        description: string | null;
        color: string | null;
        icon: string | null;
        createdById: string | null;
        isArchived: boolean;
        archivedAt: Date | null;
        archivedById: string | null;
        visibility: "public" | "private";
        viewConfig: {
            defaultView?: string;
            enabledViews?: string[];
        } | null;
        defaultPermission: import("@rundesk/db").SpaceDefaultPermission;
        features: Record<string, boolean> | null;
        presetKey: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    private projectCtx;
    private assertCanManageProject;
    listProjectMembers(projectId: string): Promise<{
        userId: string;
        role: "admin" | "edit" | "comment" | "view";
        email: string;
        displayName: string;
        avatarUrl: string | null;
    }[]>;
    addProjectMember(projectId: string, actorId: string, userId: string, role?: string): Promise<{
        ok: boolean;
    }>;
    updateProjectMemberRole(projectId: string, actorId: string, userId: string, role: string): Promise<{
        id: string;
        projectId: string;
        userId: string;
        role: "admin" | "edit" | "comment" | "view";
        addedById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    removeProjectMember(projectId: string, actorId: string, userId: string): Promise<{
        ok: boolean;
    }>;
    setProjectVisibility(projectId: string, actorId: string, visibility: string | null): Promise<{
        id: string;
        spaceId: string;
        name: string;
        description: string | null;
        color: string | null;
        icon: string | null;
        folderId: string | null;
        clientId: string | null;
        position: number;
        createdById: string | null;
        isArchived: boolean;
        archivedAt: Date | null;
        archivedById: string | null;
        visibility: "public" | "private" | null;
        defaultBillable: boolean;
        isDefaultContainer: boolean;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
