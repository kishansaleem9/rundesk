import { WorkspaceGroupsService } from './workspace-groups.service';
type CurrentUserPayload = {
    id: string;
};
export declare class WorkspaceGroupsController {
    private groups;
    constructor(groups: WorkspaceGroupsService);
    list(workspaceId: string, search?: string): Promise<{
        members: {
            userId: string;
            email: string;
            displayName: string;
        }[];
        memberCount: number;
        id: string;
        workspaceId: string;
        name: string;
        description: string | null;
        alias: string | null;
        externalId: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    get(workspaceId: string, groupId: string): Promise<{
        members: {
            userId: string;
            email: string;
            displayName: string;
            avatarUrl: string | null;
        }[];
        id: string;
        workspaceId: string;
        name: string;
        description: string | null;
        alias: string | null;
        externalId: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    create(workspaceId: string, body: {
        name: string;
        description?: string;
        alias?: string | null;
        memberIds?: string[];
    }, user: CurrentUserPayload): Promise<{
        members: {
            userId: string;
            email: string;
            displayName: string;
            avatarUrl: string | null;
        }[];
        id: string;
        workspaceId: string;
        name: string;
        description: string | null;
        alias: string | null;
        externalId: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(workspaceId: string, groupId: string, body: {
        name?: string;
        description?: string | null;
        alias?: string | null;
    }, user: CurrentUserPayload): Promise<{
        members: {
            userId: string;
            email: string;
            displayName: string;
            avatarUrl: string | null;
        }[];
        id: string;
        workspaceId: string;
        name: string;
        description: string | null;
        alias: string | null;
        externalId: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(workspaceId: string, groupId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    addMembers(workspaceId: string, groupId: string, body: {
        userIds: string[];
    }, user: CurrentUserPayload): Promise<{
        members: {
            userId: string;
            email: string;
            displayName: string;
            avatarUrl: string | null;
        }[];
        id: string;
        workspaceId: string;
        name: string;
        description: string | null;
        alias: string | null;
        externalId: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    replaceMembers(workspaceId: string, groupId: string, body: {
        userIds: string[];
    }, user: CurrentUserPayload): Promise<{
        members: {
            userId: string;
            email: string;
            displayName: string;
            avatarUrl: string | null;
        }[];
        id: string;
        workspaceId: string;
        name: string;
        description: string | null;
        alias: string | null;
        externalId: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    removeMember(workspaceId: string, groupId: string, userId: string, user: CurrentUserPayload): Promise<{
        members: {
            userId: string;
            email: string;
            displayName: string;
            avatarUrl: string | null;
        }[];
        id: string;
        workspaceId: string;
        name: string;
        description: string | null;
        alias: string | null;
        externalId: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
/**
 * §V2-12 — the Teams Hub itself, as opposed to one team.
 *
 * A separate controller under `/workspaces/:id/teams` rather than more routes
 * on `/groups`, because none of this is about a group: the person cards at
 * frame `21:00` are per MEMBER, and half the people on that screen are in no
 * team at all. Hanging them off `/groups/:groupId/...` would have forced the
 * page to invent a group id it does not have.
 *
 * `WorkspaceMemberGuard`, not admin — the entire point of §V2-12 was that
 * looking at your own organisation stopped requiring admin rights. The one
 * write here does its own permission check (yours, or an admin's), because
 * "only admins" and "yours or an admin's" are different rules and a guard
 * cannot express the second.
 */
export declare class TeamsHubController {
    private groups;
    constructor(groups: WorkspaceGroupsService);
    /** Everyone in the workspace, with the work each of them actually has open. */
    workPreview(workspaceId: string, perPerson?: string): Promise<{
        userId: string;
        displayName: string;
        email: string;
        avatarUrl: string | null;
        role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
        jobTitle: string | null;
        openCount: number;
        items: {
            id: string;
            title: string;
            status: string;
            statusCategory: import("@rundesk/db").StatusCategory;
            dueDate: Date | null;
            listId: string;
        }[];
    }[]>;
    /** The line under the name on a person card. */
    setJobTitle(workspaceId: string, userId: string, body: {
        jobTitle?: string | null;
    }, user: CurrentUserPayload): Promise<{
        userId: string;
        jobTitle: string | null;
    }>;
}
export {};
