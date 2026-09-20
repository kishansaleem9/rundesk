import type { Db } from '@rundesk/db';
import { NotificationsService } from '../notifications/notifications.service';
/**
 * User-created task reminders (Plan §4/§10). Users pin an arbitrary "remind me
 * at <time>" on a task; a minute tick fires each due reminder exactly once
 * through the notification pipeline. Separate from the automated
 * due-soon/overdue RemindersService in the notifications module.
 */
export declare class TaskRemindersService {
    private db;
    private notifications;
    private readonly logger;
    constructor(db: Db, notifications: NotificationsService);
    /** Resolve a task's title + workspace, asserting it lives in this workspace. */
    private resolveTask;
    /** Shared validation: a reminder has to be for a real, future moment. */
    private parseWhen;
    create(workspaceId: string, userId: string, taskId: string, remindAt: Date | string, note?: string): Promise<{
        taskTitle: string;
        id: string;
        createdAt: Date;
        workspaceId: string;
        userId: string;
        taskId: string | null;
        messageId: string | null;
        note: string | null;
        remindAt: Date;
        notifiedAt: Date | null;
    }>;
    /**
     * §G11 [15:19] — a reminder about a chat message.
     *
     * Access is the caller's problem to have established before getting here;
     * ChatService checks the channel and then calls this. What this owns is that
     * the row points at the message, so the notification lands you back on the
     * line you wanted to remember.
     */
    createForMessage(workspaceId: string, userId: string, messageId: string, remindAt: Date | string, note?: string): Promise<{
        id: string;
        createdAt: Date;
        workspaceId: string;
        userId: string;
        taskId: string | null;
        messageId: string | null;
        note: string | null;
        remindAt: Date;
        notifiedAt: Date | null;
    }>;
    /**
     * A reminder about nothing in particular — just a note and a time.
     *
     * This is what `/remind in 2 hours call Ali` should always have been. It used
     * to fabricate a task to hold the text, which left a phantom task in the list
     * for every egg-timer anybody set, and refused outright in a workspace with
     * no list yet.
     */
    createStandalone(workspaceId: string, userId: string, remindAt: Date | string, note: string): Promise<{
        id: string;
        createdAt: Date;
        workspaceId: string;
        userId: string;
        taskId: string | null;
        messageId: string | null;
        note: string | null;
        remindAt: Date;
        notifiedAt: Date | null;
    }>;
    /** The caller's reminders on a task (pending first, then fired), soonest first. */
    listForTask(taskId: string, userId: string): Promise<{
        id: string;
        workspaceId: string;
        userId: string;
        taskId: string | null;
        messageId: string | null;
        note: string | null;
        remindAt: Date;
        notifiedAt: Date | null;
        createdAt: Date;
    }[]>;
    /**
     * All of the caller's still-pending reminders in a workspace.
     *
     * LEFT joins, not inner. An inner join on `tasks` was correct only while
     * every reminder had a task; the moment one could be about a message or
     * about nothing, an inner join stops being a join and starts being a filter
     * that hides rows the user created and can see no reason for.
     */
    listUpcoming(workspaceId: string, userId: string): Promise<{
        id: string;
        taskId: string | null;
        taskTitle: string | null;
        messageId: string | null;
        messageBody: string | null;
        channelId: string | null;
        channelName: string | null;
        note: string | null;
        remindAt: Date;
        notifiedAt: Date | null;
    }[]>;
    /** The caller's reminders about one chat message, soonest first. */
    listForMessage(messageId: string, userId: string): Promise<{
        id: string;
        workspaceId: string;
        userId: string;
        taskId: string | null;
        messageId: string | null;
        note: string | null;
        remindAt: Date;
        notifiedAt: Date | null;
        createdAt: Date;
    }[]>;
    remove(id: string, userId: string): Promise<{
        ok: boolean;
    }>;
    /**
     * Fire every reminder that's due and not yet fired. Each row is claimed with a
     * conditional UPDATE (notified_at IS NULL) so a reminder can never double-fire,
     * even if two ticks overlap. Returns the number fired. Public so the tick — and
     * tests — can invoke it directly.
     */
    processDue(now?: Date): Promise<number>;
    /** Minute tick — fire any reminders that have come due. */
    tick(): Promise<void>;
}
