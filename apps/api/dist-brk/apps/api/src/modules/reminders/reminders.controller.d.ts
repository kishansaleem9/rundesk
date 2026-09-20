import { TaskRemindersService } from './task-reminders.service';
import type { CurrentUserPayload } from '../tasks/types';
export declare class RemindersController {
    private reminders;
    constructor(reminders: TaskRemindersService);
    /** The caller's still-pending reminders across the workspace. */
    listUpcoming(workspaceId: string, user: CurrentUserPayload): Promise<{
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
    /** The caller's reminders on a specific task. */
    listForTask(taskId: string, user: CurrentUserPayload): Promise<{
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
     * A reminder about a task, or about nothing in particular.
     *
     * §G15 [21:36] — "phir REMINDER ka" is one of the things the create modal is
     * supposed to offer, and there is nothing to attach a reminder to at that
     * moment: you are creating it, not annotating something. Since 0115 the
     * subject is optional, so a bare `{ remindAt, note }` is a whole reminder.
     */
    create(workspaceId: string, user: CurrentUserPayload, body: {
        taskId?: string;
        remindAt: string;
        note?: string;
    }): Promise<{
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
    remove(id: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
}
