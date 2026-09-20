import { type OnModuleInit } from '@nestjs/common';
import type { Db } from '@rundesk/db';
/**
 * §2.5 — cleared notifications age out.
 *
 * > "after 30 DAYS baad woh saare notifications automatically VANISH ho
 * > jayenge. ClickUp ka storage system TRASH ki tarah hi hai."
 *
 * Clearing a notification is the user saying they are done with it, and until
 * now that meant it sat in the Cleared bucket for ever. Trash already works
 * this way; notifications did not.
 *
 * Deliberately narrow. Only rows the user has actually dismissed are eligible,
 * and only by when they were dismissed — not by when they were created, which
 * would delete a notification someone cleared this morning because the event it
 * describes was old. Anything still in the Inbox, or snoozed to Later, is left
 * alone however long it has been there: nobody asked for their unread mentions
 * to be deleted.
 */
export declare class NotificationRetentionService implements OnModuleInit {
    private db;
    private readonly logger;
    /** How long a cleared notification is kept. Her number. */
    static readonly RETENTION_DAYS = 30;
    constructor(db: Db);
    /**
     * Announce the policy on boot. The job itself first runs at 4am, which is a
     * long time to wait to find out whether a deploy wired it up — this line in
     * the container log is what deploy/verify-release.sh checks.
     */
    onModuleInit(): void;
    runDaily(): Promise<number>;
    /**
     * Delete cleared notifications dismissed more than RETENTION_DAYS before
     * `now`. Takes the clock as an argument so the boundary can be tested at all
     * — a job that only ever runs against "today" is a job whose off-by-one you
     * find in production.
     */
    purge(now: Date): Promise<number>;
    /**
     * What the purge would remove, without removing it. Used by the deploy
     * verification, which needs to know the job is wired up without waiting a
     * day or destroying anything to find out.
     */
    countDue(now: Date): Promise<number>;
}
