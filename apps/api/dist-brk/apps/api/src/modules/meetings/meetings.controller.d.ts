import { MeetingsService } from './meetings.service';
/**
 * Meeting records. Membership is checked in the service on every route — the
 * collection hangs off a workspace, but a meeting is also reachable by its own
 * id, so no single guard covers both shapes.
 */
export declare class MeetingsController {
    private meetings;
    constructor(meetings: MeetingsService);
    list(workspaceId: string, user: {
        id: string;
    }, taskId?: string, 
    /** §A6 [19:16–19:20] — the "Tags:" chips in the meeting-notes toolbar. */
    tag?: string): Promise<{
        attendees: unknown[];
        id: string;
        workspaceId: string;
        title: string;
        startsAt: Date | null;
        endsAt: Date | null;
        provider: "zoom" | "google_meet" | "manual";
        joinUrl: string | null;
        recordingUrl: string | null;
        tags: string[];
        notes: string | null;
        transcript: string | null;
        taskId: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
        recordings: string[];
    }[]>;
    create(workspaceId: string, user: {
        id: string;
    }, body: {
        title: string;
        startsAt?: string | null;
        endsAt?: string | null;
        provider?: 'zoom' | 'google_meet' | 'manual';
        joinUrl?: string | null;
        recordingUrl?: string | null;
        notes?: string | null;
        taskId?: string | null;
        attendeeIds?: string[];
        tags?: string[];
    }): Promise<{
        attendees: unknown[];
        id: string;
        workspaceId: string;
        title: string;
        startsAt: Date | null;
        endsAt: Date | null;
        provider: "zoom" | "google_meet" | "manual";
        joinUrl: string | null;
        recordingUrl: string | null;
        tags: string[];
        notes: string | null;
        transcript: string | null;
        taskId: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
        recordings: string[];
    }>;
    ask(workspaceId: string, user: {
        id: string;
    }, body: {
        question?: string;
    }): Promise<{
        answer: string;
        grounded: boolean;
    }>;
    upcoming(workspaceId: string, user: {
        id: string;
    }): Promise<{
        attendees: unknown[];
        id: string;
        workspaceId: string;
        title: string;
        startsAt: Date | null;
        endsAt: Date | null;
        provider: "zoom" | "google_meet" | "manual";
        joinUrl: string | null;
        recordingUrl: string | null;
        tags: string[];
        notes: string | null;
        transcript: string | null;
        taskId: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
        recordings: string[];
    }[]>;
    get(workspaceId: string, meetingId: string, user: {
        id: string;
    }): Promise<{
        attendees: unknown[];
        id: string;
        workspaceId: string;
        title: string;
        startsAt: Date | null;
        endsAt: Date | null;
        provider: "zoom" | "google_meet" | "manual";
        joinUrl: string | null;
        recordingUrl: string | null;
        tags: string[];
        notes: string | null;
        transcript: string | null;
        taskId: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
        recordings: string[];
    }>;
    update(workspaceId: string, meetingId: string, user: {
        id: string;
    }, body: {
        title?: string;
        notes?: string | null;
        transcript?: string | null;
        recordingUrl?: string | null;
        startsAt?: string | null;
        endsAt?: string | null;
        tags?: string[];
    }): Promise<{
        attendees: unknown[];
        id: string;
        workspaceId: string;
        title: string;
        startsAt: Date | null;
        endsAt: Date | null;
        provider: "zoom" | "google_meet" | "manual";
        joinUrl: string | null;
        recordingUrl: string | null;
        tags: string[];
        notes: string | null;
        transcript: string | null;
        taskId: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
        recordings: string[];
    }>;
    remove(workspaceId: string, meetingId: string, user: {
        id: string;
    }): Promise<{
        ok: boolean;
    }>;
    addAttendee(workspaceId: string, meetingId: string, user: {
        id: string;
    }, body: {
        userId?: string;
        email?: string;
        name?: string;
    }): Promise<{
        attendees: unknown[];
        id: string;
        workspaceId: string;
        title: string;
        startsAt: Date | null;
        endsAt: Date | null;
        provider: "zoom" | "google_meet" | "manual";
        joinUrl: string | null;
        recordingUrl: string | null;
        tags: string[];
        notes: string | null;
        transcript: string | null;
        taskId: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
        recordings: string[];
    }>;
    removeAttendee(workspaceId: string, meetingId: string, attendeeId: string, user: {
        id: string;
    }): Promise<{
        ok: boolean;
    }>;
    shared(workspaceId: string, otherUserId: string, user: {
        id: string;
    }): Promise<{
        meetings: {
            id: string;
            title: string;
            startsAt: Date | null;
            endsAt: Date | null;
            provider: "zoom" | "google_meet" | "manual";
            recordingUrl: string | null;
        }[];
        tasks: {
            id: string;
            title: string;
            status: string;
            statusCategory: import("@rundesk/db").StatusCategory;
            priority: "urgent" | "high" | "normal" | "low";
            dueDate: Date | null;
            listId: string;
            assigneeId: string;
        }[];
    }>;
    actionItems(workspaceId: string, meetingId: string, user: {
        id: string;
    }, body: {
        createIn?: string;
    }): Promise<{
        items: {
            title: string;
            description?: string;
        }[];
        created: {
            id: string;
            title: string;
        }[];
    }>;
}
