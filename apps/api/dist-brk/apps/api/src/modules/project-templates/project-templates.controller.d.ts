import { ProjectTemplatesService } from './project-templates.service';
export declare class ProjectTemplatesController {
    private readonly svc;
    constructor(svc: ProjectTemplatesService);
    list(workspaceId: string): Promise<{
        id: string;
        workspaceId: string | null;
        name: string;
        description: string | null;
        icon: string | null;
        payload: {
            lists: Array<{
                name: string;
                position?: number;
                tasks: Array<{
                    title: string;
                    description?: string | null;
                    priority?: "urgent" | "high" | "normal" | "low";
                    status?: "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled";
                }>;
            }>;
        };
        isBuiltIn: boolean;
        targetType: "list" | "space" | "folder";
        complexity: "beginner" | "intermediate" | "advanced";
        category: "engineering" | "marketing" | "operations" | "product" | null;
        useCase: "planning" | "launch" | "onboarding" | "support" | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    /**
     * §V2-13 / frame `12:14` — the Template Center's faceted browse.
     *
     * A separate route rather than query params bolted onto `GET /`, because the
     * shape is different: `{ templates, total, facets }` instead of an array.
     * `GET /` keeps its contract for everything that already reads it.
     *
     * Declared BEFORE `:templateId`, or Nest matches "browse" as a template id
     * and this route is never reached.
     */
    browse(workspaceId: string, q?: string, scope?: string, type?: string, complexity?: string, category?: string, useCase?: string): Promise<{
        templates: Array<{
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            workspaceId: string | null;
            description: string | null;
            icon: string | null;
            createdById: string | null;
            payload: {
                lists: Array<{
                    name: string;
                    position?: number;
                    tasks: Array<{
                        title: string;
                        description?: string | null;
                        priority?: "urgent" | "high" | "normal" | "low";
                        status?: "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled";
                    }>;
                }>;
            };
            isBuiltIn: boolean;
            targetType: "list" | "space" | "folder";
            complexity: "beginner" | "intermediate" | "advanced";
            category: "engineering" | "marketing" | "operations" | "product" | null;
            useCase: "planning" | "launch" | "onboarding" | "support" | null;
        }>;
        total: number;
        facets: import("./project-templates.service").TemplateFacets;
    }>;
    getOne(workspaceId: string, templateId: string): Promise<{
        id: string;
        workspaceId: string | null;
        name: string;
        description: string | null;
        icon: string | null;
        payload: {
            lists: Array<{
                name: string;
                position?: number;
                tasks: Array<{
                    title: string;
                    description?: string | null;
                    priority?: "urgent" | "high" | "normal" | "low";
                    status?: "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled";
                }>;
            }>;
        };
        isBuiltIn: boolean;
        targetType: "list" | "space" | "folder";
        complexity: "beginner" | "intermediate" | "advanced";
        category: "engineering" | "marketing" | "operations" | "product" | null;
        useCase: "planning" | "launch" | "onboarding" | "support" | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    saveFromProject(workspaceId: string, user: any, body: {
        projectId: string;
        name: string;
        description?: string;
        icon?: string;
        category?: string;
        useCase?: string;
        targetType?: string;
    }): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string | null;
        description: string | null;
        icon: string | null;
        createdById: string | null;
        payload: {
            lists: Array<{
                name: string;
                position?: number;
                tasks: Array<{
                    title: string;
                    description?: string | null;
                    priority?: "urgent" | "high" | "normal" | "low";
                    status?: "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled";
                }>;
            }>;
        };
        isBuiltIn: boolean;
        targetType: "list" | "space" | "folder";
        complexity: "beginner" | "intermediate" | "advanced";
        category: "engineering" | "marketing" | "operations" | "product" | null;
        useCase: "planning" | "launch" | "onboarding" | "support" | null;
    }>;
    create(workspaceId: string, user: any, body: any): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string | null;
        description: string | null;
        icon: string | null;
        createdById: string | null;
        payload: {
            lists: Array<{
                name: string;
                position?: number;
                tasks: Array<{
                    title: string;
                    description?: string | null;
                    priority?: "urgent" | "high" | "normal" | "low";
                    status?: "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled";
                }>;
            }>;
        };
        isBuiltIn: boolean;
        targetType: "list" | "space" | "folder";
        complexity: "beginner" | "intermediate" | "advanced";
        category: "engineering" | "marketing" | "operations" | "product" | null;
        useCase: "planning" | "launch" | "onboarding" | "support" | null;
    }>;
    apply(workspaceId: string, user: any, body: {
        templateId: string;
        targetSpaceId?: string;
        targetProjectId?: string;
        projectName?: string;
    }): Promise<{
        project: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            isArchived: boolean;
            description: string | null;
            color: string | null;
            icon: string | null;
            createdById: string | null;
            archivedAt: Date | null;
            archivedById: string | null;
            visibility: "public" | "private" | null;
            spaceId: string;
            folderId: string | null;
            clientId: string | null;
            position: number;
            defaultBillable: boolean;
            isDefaultContainer: boolean;
        };
        space: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            isArchived: boolean;
            workspaceId: string;
            description: string | null;
            color: string | null;
            icon: string | null;
            createdById: string | null;
            archivedAt: Date | null;
            archivedById: string | null;
            visibility: "public" | "private";
            viewConfig: {
                defaultView?: string;
                enabledViews?: string[];
            } | null;
            defaultPermission: import("@rundesk/db").SpaceDefaultPermission;
            features: Record<string, boolean> | null;
            presetKey: string | null;
        } | null;
        targetType: "list" | "space" | "folder";
        listsCreated: number;
        tasksCreated: number;
    }>;
    remove(workspaceId: string, templateId: string): Promise<{
        ok: boolean;
    }>;
}
