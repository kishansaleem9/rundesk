import { ContainerMembersService } from './container-members.service';
export declare class ProjectMembersController {
    private members;
    constructor(members: ContainerMembersService);
    list(projectId: string): Promise<{
        userId: string;
        role: "admin" | "edit" | "comment" | "view";
        email: string;
        displayName: string;
        avatarUrl: string | null;
    }[]>;
    add(projectId: string, user: any, body: {
        userId: string;
        role?: string;
    }): Promise<{
        ok: boolean;
    }>;
    updateRole(projectId: string, userId: string, user: any, body: {
        role: string;
    }): Promise<{
        id: string;
        projectId: string;
        userId: string;
        role: "admin" | "edit" | "comment" | "view";
        addedById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(projectId: string, userId: string, user: any): Promise<{
        ok: boolean;
    }>;
    setVisibility(projectId: string, user: any, body: {
        visibility: string | null;
    }): Promise<{
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
