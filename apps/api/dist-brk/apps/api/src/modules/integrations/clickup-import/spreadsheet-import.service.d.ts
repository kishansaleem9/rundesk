/**
 * §V2-S13 frame `12:08` — the generic **Spreadsheet files** importer.
 *
 * One parser, one writer, and per-source column presets on top (see
 * `spreadsheet-import.util.ts`). The presets are why several of the frame's
 * named tools are genuinely covered without ten half-built code paths: Asana,
 * Jira Software, Monday, Notion, Todoist, Trello and Wrike all export a
 * task-shaped delimited file, and a mapping over one real importer is a real
 * importer for each of them.
 *
 * Three things this does that the ClickUp path does not, each of which was a
 * live defect there:
 *
 *  1. **Seeds the list's status pipeline.** `db.insert(lists)` does not; only
 *     `ListsService.createList` seeds `list_statuses`. A list imported without
 *     one has no columns to group by, so Board view renders nothing.
 *  2. **Sets `lists.space_id`.** Left null by the ClickUp path, so every
 *     "which space is this list in?" read has to join back through the project.
 *  3. **Stamps `tasks.status_category`.** Every rollup, the Closed toggle and
 *     the progress ring read that column and not `status`; an imported "Done"
 *     task with the default `open` category counts as open everywhere — a
 *     confident zero with a database row behind it.
 *
 * REJECTED ROWS ARE NEVER WRITTEN, and each one is reported by file line
 * number with the reason and the offending column.
 */
import type { Db } from '@rundesk/db';
import { type ColumnMapping, type RowRejection, type SheetDelimiter } from './spreadsheet-import.util';
export type SheetConflictStrategy = 'skip' | 'create' | 'merge';
/** `source` values written to `clickup_import_jobs.source`. */
export declare const SHEET_SOURCE = "spreadsheet";
export declare const CLICKUP_SOURCE = "clickup_csv";
export type SheetImportDto = {
    content: string;
    delimiter?: SheetDelimiter;
    preset?: string;
    /** Explicit header → field mapping. Omitted → the preset's auto-mapping. */
    mapping?: ColumnMapping;
    targetSpaceId?: string;
    targetProjectName?: string;
    strategy?: SheetConflictStrategy;
    /** List name for rows whose file has no list/section column. */
    defaultListName?: string;
};
export type SheetImportSummary = {
    source: string;
    sourcePreset: string;
    spacesCreated: number;
    projectsCreated: number;
    listsCreated: number;
    tasksCreated: number;
    tasksUpdated: number;
    tasksSkipped: number;
    /** Rows the importer refused. Distinct from `tasksSkipped` (a duplicate). */
    tasksRejected: number;
    labelsCreated: number;
    assigneesLinked: number;
    /** Names in the file that match nobody in the workspace — said, not hidden. */
    assigneesUnmatched: number;
    duplicatesDetected: number;
    rowErrors: RowRejection[];
    rowErrorsTruncated: boolean;
    errors: string[];
};
export declare class SpreadsheetImportService {
    private db;
    constructor(db: Db);
    /** The picker's catalogue — served so the UI cannot drift from the parser. */
    sources(): {
        sources: {
            key: string;
            label: string;
            exportHint: string;
            columns: number;
        }[];
        unsupported: {
            key: string;
            label: string;
            reason: string;
        }[];
        acceptedExtensions: string[];
    };
    /**
     * Parse without writing. Returns the headers, the delimiter it found, the
     * starting mapping for the chosen preset, a small sample of what the rows
     * would become, and — importantly — the rows that WOULD be rejected, so the
     * refusals are visible before anything is created.
     */
    previewSheet(workspaceId: string, dto: {
        content: string;
        delimiter?: SheetDelimiter;
        preset?: string;
        mapping?: ColumnMapping;
        defaultListName?: string;
    }): Promise<{
        preset: string;
        presetLabel: string;
        delimiter: SheetDelimiter;
        headers: string[];
        mapping: ColumnMapping;
        mappingError: string | null;
        totalRows: number;
        importableRows: number;
        rejectedRows: number;
        rowErrors: RowRejection[];
        uniqueLists: string[];
        duplicates: number;
        sample: {
            row: number;
            title: string;
            status: import("./clickup-csv.util").TaskStatus;
            priority: import("./clickup-csv.util").TaskPriority;
            list: string;
            dueDate: string | null;
            assignees: string[];
            tags: string[];
        }[];
    }>;
    startSheetImport(workspaceId: string, userId: string, dto: SheetImportDto): Promise<{
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
     * The import history. THE READER OF `source`: without the filter this would
     * mix the ClickUp runs into the spreadsheet importer's history and the column
     * would be a stored value nobody honours.
     */
    listJobs(workspaceId: string, opts?: {
        source?: string;
        limit?: number;
    }): Promise<{
        id: string;
        source: string;
        sourcePreset: string | null;
        status: string;
        total: number;
        processed: number;
        createdCount: number;
        updatedCount: number;
        skippedCount: number;
        rejectedCount: number;
        createdAt: Date;
    }[]>;
    /**
     * Awaitable so tests and verification can run it directly and read the
     * summary rather than poll. Streams progress into the job row as it goes.
     */
    processSheetImport(jobId: string, workspaceId: string, userId: string, dto: SheetImportDto): Promise<SheetImportSummary>;
    /** An explicit mapping wins; otherwise the preset's auto-mapping. */
    private resolveMapping;
    /**
     * Create a list AND its default status pipeline, the way `ListsService` does
     * — `db.insert(lists)` alone leaves a list with no statuses to group by.
     * `space_id` is set here too; the ClickUp path leaves it null.
     */
    private createList;
    private applyPeopleAndTags;
    private ensureLabel;
    private loadMemberIndex;
    private loadExistingTaskIndex;
    private updateProgress;
    private emptySummary;
}
