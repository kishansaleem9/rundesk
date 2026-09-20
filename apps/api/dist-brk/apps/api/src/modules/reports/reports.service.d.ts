import type { Db } from '@rundesk/db';
import { AiService } from '../ai/ai.service';
export type ReportDefinition = {
    metrics?: string[];
    dimensions?: string[];
    dimension?: string;
    filters?: Array<{
        field: string;
        op: string;
        value: string;
    }>;
    viz?: 'bar' | 'line' | 'pie' | 'table';
    days?: number;
};
export type ReportResult = {
    dimension: string;
    metrics: string[];
    generatedAt: string;
    rows: Array<{
        key: string;
        label: string;
        values: Record<string, number>;
    }>;
};
export type ReportScheduleInput = {
    frequency?: 'none' | 'daily' | 'weekly' | string;
    hour?: number;
    dayOfWeek?: number | null;
    recipients?: string[];
};
export type ReportScheduleColumns = {
    scheduleFrequency: 'none' | 'daily' | 'weekly';
    scheduleHour: number;
    scheduleDayOfWeek: number | null;
    scheduleRecipients: string[];
};
/**
 * Validate + clamp incoming schedule fields. Throws BadRequestException on an
 * invalid frequency or malformed recipient email; clamps hour to 0–23 and
 * weekday to 0–6, and defaults a weekly schedule with no weekday to Monday.
 * Returns null when no schedule fields were supplied so a plain name/definition
 * edit leaves the existing schedule untouched.
 */
export declare function normalizeScheduleInput(input?: ReportScheduleInput): ReportScheduleColumns | null;
/**
 * Serialize a run result to CSV (a `group` column + one column per metric).
 * Shared by the CSV export endpoint and the scheduled-report email attachment.
 */
export declare function reportResultToCsv(result: ReportResult): string;
export type ContributionPeriodType = 'this-month' | 'last-month' | 'sprint';
export type ContributionPeriod = {
    type: ContributionPeriodType;
    from: string;
    to: string;
    label: string;
    sprintId?: string;
};
export type ContributionFactors = {
    userId: string;
    name: string;
    email: string | null;
    tasksCompleted: number;
    tasksAssigned: number;
    onTimeRate: number;
    collaboration: number;
    blockersResolved: number;
    score: number;
};
/** Pure month-range resolver for this-month / last-month in UTC (§7.14 period selector). */
export declare function monthPeriodRange(period: 'this-month' | 'last-month', now: Date): {
    from: Date;
    to: Date;
    label: string;
};
/**
 * Composite contribution index from a member's real factors (§7.14). Weighted so
 * completed work and resolved blockers dominate, with on-time reliability and
 * collaboration as secondary signals. Pure + testable.
 */
export declare function scoreContribution(f: {
    tasksCompleted: number;
    onTimeRate: number;
    collaboration: number;
    blockersResolved: number;
}): number;
/** Deterministic per-member contribution narrative (§7.14 AI fallback). Pure + testable. */
export declare function contributionNarrativeFallback(f: {
    name: string;
    tasksCompleted: number;
    onTimeRate: number;
    collaboration: number;
    blockersResolved: number;
}): string;
/**
 * Resolved View-Reports scope for a viewer (Plan §3.3):
 *   • all        — admins/super-admins see every member + every container.
 *   • user       — plain members/guests see only their own row (backward-compat
 *                  with the previous `restrictToUserId` behaviour).
 *   • containers — a manager sees their TEAM: tasks/time inside the spaces and
 *                  projects they belong to (space_members / project_members),
 *                  plus their own rows wherever those live.
 */
export type ViewerScope = {
    kind: 'all';
} | {
    kind: 'user';
    userId: string;
} | {
    kind: 'containers';
    spaceIds: string[];
    projectIds: string[];
    userId: string;
};
/**
 * Is `d` one of the workspace's working days?
 *
 * Extracted and exported because of the off-by-one waiting in it: JavaScript's
 * `getDay()` is 0=Sunday..6=Saturday, while `workspaces.work_days` stores ISO
 * weekdays, 1=Monday..7=Sunday. Getting that backwards silently shifts every
 * capacity figure by a day, which no integration test would obviously catch.
 */
