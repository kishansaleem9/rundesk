import type { Db } from '@rundesk/db';
/**
 * Reusable checklists a task can be seeded from — the client's "main template
 * se bhi checklist kar sakti hoon".
 *
 * Applying copies rows rather than pointing at the template, so editing a
 * template later never rewrites checklists already made from it.
 */
export declare class ChecklistTemplatesService {
    private db;
    constructor(db: Db);
    /** The workspace a task belongs to, walking list → project → space. */
    private workspaceOfTask;
    private assertMember;
    /** Templates available in a workspace, newest first, with their items. */
    list(workspaceId: string, userId: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        items: {
            id: string;
            content: string;
            position: number;
        }[];
    }[]>;
    create(workspaceId: string, userId: string, input: {
        name: string;
        items?: string[];
    }): Promise<{
        id: string;
        name: string;
        itemCount: number;
    }>;
    /**
     * Save an existing checklist as a template, so a list someone already built
     * by hand can be reused instead of retyped.
     */
    createFromChecklist(checklistId: string, userId: string, name?: string): Promise<{
        id: string;
        name: string;
        itemCount: number;
    }>;
    /**
     * Drop a template onto a task as a fresh checklist. Items are copied, and
     * they start unchecked and unassigned — a template describes the work, not
     * who did it last time.
     */
    applyToTask(taskId: string, templateId: string, userId: string): Promise<{
        id: string;
        title: string;
        itemCount: number;
    }>;
    remove(templateId: string, userId: string): Promise<{
        ok: boolean;
    }>;
}
