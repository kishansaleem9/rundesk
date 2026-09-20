import { TasksService } from './tasks.service';
import { CreateExternalLinkDto } from './dto/external-link.dto';
import type { CurrentUserPayload } from './types';
/**
 * Task ↔ external-service links (Plan §12.8 GitHub/GitLab, §12.2 Google Drive).
 * Access is enforced like other nested task writes (ResourceMemberGuard on the
 * :taskId param + the service's task-write access check).
 */
export declare class TaskExternalLinksController {
    private tasks;
    constructor(tasks: TasksService);
    list(taskId: string, user: CurrentUserPayload): Promise<{
        id: string;
        provider: string;
        kind: string;
        url: string;
        externalId: string | null;
        title: string | null;
        status: string | null;
        metadata: Record<string, unknown> | null;
        commentId: string | null;
        createdAt: Date;
    }[]>;
    /** §12.6 — links attached to a specific comment on this task. */
    listForComment(taskId: string, commentId: string, user: CurrentUserPayload): Promise<{
        id: string;
        provider: string;
        kind: string;
        url: string;
        externalId: string | null;
        title: string | null;
        status: string | null;
        metadata: Record<string, unknown> | null;
        commentId: string | null;
        createdAt: Date;
    }[]>;
    create(taskId: string, user: CurrentUserPayload, body: CreateExternalLinkDto): Promise<{
        id: string;
        createdAt: Date;
        workspaceId: string;
        createdById: string | null;
        title: string | null;
        status: string | null;
        taskId: string;
        commentId: string | null;
        provider: string;
        kind: string;
        url: string;
        externalId: string | null;
        metadata: Record<string, unknown> | null;
    }>;
    refresh(taskId: string, linkId: string, user: CurrentUserPayload): Promise<{
        id: string;
        taskId: string;
        commentId: string | null;
        workspaceId: string;
        provider: string;
        kind: string;
        url: string;
        externalId: string | null;
        title: string | null;
        status: string | null;
        metadata: Record<string, unknown> | null;
        createdById: string | null;
        createdAt: Date;
    }>;
    remove(taskId: string, linkId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
}
