import type { Db } from '@rundesk/db';
import { NotificationsService } from './notifications.service';
export declare class RemindersService {
    private db;
    private notifications;
    private readonly logger;
    constructor(db: Db, notifications: NotificationsService);
    /**
     * Runs every day at 8 AM UTC.
     * Sends due-soon reminders at each user's configured lead days (§10.4 —
     * default [1, 2], optionally 7) and overdue notifications.
     */
    sendDueDateReminders(): Promise<void>;
    /**
     * End-of-day: warn anyone who left a timer running (Plan §8.1).
     */
    warnLeftRunningTimers(): Promise<void>;
}
