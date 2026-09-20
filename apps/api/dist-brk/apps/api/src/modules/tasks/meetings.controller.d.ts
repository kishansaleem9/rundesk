import { TasksService } from './tasks.service';
import { CreateMeetingDto, AttachRecordingDto } from './dto/meeting.dto';
import type { CurrentUserPayload } from './types';
/**
 * Task → meeting creation (Plan §12.9 Zoom / Google Meet).
 *
 * `POST /tasks/:taskId/meeting {provider}` creates a real meeting when the
 * provider is connected (Zoom via its own OAuth connection, Google Meet by
 * reusing the Google Calendar connection) and stores the join URL as a
 * `task_external_links` row with `kind:'meeting'`. When the provider isn't
 * connected the service returns a clean "connect {provider} first" 400.
 *
 * `POST /tasks/:taskId/meeting/:linkId/recording {url}` attaches a recording
 * link to a meeting after the fact. Access is enforced like the other nested
 * task writes (ResourceMemberGuard on :taskId + the service's write check).
 */
export declare class TaskMeetingsController {
    private tasks;
    constructor(tasks: TasksService);
    create(taskId: string, user: CurrentUserPayload, body: CreateMeetingDto): Promise<{
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
    attachRecording(taskId: string, linkId: string, user: CurrentUserPayload, body: AttachRecordingDto): Promise<{
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
}
