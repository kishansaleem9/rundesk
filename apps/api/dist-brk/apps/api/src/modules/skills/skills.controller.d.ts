import { SkillsService } from './skills.service';
import { AddSkillConnectionDto, AddSkillMemoryDto, ApproveSkillProposalDto, CreateSkillDto, UpdateSkillDto } from './dto/skill.dto';
import type { CurrentUserPayload } from '../tasks/types';
/**
 * §15 Skills.
 *
 * Every route carries `:workspaceId` and `WorkspaceMemberGuard`, including the
 * ones addressing a single skill by id. Hanging the detail routes off a bare
 * `/skills/:id` would have been shorter and would have skipped the membership
 * check entirely — the service's own visibility filter would then be the only
 * thing standing between a stranger and a workspace's skills, which is one
 * mistake away from nothing at all.
 */
export declare class SkillsController {
    private svc;
    constructor(svc: SkillsService);
    templates(): readonly import("./skill-templates").SkillTemplate[];
    list(workspaceId: string, user: CurrentUserPayload, tab?: string): Omit<import("drizzle-orm/pg-core").PgSelectBase<"skills", {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "skills";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        workspaceId: import("drizzle-orm/pg-core").PgColumn<{
            name: "workspace_id";
            tableName: "skills";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        createdById: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_by_id";
            tableName: "skills";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        name: import("drizzle-orm/pg-core").PgColumn<{
            name: "name";
            tableName: "skills";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        description: import("drizzle-orm/pg-core").PgColumn<{
            name: "description";
            tableName: "skills";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        instructions: import("drizzle-orm/pg-core").PgColumn<{
            name: "instructions";
            tableName: "skills";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        archetype: import("drizzle-orm/pg-core").PgColumn<{
            name: "archetype";
            tableName: "skills";
            dataType: "string";
            columnType: "PgText";
            data: "scratch" | "delegate_like_me" | "brand_voice" | "triage_like_me";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: "scratch" | "delegate_like_me" | "brand_voice" | "triage_like_me";
        }>;
        visibility: import("drizzle-orm/pg-core").PgColumn<{
            name: "visibility";
            tableName: "skills";
            dataType: "string";
            columnType: "PgText";
            data: "workspace" | "private";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: "workspace" | "private";
        }>;
        enabled: import("drizzle-orm/pg-core").PgColumn<{
            name: "enabled";
            tableName: "skills";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "skills";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "skills";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    }, "single", Record<"skills", "not-null">, false, "where" | "orderBy", {
        id: string;
        workspaceId: string;
        createdById: string;
        name: string;
        description: string | null;
        instructions: string;
        archetype: "scratch" | "delegate_like_me" | "brand_voice" | "triage_like_me";
        visibility: "workspace" | "private";
        enabled: boolean;
        createdAt: Date;
        updatedAt: Date;
    }[], {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "skills";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        workspaceId: import("drizzle-orm/pg-core").PgColumn<{
            name: "workspace_id";
            tableName: "skills";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        createdById: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_by_id";
            tableName: "skills";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        name: import("drizzle-orm/pg-core").PgColumn<{
            name: "name";
            tableName: "skills";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        description: import("drizzle-orm/pg-core").PgColumn<{
            name: "description";
            tableName: "skills";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        instructions: import("drizzle-orm/pg-core").PgColumn<{
            name: "instructions";
            tableName: "skills";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        archetype: import("drizzle-orm/pg-core").PgColumn<{
            name: "archetype";
            tableName: "skills";
            dataType: "string";
            columnType: "PgText";
            data: "scratch" | "delegate_like_me" | "brand_voice" | "triage_like_me";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: "scratch" | "delegate_like_me" | "brand_voice" | "triage_like_me";
        }>;
        visibility: import("drizzle-orm/pg-core").PgColumn<{
            name: "visibility";
            tableName: "skills";
            dataType: "string";
            columnType: "PgText";
            data: "workspace" | "private";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: "workspace" | "private";
        }>;
        enabled: import("drizzle-orm/pg-core").PgColumn<{
            name: "enabled";
            tableName: "skills";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "skills";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "skills";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    }>, "where" | "orderBy">;
    counts(workspaceId: string, user: CurrentUserPayload): Promise<{
        all: number;
        enabled: number;
        mine: number;
    }>;
    create(workspaceId: string, user: CurrentUserPayload, body: CreateSkillDto): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        enabled: boolean;
        description: string | null;
        createdById: string;
        visibility: "workspace" | "private";
        instructions: string;
        archetype: "scratch" | "delegate_like_me" | "brand_voice" | "triage_like_me";
    }>;
    createFromProposal(workspaceId: string, user: CurrentUserPayload, body: ApproveSkillProposalDto): Promise<{
        memoriesCreated: number;
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        enabled: boolean;
        description: string | null;
        createdById: string;
        visibility: "workspace" | "private";
        instructions: string;
        archetype: "scratch" | "delegate_like_me" | "brand_voice" | "triage_like_me";
    }>;
    discover(workspaceId: string, user: CurrentUserPayload): Promise<{
        id: string;
        name: string;
        description: string | null;
        archetype: "scratch" | "delegate_like_me" | "brand_voice" | "triage_like_me";
        createdById: string;
        authorName: string | null;
        installs: number;
    }[]>;
    installed(workspaceId: string, user: CurrentUserPayload): Promise<string[]>;
    install(workspaceId: string, id: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
        installed: boolean;
    }>;
    uninstall(workspaceId: string, id: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
        installed: boolean;
    }>;
    get(workspaceId: string, id: string, user: CurrentUserPayload): Promise<{
        id: string;
        workspaceId: string;
        createdById: string;
        name: string;
        description: string | null;
        instructions: string;
        archetype: "scratch" | "delegate_like_me" | "brand_voice" | "triage_like_me";
        visibility: "workspace" | "private";
        enabled: boolean;
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(workspaceId: string, id: string, user: CurrentUserPayload, body: UpdateSkillDto): Promise<{
        id: string;
        workspaceId: string;
        createdById: string;
        name: string;
        description: string | null;
        instructions: string;
        archetype: "scratch" | "delegate_like_me" | "brand_voice" | "triage_like_me";
        visibility: "workspace" | "private";
        enabled: boolean;
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(workspaceId: string, id: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    listMemories(workspaceId: string, id: string, user: CurrentUserPayload): Promise<{
        id: string;
        skillId: string;
        workspaceId: string;
        authorId: string | null;
        content: string;
        source: "manual" | "chat";
        createdAt: Date;
    }[]>;
    addMemory(workspaceId: string, id: string, user: CurrentUserPayload, body: AddSkillMemoryDto): Promise<{
        id: string;
        createdAt: Date;
        workspaceId: string;
        authorId: string | null;
        content: string;
        source: "manual" | "chat";
        skillId: string;
    }>;
    removeMemory(workspaceId: string, id: string, memoryId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    listConnections(workspaceId: string, id: string, user: CurrentUserPayload): Promise<{
        id: string;
        skillId: string;
        provider: string;
        connectionId: string | null;
        config: Record<string, unknown>;
        createdAt: Date;
        status: string | null;
        account: string | null;
    }[]>;
    addConnection(workspaceId: string, id: string, user: CurrentUserPayload, body: AddSkillConnectionDto): Promise<{
        id: string;
        createdAt: Date;
        workspaceId: string;
        createdById: string | null;
        provider: string;
        config: Record<string, unknown>;
        connectionId: string | null;
        skillId: string;
    }>;
    removeConnection(workspaceId: string, id: string, connectionRowId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
}
