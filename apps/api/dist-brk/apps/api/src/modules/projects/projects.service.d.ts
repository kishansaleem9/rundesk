import type { Db } from '@rundesk/db';
import { WebhooksService } from '../webhooks/webhooks.service';
import { SlackService } from '../integrations/slack/slack.service';
import { PlansService } from '../plans/plans.service';
import { SecurityService } from '../security/security.service';
export declare class ProjectsService {
    private db;
    private webhooks;
    private slack;
    private plans;
    private security;
    constructor(db: Db, webhooks: WebhooksService, slack: SlackService, plans: PlansService, security: SecurityService);
    /**
     * Best-effort fan-out of a project lifecycle event to webhooks + Slack
     * (Plan §12.1 project update alerts, §12.4 webhooks). Mirrors
     * TasksService.fireTaskEvent: the workspace is resolved via the project's
     * space, delivery is non-blocking, and any failure is logged but never
     * propagated so a downed webhook/Slack channel can't break the mutation.
     */
    private fireProjectEvent;
    createProject(spaceId: string, data: {
        name: string;
        description?: string;
        color?: string;
        icon?: string;
        folderId?: string;
    }, actorId?: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        isArchived: boolean;
        description: string | null;
        color: string | null;
        icon: string | null;
        createdById: string | null;
        archivedAt: Date | null;
        archivedById: string | null;
        visibility: "public" | "private" | null;
        spaceId: string;
        folderId: string | null;
        clientId: string | null;
        position: number;
        defaultBillable: boolean;
        isDefaultContainer: boolean;
    }>;
    /** List only the archived projects of a space (for the restore UI). */
    getArchivedProjectsBySpace(spaceId: string): Promise<{
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
    }[]>;
    getProjectsBySpace(spaceId: string, actorId?: string): Promise<{
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
    }[]>;
    /** Managers and admins of the owning space see every project in it. */
    private canSeeAllProjects;
    getProject(projectId: string): Promise<{
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
    updateProject(projectId: string, data: Partial<{
        name: string;
        description: string;
        color: string;
        icon: string;
        folderId: string | null;
        defaultBillable: boolean;
        clientId: string | null;
    }>, actorId?: string): Promise<{
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
    deleteProject(projectId: string, actorId?: string, ipAddress?: string): Promise<void>;
    /** Restore an archived project (Plan §2.4 / §13.4). */
    restoreProject(projectId: string, actorId?: string): Promise<{
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
    /**
     * Move a project to another space and/or folder. Its lists and tasks follow
     * automatically because they hang off the project.
     *
     * `folderId: null` moves the project out of its folder to sit directly under
     * the space (the client's "move back"). A folder target must belong to the
     * destination space, and the destination must be in the same workspace.
     */
    moveProject(projectId: string, target: {
        spaceId?: string;
        folderId?: string | null;
    }, actorId?: string, ipAddress?: string): Promise<{
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
    private assertManageable;
}
