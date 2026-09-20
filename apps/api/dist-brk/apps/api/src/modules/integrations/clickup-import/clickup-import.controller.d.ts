import { ClickUpImportService, type ConflictStrategy } from './clickup-import.service';
export declare class ClickUpImportController {
    private readonly svc;
    constructor(svc: ClickUpImportService);
    preview(workspaceId: string, body: {
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
    run(workspaceId: string, user: any, body: {
        csv: string;
        targetSpaceId?: string;
        targetProjectName?: string;
        strategy?: ConflictStrategy;
        /** Optional: also pull comments + attachments the CSV cannot carry. */
        apiToken?: string;
    }): Promise<{
        jobId: string;
    }>;
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
    enrich(workspaceId: string, jobId: string, user: any, body: {
        apiToken: string;
        mapping?: Array<{
            clickupTaskId: string;
            taskId: string;
        }>;
    }): Promise<import("./clickup-import.service").ImportSummary>;
}
