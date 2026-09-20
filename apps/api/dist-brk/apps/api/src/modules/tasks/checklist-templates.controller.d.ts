import { ChecklistTemplatesService } from './checklist-templates.service';
import type { CurrentUserPayload } from './types';
/**
 * Reusable checklists. Membership is checked inside the service for every
 * route, since these hang off three different parents (workspace, checklist,
 * task) and there is no single resource id a guard could key on.
 */
export declare class ChecklistTemplatesController {
    private templates;
    constructor(templates: ChecklistTemplatesService);
    list(workspaceId: string, user: CurrentUserPayload): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        items: {
            id: string;
            content: string;
            position: number;
        }[];
    }[]>;
    create(workspaceId: string, user: CurrentUserPayload, body: {
        name: string;
        items?: string[];
    }): Promise<{
        id: string;
        name: string;
        itemCount: number;
    }>;
    saveAsTemplate(checklistId: string, user: CurrentUserPayload, body: {
        name?: string;
    }): Promise<{
        id: string;
        name: string;
        itemCount: number;
    }>;
    apply(taskId: string, templateId: string, user: CurrentUserPayload): Promise<{
        id: string;
        title: string;
        itemCount: number;
    }>;
    remove(templateId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
}
