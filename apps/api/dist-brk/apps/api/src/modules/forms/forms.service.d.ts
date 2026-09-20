import type { Db } from '@rundesk/db';
import { R2Service } from '../../common/storage/r2.service';
import { WebhooksService } from '../webhooks/webhooks.service';
/** Hard cap on a single form-upload file (public intake). */
export declare const MAX_FORM_UPLOAD_BYTES: number;
export declare class FormsService {
    private db;
    private r2;
    private webhooks;
    constructor(db: Db, r2: R2Service, webhooks: WebhooksService);
    /**
     * Best-effort webhook fan-out (Plan §12.4). Mirrors the webhooks portion of
     * TasksService.fireTaskEvent — non-blocking, failures logged not thrown, so
     * a downed webhook can never break a (public) form submission.
     */
    private fireWebhook;
    private readonly routingMetaKey;
    private readonly maxRoutingHistory;
    private readonly legacyRoutingMetaKey;
    private toSubmissionDataRecord;
    private extractRetryMeta;
    private extractRetryHistory;
    private withRetryMeta;
    private stripInternalDataKeys;
    private createTaskForSubmission;
    private toTaskPriority;
    private normalizeTargetListValue;
    private extractTargetListId;
    private unpackFieldOptions;
    private packFieldOptions;
    private isFieldVisible;
    /**
     * A1.10 / A5.4 — every row carries where its submissions land. A form that
     * feeds a list was invisible from both ends: the card didn't name the list,
     * and the list had no idea a form was filling it. `targetListId` narrows to
     * the forms feeding one list, which is what the list header asks for.
     *
     * A5.2 — the hub also needs the owner, so "My forms" is a filter rather than
     * a guess and the index can name who to ask about a form.
     */
    listForms(workspaceId: string, includeArchived?: boolean, targetListId?: string): Promise<{
        id: string;
        title: string;
        description: string | null;
        slug: string;
        isPublic: boolean;
        isEnabled: boolean;
        isArchived: boolean;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        createdByName: string | null;
        createdByEmail: string | null;
        targetListId: string | null;
        targetListName: string | null;
        targetProjectId: string | null;
        targetSpaceId: string | null;
        submissionCount: number;
    }[]>;
    getForm(formId: string): Promise<{
        fields: {
            options: {
                label: string;
                value: string;
            }[];
            visibilityMode: "all" | "any";
            visibilityRules: {
                fieldId: string;
                operator: "equals" | "not_equals" | "contains" | "not_contains";
                value: string;
            }[];
            id: string;
            formId: string;
            type: string;
            label: string;
            placeholder: string | null;
            helpText: string | null;
            isRequired: boolean;
            position: number;
            taskField: string | null;
            createdAt: Date;
        }[];
        id: string;
        workspaceId: string;
        targetListId: string | null;
        createdById: string | null;
        title: string;
        description: string | null;
        coverImageUrl: string | null;
        isPublic: boolean;
        isEnabled: boolean;
        confirmationMsg: string | null;
        slug: string;
        isArchived: boolean;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getFormBySlug(slug: string): Promise<{
        fields: {
            options: {
                label: string;
                value: string;
            }[];
            visibilityMode: "all" | "any";
            visibilityRules: {
                fieldId: string;
                operator: "equals" | "not_equals" | "contains" | "not_contains";
                value: string;
            }[];
            id: string;
            formId: string;
            type: string;
            label: string;
            placeholder: string | null;
            helpText: string | null;
            isRequired: boolean;
            position: number;
            taskField: string | null;
            createdAt: Date;
        }[];
        id: string;
        slug: string;
        createdAt: Date;
        updatedAt: Date;
        isArchived: boolean;
        workspaceId: string;
        description: string | null;
        createdById: string | null;
        title: string;
        coverImageUrl: string | null;
        isEnabled: boolean;
        targetListId: string | null;
        isPublic: boolean;
        confirmationMsg: string | null;
    }>;
    /**
     * Load a form's fields (options unpacked). No enabled/public gating — used by
     * getFormBySlug after its public checks, and by authenticated callers (routing
     * retry) that already hold an authorized form row.
     */
    private attachFields;
    private sanitizeFileName;
    /** Object-key prefix owning a form's uploaded files. */
    private formUploadPrefix;
    /**
     * Presign a direct-to-R2 upload for a public form file field. Scoped to the
     * form (which must be live + have a file field) and size-capped. No auth —
     * public intake forms accept anonymous submissions by design.
     */
    createUploadUrl(slug: string, body: {
        fileName: string;
        contentType: string;
        sizeBytes?: number;
    }): Promise<{
        uploadUrl: string;
        storageKey: string;
        fileName: string;
    }>;
    /**
     * A short-lived signed download URL for a file a submitter uploaded. Only a
     * member of the form's workspace may resolve it; the stored value must be a
     * key owned by this form (guards against tampered/foreign keys).
     */
    getSubmissionFileUrl(formId: string, submissionId: string, fieldId: string, actorId: string): Promise<{
        url: string;
        fileName: string;
    }>;
    createForm(workspaceId: string, userId: string, dto: {
        title: string;
        description?: string;
        targetListId?: string;
        isPublic?: boolean;
        confirmationMsg?: string;
    }): Promise<{
        id: string;
        slug: string;
        createdAt: Date;
        updatedAt: Date;
        isArchived: boolean;
        workspaceId: string;
        description: string | null;
        createdById: string | null;
        title: string;
        coverImageUrl: string | null;
        isEnabled: boolean;
        targetListId: string | null;
        isPublic: boolean;
        confirmationMsg: string | null;
    }>;
    updateForm(formId: string, patch: {
        title?: string;
        description?: string;
        targetListId?: string | null;
        isPublic?: boolean;
        isEnabled?: boolean;
        confirmationMsg?: string;
        coverImageUrl?: string | null;
    }): Promise<{
        id: string;
        workspaceId: string;
        targetListId: string | null;
        createdById: string | null;
        title: string;
        description: string | null;
        coverImageUrl: string | null;
        isPublic: boolean;
        isEnabled: boolean;
        confirmationMsg: string | null;
        slug: string;
        isArchived: boolean;
        createdAt: Date;
        updatedAt: Date;
    }>;
    archiveForm(formId: string): Promise<{
        ok: boolean;
    }>;
    deleteForm(formId: string): Promise<{
        ok: boolean;
    }>;
    duplicateForm(formId: string, userId: string): Promise<{
        fields: {
            options: {
                label: string;
                value: string;
            }[];
            visibilityMode: "all" | "any";
            visibilityRules: {
                fieldId: string;
                operator: "equals" | "not_equals" | "contains" | "not_contains";
                value: string;
            }[];
            id: string;
            formId: string;
            type: string;
            label: string;
            placeholder: string | null;
            helpText: string | null;
            isRequired: boolean;
            position: number;
            taskField: string | null;
            createdAt: Date;
        }[];
        id: string;
        workspaceId: string;
        targetListId: string | null;
        createdById: string | null;
        title: string;
        description: string | null;
        coverImageUrl: string | null;
        isPublic: boolean;
        isEnabled: boolean;
        confirmationMsg: string | null;
        slug: string;
        isArchived: boolean;
        createdAt: Date;
        updatedAt: Date;
    }>;
    addField(formId: string, dto: {
        type: string;
        label: string;
        placeholder?: string;
        helpText?: string;
        isRequired?: boolean;
        position?: number;
        options?: {
            label: string;
            value: string;
        }[];
        visibilityMode?: 'all' | 'any';
        visibilityRules?: Array<{
            fieldId: string;
            operator: 'equals' | 'not_equals' | 'contains' | 'not_contains';
            value: string;
        }>;
        taskField?: string;
    }): Promise<{
        options: {
            label: string;
            value: string;
        }[];
        visibilityMode: "all" | "any";
        visibilityRules: {
            fieldId: string;
            operator: "equals" | "not_equals" | "contains" | "not_contains";
            value: string;
        }[];
        id: string;
        createdAt: Date;
        position: number;
        label: string;
        type: string;
        formId: string;
        placeholder: string | null;
        helpText: string | null;
        isRequired: boolean;
        taskField: string | null;
    }>;
    updateField(fieldId: string, patch: Partial<{
        type: string;
        label: string;
        placeholder: string | null;
        helpText: string | null;
        isRequired: boolean;
        position: number;
        options: {
            label: string;
            value: string;
        }[];
        visibilityMode: 'all' | 'any';
        visibilityRules: Array<{
            fieldId: string;
            operator: 'equals' | 'not_equals' | 'contains' | 'not_contains';
            value: string;
        }>;
        taskField: string | null;
    }>): Promise<{
        options: {
            label: string;
            value: string;
        }[];
        visibilityMode: "all" | "any";
        visibilityRules: {
            fieldId: string;
            operator: "equals" | "not_equals" | "contains" | "not_contains";
            value: string;
        }[];
        id: string;
        formId: string;
        type: string;
        label: string;
        placeholder: string | null;
        helpText: string | null;
        isRequired: boolean;
        position: number;
        taskField: string | null;
        createdAt: Date;
    }>;
    deleteField(fieldId: string): Promise<{
        ok: boolean;
    }>;
    reorderFields(formId: string, orderedIds: string[]): Promise<{
        ok: boolean;
    }>;
    /**
     * A5.5 — `honeypot` is a field no human ever sees (the public renderer hides
     * it and never focuses it); a bot that fills every input trips it. The reply
     * is the ordinary confirmation so the scraper learns nothing, but nothing is
     * written and no task is routed. Volume abuse is handled separately by the
     * per-IP rate limit on the public controller.
     */
    submitForm(slug: string, data: Record<string, string | string[]>, submitterEmail?: string, submitterName?: string, honeypot?: string): Promise<{
        ok: boolean;
        submissionId: string | null;
        createdTaskId: string | null;
        confirmationMsg: string | null;
    }>;
    listSubmissions(formId: string): Promise<{
        retryMeta: {
            status: "ok" | "error";
            message: string;
            at: string;
        } | undefined;
        retryHistory: {
            status: "ok" | "error";
            message: string;
            at: string;
        }[];
        data: Record<string, string | string[]>;
        id: string;
        formId: string;
        createdTaskId: string | null;
        submitterEmail: string | null;
        submitterName: string | null;
        submittedAt: Date;
    }[]>;
    retrySubmissionRouting(formId: string, submissionId: string): Promise<{
        ok: boolean;
        submissionId: string;
        createdTaskId: string;
    }>;
    clearSubmissionRetryHistory(formId: string, submissionId: string): Promise<{
        ok: boolean;
        submissionId: string;
    }>;
}
