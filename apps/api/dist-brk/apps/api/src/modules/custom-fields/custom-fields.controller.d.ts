import { CustomFieldsService } from './custom-fields.service';
type CustomFieldType = 'text' | 'number' | 'dropdown' | 'date' | 'checkbox' | 'url' | 'email' | 'phone' | 'money' | 'rating';
export declare class CustomFieldsController {
    private readonly svc;
    constructor(svc: CustomFieldsService);
    list(workspaceId: string, projectId: string): Promise<{
        id: string;
        projectId: string;
        listId: string | null;
        name: string;
        type: "number" | "date" | "email" | "labels" | "text" | "url" | "dropdown" | "checkbox" | "phone" | "money" | "rating" | "progress_auto" | "long_text" | "people" | "location" | "tshirt_size" | "progress_manual" | "files" | "voting";
        isRequired: boolean;
        position: number;
        options: {
            label: string;
            value: string;
            color?: string;
        }[] | null;
        config: Record<string, unknown> | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    create(workspaceId: string, projectId: string, body: {
        name: string;
        type: CustomFieldType;
        isRequired?: boolean;
        listId?: string;
        options?: Array<{
            label: string;
            value: string;
            color?: string;
        }>;
        config?: unknown;
    }): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        position: number;
        projectId: string;
        listId: string | null;
        type: "number" | "date" | "email" | "labels" | "text" | "url" | "dropdown" | "checkbox" | "phone" | "money" | "rating" | "progress_auto" | "long_text" | "people" | "location" | "tshirt_size" | "progress_manual" | "files" | "voting";
        config: Record<string, unknown> | null;
        isRequired: boolean;
        options: {
            label: string;
            value: string;
            color?: string;
        }[] | null;
    }>;
    update(workspaceId: string, fieldId: string, body: any): Promise<{
        id: string;
        projectId: string;
        listId: string | null;
        name: string;
        type: "number" | "date" | "email" | "labels" | "text" | "url" | "dropdown" | "checkbox" | "phone" | "money" | "rating" | "progress_auto" | "long_text" | "people" | "location" | "tshirt_size" | "progress_manual" | "files" | "voting";
        isRequired: boolean;
        position: number;
        options: {
            label: string;
            value: string;
            color?: string;
        }[] | null;
        config: Record<string, unknown> | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(workspaceId: string, fieldId: string): Promise<{
        ok: boolean;
    }>;
    getValues(workspaceId: string, taskId: string): Promise<{
        definition: {
            id: string;
            projectId: string;
            listId: string | null;
            name: string;
            type: "number" | "date" | "email" | "labels" | "text" | "url" | "dropdown" | "checkbox" | "phone" | "money" | "rating" | "progress_auto" | "long_text" | "people" | "location" | "tshirt_size" | "progress_manual" | "files" | "voting";
            isRequired: boolean;
            position: number;
            options: {
                label: string;
                value: string;
                color?: string;
            }[] | null;
            config: Record<string, unknown> | null;
            createdAt: Date;
            updatedAt: Date;
        };
        value: string | number | boolean | string[] | null;
    }[]>;
    setValue(user: {
        id: string;
    }, workspaceId: string, taskId: string, fieldId: string, body: {
        value: string | number | boolean | string[] | null;
    }): Promise<{
        id: string;
        updatedAt: Date;
        taskId: string;
        fieldId: string;
        value: {
            v: string | number | boolean | string[] | null;
        };
    }>;
}
export {};
