import type { Db } from '@rundesk/db';
type CustomFieldType = 'text' | 'number' | 'dropdown' | 'date' | 'checkbox' | 'url' | 'email' | 'phone' | 'money' | 'rating' | 'progress_auto' | 'long_text' | 'labels' | 'people' | 'location' | 'tshirt_size' | 'progress_manual' | 'files' | 'voting';
/** `string[]` is §V2-01c's: `labels` and `people` hold several at once. */
type FieldValue = string | number | boolean | string[] | null;
/**
 * §V2-01c — T-shirt Size is a FIXED set, not a per-field one.
 *
 * `dropdown` already covers "pick one of the options this field defines". The
 * whole point of a separate type is that everybody's sizes are the same, so
 * they are defined here rather than typed in again on every field.
 */
export declare const TSHIRT_SIZES: readonly ["xs", "s", "m", "l", "xl"];
export declare class CustomFieldsService {
    private db;
    constructor(db: Db);
    private assertProjectInWorkspace;
    private assertTaskInWorkspace;
    listForProject(workspaceId: string, projectId: string): Promise<{
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
    createDefinition(workspaceId: string, projectId: string, dto: {
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
    updateDefinition(workspaceId: string, fieldId: string, patch: {
        name?: string;
        isRequired?: boolean;
        options?: Array<{
            label: string;
            value: string;
            color?: string;
        }>;
        position?: number;
        config?: unknown;
    }): Promise<{
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
    deleteDefinition(workspaceId: string, fieldId: string): Promise<{
        ok: boolean;
    }>;
    private getDefOwnedBy;
    getValuesForTask(workspaceId: string, taskId: string): Promise<{
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
    /**
     * What there is to count on this task, for §V2-01b.
     *
     * The three sources are exactly the three the frame names, and each one's
     * notion of "done" is that source's own: a subtask is done when its status is
     * in the closed category, a checklist item when it is ticked, an assigned
     * comment when it has been resolved. Only comments that were ASSIGNED to
     * somebody count — an ordinary comment is not a piece of work.
     */
    private progressFor;
    /**
     * @param actorId who is writing. Only `voting` uses it, and that is the whole
     *   reason it exists: a vote you can cast on somebody else's behalf is not a
     *   vote. Every other type's value is the same whoever sets it.
     */
    setValue(workspaceId: string, taskId: string, fieldId: string, value: FieldValue, actorId?: string): Promise<{
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