export declare function isWorkingWeekday(d: Date, workDays: ReadonlySet<number>): boolean;
export declare class ReportsService {
    private db;
    private ai?;
    constructor(db: Db, ai?: AiService | undefined);
    getOverview(workspaceId: string, actor?: {
        id: string;
        role?: string | null;
    }): Promise<{
        total: number;
        completed: number;
        overdue: number;
        dueToday: number;
        completionRate: number;
        byPriority: Record<string, number>;
        dueTodayList: {
            id: string;
            title: string;
            status: string;
            statusCategory: import("@rundesk/db").StatusCategory;
            priority: "urgent" | "high" | "normal" | "low";
            dueDate: Date | null;
            listId: string;
            listName: string;
            projectId: string;
            projectName: string;
            spaceId: string;
            spaceName: string;
        }[];
    }>;
    /**
     * View-Reports scoping (Plan §3.3):
     *   • workspace_admin / super_admin → { kind: 'all' } (see everyone).
     *   • manager                       → { kind: 'containers' } scoped to the
     *     spaces & projects they belong to (space_members / project_members),
     *     plus their own rows — i.e. their TEAM only, not the whole workspace.
     *   • everyone else (member/guest)  → { kind: 'user' } (own row only).
     */
    getViewerScope(workspaceId: string, userId: string): Promise<ViewerScope>;
    /**
     * SQL predicate that a task/time row falls inside a manager's team scope: its
     * space or project is one the manager belongs to, OR (fallback) the row is the
     * manager's own (`ownerCol` = their userId) so their contribution is always
     * visible even outside their containers. Returns undefined for non-container
     * viewers, meaning "no extra restriction".
     */
    private containerScopeCondition;
    /**
     * §2 per-item task privacy. Returns a WHERE fragment that hides private tasks
     * the actor may not see (only their creator, an assignee, or a workspace
     * manager/admin/super_admin see them; everyone else sees just public tasks).
     * AND it into any query that reads the unaliased `tasks` table.
     *
     * Returns `undefined` — a no-op inside drizzle's `and()` — for managers and for
     * trusted internal/system callers that pass no actor (the scheduled-report
     * mailer, the project-health cron, and unit tests), so those workspace-wide
     * aggregates are unchanged. Every user-facing controller path threads the
     * caller, so per-item privacy is enforced on every request a real user makes.
     */
    private taskVisibilityFilterForWorkspace;
    getProductivity(workspaceId: string, days?: number, viewer?: ViewerScope, scope?: {
        spaceId?: string;
        projectId?: string;
    }, actor?: {
        id: string;
        role?: string | null;
    }): Promise<{
        userId: string;
        displayName: string;
        email: string;
        avatarUrl: string | null;
        tasksCompleted: number;
        tasksCreated: number;
        totalAssigned: number;
    }[]>;
    /** Completed-tasks trend bucketed by week or month (Plan §9). */
    getProductivityTrend(workspaceId: string, days?: number, bucket?: 'week' | 'month', scope?: {
        spaceId?: string;
        projectId?: string;
    }, actor?: {
        id: string;
        role?: string | null;
    }): Promise<{
        period: string;
        tasksCompleted: number;
    }[]>;
    getCompletionAnalytics(workspaceId: string, days?: number, filter?: {
        spaceId?: string;
        projectId?: string;
        memberId?: string;
    }, actor?: {
        id: string;
        role?: string | null;
    }): Promise<{
        total: number;
        completed: number;
        onTime: number;
        late: number;
        completionRate: number;
        onTimeRate: number;
        trend: {
            date: string;
            count: number;
        }[];
        statusBreakdown: Record<string, number>;
    }>;
    getTimeReport(workspaceId: string, days?: number, viewer?: ViewerScope, actor?: {
        id: string;
        role?: string | null;
    }): Promise<{
        totalHours: number;
        billableHours: number;
        userId: string;
        displayName: string;
        email: string;
        totalSeconds: number;
        billableSeconds: number;
        entryCount: number;
    }[]>;
    /** Billable hours broken down by project (and its client), Plan §9. */
    getTimeByProject(workspaceId: string, days?: number, viewer?: ViewerScope, actor?: {
        id: string;
        role?: string | null;
    }): Promise<{
        totalHours: number;
        billableHours: number;
        projectId: string;
        projectName: string;
        clientId: string | null;
        clientName: string | null;
        totalSeconds: number;
        billableSeconds: number;
        entryCount: number;
    }[]>;
    /**
     * Average time tasks spend in each status (Plan §9 bottleneck view), derived
     * from status_changed activity: a task is "in" meta.to from that event until
     * its next status change (or now if it's still there).
     */
    getStatusDurations(workspaceId: string, days?: number, filter?: {
        spaceId?: string;
        projectId?: string;
        memberId?: string;
    }, actor?: {
        id: string;
        role?: string | null;
    }): Promise<{
        status: string;
        avgHours: number;
        samples: number;
    }[]>;
    getSprintVelocity(workspaceId: string, actor?: {
        id: string;
        role?: string | null;
    }): Promise<{
        sprintId: string;
        name: string;
        startDate: Date;
        endDate: Date;
        status: import("@rundesk/db").SprintStatus;
        taskCount: number;
        plannedPoints: number;
        completedPoints: number;
    }[]>;
    getGoalsProgress(workspaceId: string): Promise<{
        goals: {
            progress: number;
            id: string;
            workspaceId: string;
            spaceId: string | null;
            parentGoalId: string | null;
            ownerId: string | null;
            title: string;
            description: string | null;
            kind: import("@rundesk/db").GoalKind;
            targetValue: number;
            currentValue: number;
            unit: string | null;
            status: import("@rundesk/db").GoalStatus;
            startDate: Date | null;
            dueDate: Date | null;
            completedAt: Date | null;
            createdAt: Date;
            updatedAt: Date;
        }[];
        byStatus: {
            on_track: number;
            at_risk: number;
            off_track: number;
            completed: number;
        };
        avgProgress: number;
        total: number;
    }>;
    getWorkload(workspaceId: string, days?: number, actor?: {
        id: string;
        role?: string | null;
    }): Promise<{
        daysOff: string[];
        dailyCapacities: number[];
        userId: string;
        name: string;
        email: string;
        role: string;
        capacity: number;
        weeklyCapacityHours: number;
        dailyLoads: number[];
        estimatedHours: number;
        trackedHours: number;
        windowCapacityHours: number;
        trackedWindowDays: number;
    }[]>;
    /**
     * Drill-down for a single workload heat-map cell (§5.6): the tasks assigned
     * to `userId` that contribute load on `dateStr` (YYYY-MM-DD). Mirrors the
     * span/estimate maths in getWorkload exactly so the per-task `hours` sum to
     * the cell's displayed load. `days` is the same horizon the heat-map uses so
     * the range clamping matches.
     */
    getWorkloadDay(workspaceId: string, userId: string, dateStr: string, days?: number, actor?: {
        id: string;
        role?: string | null;
    }): Promise<{
        id: string;
        title: string;
        status: string;
        statusCategory: import("@rundesk/db").StatusCategory;
        priority: "urgent" | "high" | "normal" | "low";
        startDate: Date | null;
        dueDate: Date | null;
        hours: number;
        listId: string;
        listName: string;
        projectId: string;
        projectName: string;
        spaceId: string;
        spaceName: string;
    }[]>;
    /**
     * Deterministic per-project health scores 0–100 (§5.7). Transparent weighted
     * formula from real signals — no AI, no randomness:
     *   score = 100 × ( 0.35·onTime + 0.30·notOverdue + 0.15·notBlocked + 0.20·recentActivity )
     *   • onTime         = completed-with-due tasks finished on/before due date
     *                      (1 if some completed but none had due dates; 0.6 neutral if none completed)
     *   • notOverdue     = 1 − (open tasks past due ÷ open tasks)
     *   • notBlocked     = 1 − (open tasks blocked by an incomplete task ÷ open tasks)
     *   • recentActivity = min(1, activity events in last 7d ÷ open tasks)
     * Bands: green ≥ 75, yellow ≥ 50, red < 50; empty projects score 0.
     */
    getProjectHealth(workspaceId: string, actor?: {
        id: string;
        role?: string | null;
    }): Promise<{
        projectId: string;
        name: string;
        color: string | null;
        score: number;
        band: string;
        total: number;
        open: number;
        completed: number;
        overdueOpen: number;
        blockedOpen: number;
        recentActivity: number;
        components: {
            onTime: number;
            overdue: number;
            blockers: number;
            activity: number;
        };
    }[]>;
    /**
     * Workspace-wide recent task activity feed (§9.1). Unlike /notifications
     * (per-user), this returns the latest task_activity events across the whole
     * workspace with actor + task context for linking.
     */
    getWorkspaceActivity(workspaceId: string, limit?: number, actor?: {
        id: string;
        role?: string | null;
    }): Promise<{
        id: string;
        action: "created" | "updated" | "deleted" | "archived" | "restored" | "status_changed" | "priority_changed" | "assigned" | "unassigned" | "commented" | "label_added" | "label_removed" | "due_date_changed" | "dependency_added" | "dependency_removed" | "checklist_item_toggled" | "checklist_item_added" | "attachment_added" | "attachment_removed" | "subtask_added" | "moved" | "merged_in" | "merged_away";
        meta: Record<string, unknown> | null;
        createdAt: Date;
        taskId: string;
        taskTitle: string;
        actorId: string | null;
        actorName: string | null;
        actorAvatarUrl: string | null;
        listId: string;
        listName: string;
        projectId: string;
        projectName: string;
        spaceId: string;
        spaceName: string;
    }[]>;
    runCustomReport(workspaceId: string, def: ReportDefinition, actor?: {
        id: string;
        role?: string | null;
    }): Promise<ReportResult>;
    exportCustomReportCsv(workspaceId: string, def: ReportDefinition, actor?: {
        id: string;
        role?: string | null;
    }): Promise<string>;
    /** Render a custom report to a server-generated PDF (Plan §9). */
    exportCustomReportPdf(workspaceId: string, def: ReportDefinition, actor?: {
        id: string;
        role?: string | null;
    }): Promise<Buffer>;
    listSavedReports(workspaceId: string): Omit<import("drizzle-orm/pg-core").PgSelectBase<"custom_reports", {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "custom_reports";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        workspaceId: import("drizzle-orm/pg-core").PgColumn<{
            name: "workspace_id";
            tableName: "custom_reports";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        name: import("drizzle-orm/pg-core").PgColumn<{
            name: "name";
            tableName: "custom_reports";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        definition: import("drizzle-orm/pg-core").PgColumn<{
            name: "definition";
            tableName: "custom_reports";
            dataType: "json";
            columnType: "PgJsonb";
            data: Record<string, unknown>;
            driverParam: unknown;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: Record<string, unknown>;
        }>;
        createdById: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_by_id";
            tableName: "custom_reports";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        scheduleFrequency: import("drizzle-orm/pg-core").PgColumn<{
            name: "schedule_frequency";
            tableName: "custom_reports";
            dataType: "string";
            columnType: "PgText";
            data: "daily" | "weekly" | "none";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: "daily" | "weekly" | "none";
        }>;
        scheduleHour: import("drizzle-orm/pg-core").PgColumn<{
            name: "schedule_hour";
            tableName: "custom_reports";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        scheduleDayOfWeek: import("drizzle-orm/pg-core").PgColumn<{
            name: "schedule_day_of_week";
            tableName: "custom_reports";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        scheduleRecipients: import("drizzle-orm/pg-core").PgColumn<{
            name: "schedule_recipients";
            tableName: "custom_reports";
            dataType: "json";
            columnType: "PgJsonb";
            data: string[];
            driverParam: unknown;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: string[];
        }>;
        lastSentAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "last_sent_at";
            tableName: "custom_reports";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "custom_reports";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "custom_reports";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    }, "single", Record<"custom_reports", "not-null">, false, "where" | "orderBy", {
        id: string;
        workspaceId: string;
        name: string;
        definition: Record<string, unknown>;
        createdById: string | null;
        scheduleFrequency: "daily" | "weekly" | "none";
        scheduleHour: number;
        scheduleDayOfWeek: number | null;
        scheduleRecipients: string[];
        lastSentAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }[], {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "custom_reports";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        workspaceId: import("drizzle-orm/pg-core").PgColumn<{
            name: "workspace_id";
            tableName: "custom_reports";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        name: import("drizzle-orm/pg-core").PgColumn<{
            name: "name";
            tableName: "custom_reports";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        definition: import("drizzle-orm/pg-core").PgColumn<{
            name: "definition";
            tableName: "custom_reports";
            dataType: "json";
            columnType: "PgJsonb";
            data: Record<string, unknown>;
            driverParam: unknown;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: Record<string, unknown>;
        }>;
        createdById: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_by_id";
            tableName: "custom_reports";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        scheduleFrequency: import("drizzle-orm/pg-core").PgColumn<{
            name: "schedule_frequency";
            tableName: "custom_reports";
            dataType: "string";
            columnType: "PgText";
            data: "daily" | "weekly" | "none";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: "daily" | "weekly" | "none";
        }>;
        scheduleHour: import("drizzle-orm/pg-core").PgColumn<{
            name: "schedule_hour";
            tableName: "custom_reports";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        scheduleDayOfWeek: import("drizzle-orm/pg-core").PgColumn<{
            name: "schedule_day_of_week";
            tableName: "custom_reports";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        scheduleRecipients: import("drizzle-orm/pg-core").PgColumn<{
            name: "schedule_recipients";
            tableName: "custom_reports";
            dataType: "json";
            columnType: "PgJsonb";
            data: string[];
            driverParam: unknown;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: string[];
        }>;
        lastSentAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "last_sent_at";
            tableName: "custom_reports";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "custom_reports";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "custom_reports";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    }>, "where" | "orderBy">;
    createSavedReport(workspaceId: string, userId: string, name: string, definition: ReportDefinition, schedule?: ReportScheduleInput): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        createdById: string | null;
        definition: Record<string, unknown>;
        scheduleFrequency: "daily" | "weekly" | "none";
        scheduleHour: number;
        scheduleDayOfWeek: number | null;
        scheduleRecipients: string[];
        lastSentAt: Date | null;
    }>;
    updateSavedReport(workspaceId: string, id: string, patch: {
        name?: string;
        definition?: ReportDefinition;
        schedule?: ReportScheduleInput;
    }): Promise<{
        id: string;
        workspaceId: string;
        name: string;
        definition: Record<string, unknown>;
        createdById: string | null;
        scheduleFrequency: "daily" | "weekly" | "none";
        scheduleHour: number;
        scheduleDayOfWeek: number | null;
        scheduleRecipients: string[];
        lastSentAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    deleteSavedReport(workspaceId: string, id: string): Promise<{
        ok: boolean;
    }>;
    /** Resolve the reporting window for a contribution report (month or sprint). */
    private resolveContributionPeriod;
    /**
     * Per-member contribution factors over a period (§7.14): tasks completed,
     * on-time rate, collaboration touchpoints (comments/assignments/coordination
     * activity), and blockers resolved — all from real data — plus a composite
     * score and an AI narrative per member (deterministic fallback). `opts.viewer`
     * scopes the report (Plan §3.3): members to their own row, managers to their
     * team (containers), admins to everyone.
     */
    getContribution(workspaceId: string, opts?: {
        period?: ContributionPeriodType;
        sprintId?: string;
        viewer?: ViewerScope;
    }, ctx?: {
        userId?: string;
        role?: string | null;
    }): Promise<{
        period: ContributionPeriod;
        source: 'ai' | 'heuristic';
        members: Array<ContributionFactors & {
            narrative: string;
        }>;
    }>;
    /** Render a contribution report to a server-generated PDF (§7.14). */
    exportContributionPdf(workspaceId: string, opts?: {
        period?: ContributionPeriodType;
        sprintId?: string;
        viewer?: ViewerScope;
    }, ctx?: {
        userId?: string;
        role?: string | null;
    }): Promise<Buffer>;
}
