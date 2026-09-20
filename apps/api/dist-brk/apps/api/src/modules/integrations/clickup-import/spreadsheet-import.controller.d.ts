import { SpreadsheetImportService, type SheetConflictStrategy } from './spreadsheet-import.service';
import type { ColumnMapping, SheetDelimiter } from './spreadsheet-import.util';
/**
 * §V2-S13 frame `12:08` — Create › Imports ›.
 *
 * The generic spreadsheet importer. `GET sources` is the single catalogue the
 * picker draws from, including the four rows of the frame this build does NOT
 * cover and the reason for each, so the UI cannot invent a tile the server
 * cannot serve.
 */
export declare class SpreadsheetImportController {
    private readonly svc;
    constructor(svc: SpreadsheetImportService);
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
    preview(workspaceId: string, body: {
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
        rowErrors: import("./spreadsheet-import.util").RowRejection[];
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
    run(workspaceId: string, user: any, body: {
        content: string;
        delimiter?: SheetDelimiter;
        preset?: string;
        mapping?: ColumnMapping;
        targetSpaceId?: string;
        targetProjectName?: string;
        strategy?: SheetConflictStrategy;
        defaultListName?: string;
    }): Promise<{
        jobId: string;
    }>;
    jobs(workspaceId: string, source?: string, limit?: string): Promise<{
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
    job(workspaceId: string, jobId: string): Promise<{
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
}
