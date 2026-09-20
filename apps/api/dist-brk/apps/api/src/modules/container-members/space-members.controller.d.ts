import { ContainerMembersService } from './container-members.service';
export declare class SpaceMembersController {
    private members;
    constructor(members: ContainerMembersService);
    list(spaceId: string): Promise<{
        userId: string;
        role: "admin" | "edit" | "comment" | "view";
        email: string;
        displayName: string;
        avatarUrl: string | null;
    }[]>;
    add(spaceId: string, user: any, body: {
        userId: string;
        role?: string;
    }): Promise<{
        ok: boolean;
    }>;
    updateRole(spaceId: string, userId: string, user: any, body: {
        role: string;
    }): Promise<{
        id: string;
        spaceId: string;
        userId: string;
        role: "admin" | "edit" | "comment" | "view";
        addedById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(spaceId: string, userId: string, user: any): Promise<{
        ok: boolean;
    }>;
    setVisibility(spaceId: string, user: any, body: {
        visibility: string;
    }): Promise<{
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
}
