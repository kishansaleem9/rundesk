import type { Db } from '@rundesk/db';
import { R2Service } from '../../../common/storage/r2.service';
import { type ClickUpClientLike } from './clickup-api.util';
/** How to handle a row that duplicates an existing / already-seen task. */
export type ConflictStrategy = 'skip' | 'create' | 'merge';
export type ImportDto = {
    csv: string;
    targetSpaceId?: string;
    targetProjectName?: string;
    strategy?: ConflictStrategy;
    /**
     * Optional ClickUp personal/OAuth API token. When supplied, the import ALSO
     * pulls each task's comments + attachments (which the CSV cannot carry) via
     * the ClickUp REST API and imports them. Omit it and the CSV-only path runs
     * exactly as before.
     */
    apiToken?: string;
};
/** ClickUp task id → our task id, so the API enrichment can target our rows. */
export type TaskIdMapping = Array<{
    clickupTaskId: string;
    taskId: string;
}>;
/** Per-run report for the optional ClickUp API comment + attachment enrichment. */
export type EnrichmentReport = {
    attempted: boolean;
    tasksEnriched: number;
    commentsImported: number;
    attachmentsImported: number;
    attachmentsSkipped: number;
    r2Configured: boolean;
    /** Set when attachment bytes were skipped wholesale (e.g. R2 not configured). */
    attachmentsSkippedReason?: string;
};
export type ImportSummary = {
    spacesCreated: number;
    projectsCreated: number;
    listsCreated: number;
    tasksCreated: number;
    tasksUpdated: number;
    tasksSkipped: number;
    labelsCreated: number;
    assigneesLinked: number;
    subtasksLinked: number;
    customFieldsCreated: number;
    customFieldValuesSet: number;
    duplicatesDetected: number;
    /** ClickUp-API-only: comments imported (0 unless an apiToken was supplied). */
    commentsImported: number;
    /** ClickUp-API-only: attachments re-uploaded to R2 + rowed. */
    attachmentsImported: number;
    /** ClickUp-API-only: attachments skipped (R2 off, download failed, etc.). */
    attachmentsSkipped: number;
    errors: string[];
    notImported: {
        comments: string;
        attachments: string;
    };
    /** Present only when the API enrichment path ran. */
    enrichment?: EnrichmentReport;
};
export declare class ClickUpImportService {
    private db;
    private r2?;
    constructor(db: Db, r2?: R2Service | undefined);
    /**
     * Parse without writing: row/list counts, a small sample, the detected
     * custom-field columns (name + inferred type), and a duplicate scan against
     * the target scope so the UI can offer a conflict strategy.
     */
    preview(workspaceId: string, dto: {
        csv: string;
        targetSpaceId?: string;
    }): Promise<{
        totalRows: number;
        sample: {
            title: string;
            status: string | undefined;
            priority: string | undefined;
            list: string | undefined;
        }[];
        uniqueLists: string[];
        customFields: {
            name: string;
            type: import("./clickup-csv.util").InferredFieldType;
        }[];
        duplicates: {
            count: number;
            sample: {
                title: string;
                list: string;
                reason: string;
            }[];
        };
        notImported: {
            readonly comments: "ClickUp CSV exports do not include comments. Importing them requires the ClickUp API (a token) — not available from a CSV, so no comments were imported.";
            readonly attachments: "ClickUp CSV exports do not include file attachments. Importing them requires the ClickUp API (a token) — not available from a CSV, so no attachments were imported.";
        };
    }>;
    /**
     * Create a progress row and kick off the import asynchronously. Returns the
     * job id immediately; the client polls `getJob` for a real progress bar.
     */
    startImport(workspaceId: string, userId: string, dto: ImportDto): Promise<{
        jobId: string;
    }>;
    getJob(workspaceId: string, jobId: string): Promise<{
        id: string;
        workspaceId: string;
        source: string;
        sourcePreset: string | null;
        status: string;
        total: number;
        processed: number;
        createdCount: number;
        updatedCount: number;
        skippedCount: number;
        rejectedCount: number;
        rowErrors: {
            row: number;
            code: string;
            message: string;
            column?: string;
            value?: string;
        }[] | null;
        error: string | null;
        result: Record<string, unknown> | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /**
     * The awaitable worker. Parses the CSV, recreates the hierarchy, creates
     * custom-field definitions + values, applies the conflict strategy per row,
     * and streams progress into the job row. Also callable directly (tests /
     * verification) — resolves with the final summary.
     */
    processImport(jobId: string, workspaceId: string, userId: string, dto: ImportDto): Promise<ImportSummary>;
    /**
     * Follow-up path for an already-finished CSV job: import the comments +
     * attachments the CSV omitted, given an API token and a ClickUp→our task-id
     * mapping. Validates each target task belongs to the workspace, runs the same
     * `enrichTasks` core, and folds the result back into the stored job report.
     */
    enrichJob(workspaceId: string, jobId: string, userId: string, input: {
        apiToken: string;
        mapping: TaskIdMapping;
    }): Promise<ImportSummary>;
    /**
     * Import each mapped task's ClickUp comments + attachments. Shared by the
     * in-job token path (via `processImport`) and the follow-up `enrichJob`
     * endpoint. Per-item failures are collected into `summary.errors`, never
     * thrown, so one bad comment/file can't sink the batch.
     */
    enrichTasks(workspaceId: string, userId: string, apiToken: string, mapping: TaskIdMapping, opts?: {
        client?: ClickUpClientLike;
        summary?: ImportSummary;
    }): Promise<ImportSummary>;
    /**
     * Insert one ClickUp comment as a `task_comments` row. When the ClickUp author
     * can't be resolved to a workspace user, we fall back to the importing user
     * for `author_id` (a NOT NULL FK) and preserve the original author + timestamp
     * as text at the head of the body. The original timestamp is also mirrored
     * into `created_at` when ClickUp provided one.
     */
    private importComment;
    /**
     * Stream one ClickUp attachment to R2 and create a `task_attachments` row,
     * reusing the exact task-attachment storage-key convention + R2 upload path.
     * Returns 'skipped' (not an error) when R2 is off or the bytes can't be
     * fetched, so a missing file degrades gracefully.
     */
    private importAttachment;
    /** Subset of `ids` that are tasks inside `workspaceId` (crafted-mapping guard). */
    private loadWorkspaceTaskIds;
    /** A zeroed summary. Comments/attachments stay 0 unless enrichment runs. */
    private emptySummary;
    private updateProgress;
    private loadMemberIndex;
    /** Existing tasks in the target scope, keyed by dupKey(listName, title). */
    private loadExistingTaskIndex;
    private ensureLabel;
    /**
     * Create a custom-field definition per detected column. Returns a map from the
     * (original-case) column name to its definition id, type, and a lowercase →
     * canonical option-value map (so stored dropdown values match an option).
     */
    private createCustomFieldDefinitions;
    private applyAssigneesTagsFields;
    /** Upsert into custom_field_values (task_id, field_id) — the value-write path. */
    private setCustomValue;
    /** Merge = update the existing task's mapped fields from the CSV row. */
    private mergeTask;
}
