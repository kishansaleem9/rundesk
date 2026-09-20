import type { Db } from '@rundesk/db';
import { SecurityService } from '../security/security.service';
import { NotificationsService } from '../notifications/notifications.service';
export declare class TimeEntriesService {
    private db;
    private readonly security;
    private readonly notifications;
    constructor(db: Db, security: SecurityService, notifications: NotificationsService);
    canModerateApprovals(workspaceId: string, userId: string): Promise<boolean>;
    /** Guests may not track time (Plan §3.3). Resolves the task's workspace role. */
    private assertNotGuestForTask;
    /** Per-member monthly timesheet totals over the last `months` (§8.5). */
    getMonthlyTimesheet(workspaceId: string, months?: number): Promise<{
        totalHours: number;
        billableHours: number;
        userId: string;
        displayName: string;
        month: string;
        totalSeconds: number;
        billableSeconds: number;
    }[]>;
    /**
     * A5.14 — one row per person per weekday for a single week, which is what a
     * team timesheet is. The per-entry list can't answer "what did the team book
     * on Tuesday?" because it is scoped to one member and unpivoted by day.
     * `weekStart` is a Monday (normalized by the caller).
     */
    /** Monday (UTC) of the week containing `weekStart`; today's week when absent. */
    parseWeekStart(weekStart?: string): Date;
    getTeamWeek(workspaceId: string, weekStart: Date): Promise<{
        userId: string;
        displayName: string;
        daySeconds: number[];
        totalSeconds: number;
        billableSeconds: number;
    }[]>;
    /** The owning project's billable default for a task (§8.3). */
    private projectDefaultBillable;
    /**
     * Member submits their weekly timesheet for approval (§8.7): marks the week
     * 'submitted' and notifies workspace managers/admins (§10.1 approval_needed).
     */
    submitTimesheet(workspaceId: string, userId: string, weekStart: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        weekStart: string;
        userId: string;
        status: string;
        rejectionReason: string | null;
        approvedById: string | null;
        approvedAt: Date | null;
    }>;
    private normalizeWeekStart;
    listForWorkspace(workspaceId: string, opts?: {
        userId?: string;
        since?: Date;
        actorId?: string;
        actorRole?: string | null;
    }): Promise<{
        durationSeconds: number;
        billable: boolean;
        loggedAt: Date;
        id: string;
        taskId: string;
        userId: string;
        startedAt: Date;
        endedAt: Date | null;
        durationSec: number | null;
        description: string | null;
        isBillable: boolean;
        createdAt: Date;
        taskTitle: string | null;
        userName: string | null;
    }[]>;
    listApprovals(workspaceId: string, status?: 'pending' | 'submitted' | 'approved' | 'rejected'): Promise<{
        total: number;
        billable: number;
        id: string;
        userId: string;
        name: string;
        weekStart: string;
        weekOf: string;
        status: "pending" | "submitted" | "approved" | "rejected";
        approvedAt?: Date | null;
        approvedById?: string | null;
        reviewerName?: string | null;
        reviewerEmail?: string | null;
        rejectionReason?: string;
        entries: Array<{
            project: string;
            hours: number;
            billable: boolean;
            note?: string;
        }>;
    }[]>;
    setApprovalStatus(workspaceId: string, userId: string, weekStart: string, actorId: string, input: {
        status: 'approved' | 'rejected';
        reason?: string | null;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        weekStart: string;
        userId: string;
        status: string;
        rejectionReason: string | null;
        approvedById: string | null;
        approvedAt: Date | null;
    }>;
    getRunning(userId: string): Promise<{
        id: string;
        taskId: string;
        userId: string;
        startedAt: Date;
        endedAt: Date | null;
        durationSec: number | null;
        description: string | null;
        isBillable: boolean;
        clientInvoiceId: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    start(userId: string, taskId: string, description?: string, isBillable?: boolean): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        userId: string;
        taskId: string;
        startedAt: Date;
        endedAt: Date | null;
        durationSec: number | null;
        isBillable: boolean;
        clientInvoiceId: string | null;
    }>;
    stop(entryId: string, userId: string): Promise<{
        id: string;
        taskId: string;
        userId: string;
        startedAt: Date;
        endedAt: Date | null;
        durationSec: number | null;
        description: string | null;
        isBillable: boolean;
        clientInvoiceId: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    createManual(data: {
        userId: string;
        taskId: string;
        durationSec: number;
        startedAt?: Date;
        description?: string;
        isBillable?: boolean;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        userId: string;
        taskId: string;
        startedAt: Date;
        endedAt: Date | null;
        durationSec: number | null;
        isBillable: boolean;
        clientInvoiceId: string | null;
    }>;
    update(entryId: string, userId: string, patch: {
        durationSec?: number;
        description?: string | null;
        isBillable?: boolean;
        startedAt?: Date;
    }): Promise<{
        id: string;
        taskId: string;
        userId: string;
        startedAt: Date;
        endedAt: Date | null;
        durationSec: number | null;
        description: string | null;
        isBillable: boolean;
        clientInvoiceId: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(entryId: string, userId: string): Promise<{
        ok: boolean;
    }>;
}
