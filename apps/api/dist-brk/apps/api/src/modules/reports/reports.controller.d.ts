import { StreamableFile } from '@nestjs/common';
import { ReportsService, type ReportDefinition, type ReportScheduleInput } from './reports.service';
import { ScheduledReportsService } from './scheduled-reports.service';
import { ProjectHealthService } from './project-health.service';
export declare class ReportsController {
    private readonly reports;
    private readonly scheduledReports;
    private readonly projectHealthSvc;
    constructor(reports: ReportsService, scheduledReports: ScheduledReportsService, projectHealthSvc: ProjectHealthService);
    overview(workspaceId: string, user: {
        id: string;
        role?: string;
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
    productivity(workspaceId: string, user: {
        id: string;
        role?: string;
    }, days?: string, spaceId?: string, projectId?: string): Promise<{
        userId: string;
        displayName: string;
        email: string;
        avatarUrl: string | null;
        tasksCompleted: number;
        tasksCreated: number;
        totalAssigned: number;
    }[]>;
    productivityTrend(workspaceId: string, user: {
        id: string;
        role?: string;
    }, days?: string, bucket?: string, spaceId?: string, projectId?: string): Promise<{
        period: string;
        tasksCompleted: number;
    }[]>;
    completion(workspaceId: string, user: {
        id: string;
        role?: string;
    }, days?: string, spaceId?: string, projectId?: string, memberId?: string): Promise<{
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
    statusDurations(workspaceId: string, user: {
        id: string;
        role?: string;
    }, days?: string, spaceId?: string, projectId?: string, memberId?: string): Promise<{
        status: string;
        avgHours: number;
        samples: number;
    }[]>;
    time(workspaceId: string, user: {
        id: string;
        role?: string;
    }, days?: string): Promise<{
        totalHours: number;
        billableHours: number;
        userId: string;
        displayName: string;
        email: string;
        totalSeconds: number;
        billableSeconds: number;
        entryCount: number;
    }[]>;
    timeByProject(workspaceId: string, user: {
        id: string;
        role?: string;
    }, days?: string): Promise<{
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
    sprints(workspaceId: string, user: {
        id: string;
        role?: string;
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
    goals(workspaceId: string): Promise<{
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
    workload(workspaceId: string, user: {
        id: string;
        role?: string;
    }, days?: string): Promise<{
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
    workloadDay(workspaceId: string, user: {
        id: string;
        role?: string;
    }, userId: string, date: string, days?: string): Promise<{
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
    projectHealth(workspaceId: string, user: {
        id: string;
        role?: string;
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
    projectHealthTrend(workspaceId: string, projectId: string, days?: string): Promise<{
        projectId: string;
        days: number;
        current: {
            score: number;
            band: string;
            sentiment: {
                score: number;
                label: "positive" | "neutral" | "negative";
                positive: number;
                negative: number;
                samples: number;
                source: "ai" | "deterministic";
            };
        } | null;
        points: {
            date: string;
            score: number;
            band: string;
        }[];
    }>;
    activity(workspaceId: string, user: {
        id: string;
        role?: string;
    }, limit?: string): Promise<{
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
    private parsePeriod;
    contribution(workspaceId: string, user: {
        id: string;
        role?: string;
    }, period?: string, sprintId?: string): Promise<{
        period: import("./reports.service").ContributionPeriod;
        source: "ai" | "heuristic";
        members: Array<import("./reports.service").ContributionFactors & {
            narrative: string;
        }>;
    }>;
    contributionPdf(workspaceId: string, user: {
        id: string;
        role?: string;
    }, body: {
        period?: string;
        sprintId?: string;
    }): Promise<StreamableFile>;
    runCustom(workspaceId: string, user: {
        id: string;
        role?: string;
    }, body: ReportDefinition): Promise<import("./reports.service").ReportResult>;
    exportCustom(workspaceId: string, user: {
        id: string;
        role?: string;
    }, body: ReportDefinition): Promise<string>;
    exportCustomPdf(workspaceId: string, user: {
        id: string;
        role?: string;
    }, body: ReportDefinition): Promise<StreamableFile>;
    listSaved(workspaceId: string): Omit<import("drizzle-orm/pg-core").PgSelectBase<"custom_reports", {
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
    createSaved(workspaceId: string, user: {
        id: string;
    }, body: {
        name: string;
        definition: ReportDefinition;
        schedule?: ReportScheduleInput;
    }): Promise<{
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
    updateSaved(workspaceId: string, reportId: string, body: {
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
    sendNow(workspaceId: string, reportId: string): Promise<{
        ok: boolean;
        recipients: string[];
    }>;
    deleteSaved(workspaceId: string, reportId: string): Promise<{
        ok: boolean;
    }>;
}
