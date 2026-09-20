import { type OnModuleInit } from '@nestjs/common';
import { projectTemplates, type TemplateTargetType, type TemplateComplexity, type TemplateCategory, type TemplateUseCase } from '@rundesk/db';
import type { Db } from '@rundesk/db';
import { SpacesService } from '../spaces/spaces.service';
type TemplatePayload = NonNullable<typeof projectTemplates.$inferSelect.payload>;
/** One row of a facet rail: the value, and how many templates carry it. */
export type FacetBucket<T extends string = string> = {
    value: T;
    count: number;
};
export type TemplateFacets = {
    scope: FacetBucket<'all' | 'builtin' | 'custom'>[];
    type: FacetBucket<TemplateTargetType>[];
    complexity: FacetBucket<TemplateComplexity>[];
    category: FacetBucket<TemplateCategory | 'other'>[];
    useCase: FacetBucket<TemplateUseCase | 'other'>[];
};
/**
 * How hard a template is to pick up, read off the thing itself rather than
 * asked of whoever saved it. A person saving a project as a template has no
 * idea whether their 40 tasks count as "advanced", and a dropdown they guess
 * at is a column nobody can trust to filter on.
 */
export declare function complexityOf(payload: TemplatePayload): TemplateComplexity;
export declare class ProjectTemplatesService implements OnModuleInit {
    private db;
    private readonly spacesService;
    private readonly logger;
    constructor(db: Db, spacesService: SpacesService);
    onModuleInit(): Promise<void>;
    /**
     * Insert any missing platform-wide built-in templates (idempotent by name)
     * AND reconcile the facet metadata of the ones already there.
     *
     * The reconcile half exists because migration 0151 added four columns with
     * defaults, and a built-in seeded before it would sit at
     * folder / beginner / no category forever. That is the mirror of a facade: a
     * row in Postgres that says "beginner" because nobody wrote anything else,
     * filtered on as though somebody had.
     */
    ensureBuiltIns(): Promise<{
        inserted: number;
        reconciled: number;
    }>;
    /** List both built-in templates and the workspace's own saved templates. */
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
     * The whole point of this living on the server: `templates` is the narrowed
     * page, `facets` is counted over the corpus. A browser cannot compute the
     * second from the first — it would be counting the array it was handed,
     * which is right about the page and silent about everything the page did not
     * load. That is the "confident zero" shape exactly.
     *
     * WHAT THE COUNTS MEAN, stated because a facet count that means something
     * different from what the reader assumes is worse than none: each bucket is
     * counted over the corpus narrowed by the SEARCH and the SCOPE only, never by
     * the facet selections. So the number beside "Beginner" answers "how many
     * would I get if Beginner were the only thing I picked" — it does not move
     * when you tick Advanced, and a ticked box never hides its own siblings'
     * counts.
     */
    browse(workspaceId: string, params?: {
        q?: string;
        scope?: string;
        type?: string | string[];
        complexity?: string | string[];
        category?: string;
        useCase?: string;
    }): Promise<{
        templates: Array<typeof projectTemplates.$inferSelect>;
        total: number;
        facets: TemplateFacets;
    }>;
    getOne(workspaceId: string, id: string): Promise<{
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
    /**
     * Snapshot an existing project (with its lists and tasks) into a named
     * template owned by this workspace.
     */
    saveFromProject(workspaceId: string, userId: string, dto: {
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
    /** Manually create a template from an inline payload (for built-ins or quick create). */
    create(workspaceId: string, userId: string, dto: {
        name: string;
        description?: string;
        icon?: string;
        payload: TemplatePayload;
        targetType?: string;
        complexity?: string;
        category?: string;
        useCase?: string;
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
    delete(workspaceId: string, id: string): Promise<{
        ok: boolean;
    }>;
    /**
     * Materialize a template. WHAT gets made is the template's own
     * `targetType` — which is what stops the frame's Template Types facet being
     * a label on a card:
     *
     *   · `space`  — a new space in this workspace (through the spaces service,
     *                so it gets the same creator membership a hand-made one
     *                does), holding one project with the template's lists.
     *   · `folder` — a new project under `targetSpaceId`. The original
     *                behaviour, and still the default.
     *   · `list`   — the template's single list, dropped into a project you
     *                already have (`targetProjectId`).
     *
     * The return shape is unchanged for every existing caller: `project`,
     * `listsCreated`, `tasksCreated`. `space` is added, and is null unless one
     * was made.
     */
    apply(workspaceId: string, userId: string, dto: {
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
}
export {};
