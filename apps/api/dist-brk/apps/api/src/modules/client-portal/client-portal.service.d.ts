import type { Db } from '@rundesk/db';
import type { StatusCategory } from '@rundesk/db';
/**
 * A row of the SAFE task projection fetched for the public view. The SQL only
 * ever selects these columns — internal fields (assignees, description,
 * comments, priority, estimates, creator, list/space ids) are never queried.
 */
export type ClientPortalTaskRow = {
    id: string;
    title: string;
    status: string;
    statusCategory: StatusCategory;
    statusLabel: string | null;
    statusColor: string | null;
    dueDate: Date | null;
    completedAt: Date | null;
    isMilestone: boolean;
};
export type ClientPortalTask = {
    id: string;
    title: string;
    status: string;
    statusCategory: StatusCategory;
    statusColor: string | null;
    dueDate: string | null;
    isMilestone: boolean;
};
/** Humanise a raw status key when no list_status row resolves its label. */
export declare function humanizeStatusKey(key: string): string;
/**
 * Pure, allow-list projection of a task down to client-safe fields. Even if the
 * caller hands a row carrying internal fields, only the whitelisted keys are
 * emitted — a second guard behind the already-narrowed SQL select.
 */
export declare function toClientTask(row: ClientPortalTaskRow): ClientPortalTask;
export declare class ClientPortalService {
    private db;
    constructor(db: Db);
    /** Resolve a project's owning workspace + container visibility chain. */
    private resolveProject;
    /**
     * Assert the actor may manage portals for a project: workspace member with
     * container (private space/project) access. Reuses the same helper the
     * ResourceMemberGuard applies to project routes.
     */
    private assertProjectManageAccess;
    private getPortalOr404;
    private toAdminView;
    create(projectId: string, userId: string, body?: {
        name?: string | null;
        clientId?: string | null;
        showCompleted?: boolean;
    }): Promise<{
        id: string;
        projectId: string;
        clientId: string | null;
        token: string;
        url: string;
        name: string | null;
        isEnabled: boolean;
        showCompleted: boolean;
        createdById: string | null;
        createdAt: Date;
        lastViewedAt: Date | null;
    }>;
    listForProject(projectId: string, userId: string): Promise<{
        id: string;
        projectId: string;
        clientId: string | null;
        token: string;
        url: string;
        name: string | null;
        isEnabled: boolean;
        showCompleted: boolean;
        createdById: string | null;
        createdAt: Date;
        lastViewedAt: Date | null;
    }[]>;
    update(portalId: string, userId: string, body: {
        name?: string | null;
        isEnabled?: boolean;
        showCompleted?: boolean;
    }): Promise<{
        id: string;
        projectId: string;
        clientId: string | null;
        token: string;
        url: string;
        name: string | null;
        isEnabled: boolean;
        showCompleted: boolean;
        createdById: string | null;
        createdAt: Date;
        lastViewedAt: Date | null;
    }>;
    remove(portalId: string, userId: string): Promise<{
        ok: boolean;
    }>;
    /**
     * SECURITY-CRITICAL. Anonymous read by token. Returns ONLY:
     *   - workspace branding (name, logo, primary/accent color)
     *   - the linked project's display name (+ optional portal/client name)
     *   - that ONE project's tasks, projected to client-safe fields only
     *   - a coarse progress summary
     * Nothing internal (assignee emails, comments, notes, priority, estimates,
     * other projects) is ever queried or returned. Disabled portal → 404;
     * `show_completed=false` hides closed tasks from the list.
     */
    getPublicView(token: string): Promise<{
        portal: {
            name: string;
        };
        project: {
            name: string;
        };
        client: {
            name: string;
        } | null;
        workspace: {
            name: string;
            logoUrl: string | null;
            primaryColor: string | null;
            accentColor: string | null;
        };
        showCompleted: boolean;
        progress: {
            total: number;
            completed: number;
            percent: number;
        };
        tasks: ClientPortalTask[];
    }>;
}
