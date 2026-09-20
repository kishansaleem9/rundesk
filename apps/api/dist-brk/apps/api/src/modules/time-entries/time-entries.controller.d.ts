import { TimeEntriesService } from './time-entries.service';
import type { CurrentUserPayload } from '../tasks/types';
export declare class WorkspaceTimeEntriesController {
    private time;
    constructor(time: TimeEntriesService);
    list(workspaceId: string, actor: CurrentUserPayload, userId?: string, since?: string): Promise<{
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
    update(entryId: string, actor: CurrentUserPayload, body: {
        durationSec?: number;
        description?: string | null;
        isBillable?: boolean;
        startedAt?: string;
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
    remove(entryId: string, actor: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    monthly(workspaceId: string, actor: CurrentUserPayload, months?: string): Promise<{
        totalHours: number;
        billableHours: number;
        userId: string;
        displayName: string;
        month: string;
        totalSeconds: number;
        billableSeconds: number;
    }[]>;
    teamWeek(workspaceId: string, actor: CurrentUserPayload, weekStart?: string): Promise<{
        userId: string;
        displayName: string;
        daySeconds: number[];
        totalSeconds: number;
        billableSeconds: number;
    }[]>;
    listApprovals(workspaceId: string, actor: CurrentUserPayload, status?: 'pending' | 'submitted' | 'approved' | 'rejected'): Promise<{
        canModerate: boolean;
        items: {
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
            entries: {
                project: string;
                hours: number;
                billable: boolean;
                note?: string;
            }[];
        }[];
    }>;
    submitTimesheet(workspaceId: string, actor: CurrentUserPayload, body: {
        weekStart: string;
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
    approveTimesheet(workspaceId: string, userId: string, weekStart: string, actor: CurrentUserPayload): Promise<{
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
    rejectTimesheet(workspaceId: string, userId: string, weekStart: string, actor: CurrentUserPayload, body: {
        reason?: string;
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
}
