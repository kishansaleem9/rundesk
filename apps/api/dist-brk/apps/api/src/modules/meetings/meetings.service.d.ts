import type { Db } from '@rundesk/db';
import { AiService } from '../ai/ai.service';
import { R2Service } from '../../common/storage/r2.service';
import { TasksService } from '../tasks/tasks.service';
/**
 * Meeting records.
 *
 * Starting a meeting from a task already worked; nothing was kept afterwards.
 * This is the record — who was there, what was said, where the recording is —
 * so the notes the AI can already read have somewhere to live, and the action
 * items it extracts can be turned into real tasks against a real meeting.
 */
/**
 * §A6 [19:16–19:20] — the tags on a meeting note, cleaned once.
 *
 * Trimmed, de-duplicated case-insensitively (so "Standup" and "standup" are one
 * chip, not two that look identical in the toolbar), blanks dropped, and
 * bounded. A tag list is chips on a filter bar: a hundred of them, or one
 * three-thousand characters long, is not a filter any more.
 */
export declare function normalizeMeetingTags(value: unknown): string[];
export declare class MeetingsService {
    private db;
    private readonly ai;
    private readonly tasksService;
    private readonly r2;
    constructor(db: Db, ai: AiService, tasksService: TasksService, r2: R2Service);
    /**
     * §2.8 gap 10 — turn a stored recording pointer into something playable.
     *
     * `recordingUrl` holds two different things and always has: a URL somebody
     * pasted in (a Zoom link, a Drive file), and — since calls started leaving
     * recordings behind — a storage key for a file we hold ourselves.
     *
     * They are safely told apart because a storage key has no scheme. That
     * matters because signing is not optional here: R2 signed URLs last fifteen
     * minutes, so a signed URL written into this column is a dead link before
     * the meeting notes have been read once. The key is what is durable; the URL
     * is made fresh on the way out, exactly as chat attachments already do.
     */
    private playableRecording;
    /**
     * §2.8 — every piece of a call's recording, playable, per meeting.
     *
     * Recording is a toggle: a call can be recorded, stopped for a private aside
     * and recorded again, and each stop produces its own file. `call_recordings`
     * has kept all of them since 0111, but nothing ever read that table — the
     * meeting still showed the single key on `meetings.recordingUrl`, so the
     * second and later pieces were bytes in storage that no route, no service
     * and no screen could reach. This is the read the table was made for.
     *
     * Reached through the call rather than through the meeting, because that is
     * the direction the link points (`calls.meeting_id`), and it means a piece
     * that finishes uploading AFTER the call ended still joins its record with
     * no backfill of its own.
     */
    private recordingsFor;
    /**
     * A meeting on its way out: the recording pointer signed, and every piece of
     * a call recording alongside it.
     *
     * `recordingUrl` stays exactly what it was — the one link a meeting has
     * always had, whether pasted in or captured here — so nothing that reads it
     * changes meaning. `recordings` is the whole of what was captured, in order,
     * and is empty for a meeting that was never a call.
     */
    private withRecordings;
    private assertMember;
    /** Scoped by workspace, so an id from another tenant reads as missing. */
    private load;
    private attendeesFor;
    list(workspaceId: string, userId: string, opts?: {
        taskId?: string;
        tag?: string;
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
    /**
     * §2.8 — the "Upcoming Meetings" block, with a Join pill and a countdown.
     *
     * Split on the SERVER against `now()` rather than filtered in the browser:
     * a client clock that is wrong — a laptop woken from sleep, a machine in the
     * wrong timezone — would move a meeting between "upcoming" and "past" with
     * nothing to say it had, and the person would simply not be told about a call
     * that is about to start.
     */
    upcoming(workspaceId: string, userId: string, now?: Date): Promise<{
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
    /**
     * §2.8 — what the meetings ask-box answers from.
     *
     * Notes are truncated per meeting rather than the list being cut short: a
     * question like "what did I miss this week" is answered badly by three
     * meetings in full and wrongly by none of the others.
     */
    recentForAi(workspaceId: string, userId: string, limit?: number): Promise<{
        notes: string | null;
        attendees: string[];
        id: string;
        title: string;
        startsAt: Date | null;
        createdAt: Date;
    }[]>;
    /**
     * §2.8 — the ask-box. The membership check and the read live here; the AI
     * only sees records this person is already allowed to see.
     */
    ask(workspaceId: string, userId: string, question: string): Promise<{
        answer: string;
        grounded: boolean;
    }>;
    get(workspaceId: string, meetingId: string, userId: string): Promise<{
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
    create(workspaceId: string, userId: string, body: {
        title: string;
        startsAt?: string | null;
        endsAt?: string | null;
        provider?: 'zoom' | 'google_meet' | 'manual';
        joinUrl?: string | null;
        recordingUrl?: string | null;
        notes?: string | null;
        tags?: string[];
        taskId?: string | null;
        attendeeIds?: string[];
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
    private assertTaskInWorkspace;
    /** Replace the member attendee set. Outsiders are added separately. */
    private setAttendees;
    update(workspaceId: string, meetingId: string, userId: string, body: {
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
    remove(workspaceId: string, meetingId: string, userId: string): Promise<{
        ok: boolean;
    }>;
    addAttendee(workspaceId: string, meetingId: string, userId: string, body: {
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
    removeAttendee(workspaceId: string, meetingId: string, attendeeId: string, userId: string): Promise<{
        ok: boolean;
    }>;
    /**
     * What two people share: the meetings they both attended, and the open tasks
     * either of them is assigned to.
     *
     * This is what sits behind a DM's Calendar and Tasks tabs. A DM is the one
     * place where "what are we both on?" is the actual question, and answering it
     * needed no new storage — meetings know their attendees and tasks know their
     * assignees, so it is two joins rather than a new concept.
     */
    sharedWith(workspaceId: string, otherUserId: string, userId: string): Promise<{
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
    /**
     * Pull action items out of this meeting's notes.
     *
     * The extraction already existed but had no meeting to read from, so the
     * caller had to paste the notes in and the result belonged to nothing. With
     * `createIn` the items become real tasks in a list, which is the half that
     * makes the loop close.
     */
    extractActionItems(workspaceId: string, meetingId: string, userId: string, opts?: {
        createIn?: string;
    }): Promise<{
        items: {
            title: string;
            description?: string;
        }[];
        created: Array<{
            id: string;
            title: string;
        }>;
    }>;
}
