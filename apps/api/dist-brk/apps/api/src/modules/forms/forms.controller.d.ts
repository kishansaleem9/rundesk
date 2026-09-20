import { FormsService } from './forms.service';
import { CreateFormDto, AddFormFieldDto, SubmitFormDto } from './dto/form.dto';
export declare class WorkspaceFormsController {
    private readonly formsService;
    constructor(formsService: FormsService);
    list(workspaceId: string, archived?: string, listId?: string): Promise<{
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
    create(workspaceId: string, user: any, body: CreateFormDto): Promise<{
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
    getOne(formId: string): Promise<{
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
    update(formId: string, body: {
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
    duplicate(formId: string, user: any): Promise<{
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
    archive(formId: string): Promise<{
        ok: boolean;
    }>;
    delete(formId: string): Promise<{
        ok: boolean;
    }>;
    addField(formId: string, body: AddFormFieldDto): Promise<{
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
    updateField(fieldId: string, body: any): Promise<{
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
    reorderFields(formId: string, body: {
        orderedIds: string[];
    }): Promise<{
        ok: boolean;
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
    submissionFile(formId: string, submissionId: string, fieldId: string, user: any): Promise<{
        url: string;
        fileName: string;
    }>;
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
export declare class PublicFormsController {
    private readonly formsService;
    constructor(formsService: FormsService);
    getBySlug(slug: string): Promise<{
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
    submit(slug: string, body: SubmitFormDto): Promise<{
        ok: boolean;
        submissionId: string | null;
        createdTaskId: string | null;
        confirmationMsg: string | null;
    }>;
    presignUpload(slug: string, body: {
        fileName: string;
        contentType: string;
        sizeBytes?: number;
    }): Promise<{
        uploadUrl: string;
        storageKey: string;
        fileName: string;
    }>;
}
