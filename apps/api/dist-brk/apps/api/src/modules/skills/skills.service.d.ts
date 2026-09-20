import type { Db } from '@rundesk/db';
import { type SkillTab } from './skill-visibility';
import type { SkillProposal } from './skill-proposal';
/** How many memories are recalled into a prompt. Newest first. */
export declare const MEMORY_RECALL_LIMIT = 40;
export declare class SkillsService {
    private db;
    constructor(db: Db);
    templates(): readonly import("./skill-templates").SkillTemplate[];
    list(workspaceId: string, userId: string, tab?: SkillTab): Omit<import("drizzle-orm/pg-core").PgSelectBase<"skills", {
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
    /**
     * Read a skill the caller is allowed to see.
     *
     * Deliberately 404 rather than 403 when the skill exists but is someone
     * else's private one: a 403 confirms the id names a real skill, which is a
     * disclosure in itself when ids can be guessed at from a shared link.
     */
    get(workspaceId: string, userId: string, id: string): Promise<{
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
    /**
     * Editing is owner-only. Sharing a skill with the workspace shares its use,
     * not its authorship — a colleague running your Brand Voice skill must not be
     * able to quietly rewrite what it believes.
     */
    private assertOwned;
    create(workspaceId: string, userId: string, input: {
        name: string;
        description?: string;
        instructions?: string;
        archetype?: string;
        visibility?: 'private' | 'workspace';
        enabled?: boolean;
    }): Promise<{
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
    /**
     * §15 — the approval half of the gate, frame `t1146`: "Approve this approach
     * and I'll create it."
     *
     * One call, because approving is one decision. Creating the skill and then
     * separately writing its memory would leave a skill that was approved with
     * memory and shipped without it if the second call failed — and nobody would
     * see that happen.
     *
     * The proposal is treated as untrusted input, not as something the server
     * said earlier: it round-trips through the client, so it goes through the
     * same `create` path — the same name check, the same ownership from the
     * token, the same private default — as anything typed by hand.
     */
    createFromProposal(workspaceId: string, userId: string, proposal: Pick<SkillProposal, 'name' | 'instructions'> & {
        description?: string;
        memories?: string[];
    }): Promise<{
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
    update(workspaceId: string, userId: string, id: string, patch: {
        name?: string;
        description?: string | null;
        instructions?: string;
        visibility?: 'private' | 'workspace';
        enabled?: boolean;
    }): Promise<{
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
    remove(workspaceId: string, userId: string, id: string): Promise<{
        ok: boolean;
    }>;
    /**
     * §15 — "For your team / Discover team skills / Discover skills created
     * across your workspace" (frame `285_1743`).
     *
     * No model involved: this is a real question with a real answer. What a
     * colleague published and you have not picked up is a database query, and
     * asking a model to describe it would be slower, dearer and less true.
     *
     * Ordered by how many people already use it, because on a hub full of
     * strangers' skills that is the only signal a newcomer has.
     */
    discover(workspaceId: string, userId: string): Promise<{
        id: string;
        name: string;
        description: string | null;
        archetype: "scratch" | "delegate_like_me" | "brand_voice" | "triage_like_me";
        createdById: string;
        authorName: string | null;
        installs: number;
    }[]>;
    /**
     * §15 — "browse, install, and manage".
     *
     * Installing needs only the right to SEE the skill, which is the whole point
     * of publishing one: a colleague picks it up without needing anything from
     * its author. It is also idempotent, because a hub button pressed twice
     * means the same thing as pressed once.
     */
    install(workspaceId: string, userId: string, skillId: string): Promise<{
        ok: boolean;
        installed: boolean;
    }>;
    /**
     * Uninstalling is scoped to this person and this skill, and deliberately does
     * NOT go through `get`: someone whose access was revoked after installing
     * must still be able to take it off their own list rather than being stuck
     * with a row they can no longer read.
     */
    uninstall(workspaceId: string, userId: string, skillId: string): Promise<{
        ok: boolean;
        installed: boolean;
    }>;
    /**
     * The skills this person can invoke by slash command: installed, visible, and
     * not switched off by their author.
     *
     * `enabled` is filtered HERE rather than left to the invocation check, so a
     * skill its author has disabled stops appearing in the composer's menu. It
     * would otherwise be offered, typed, and then refused — which reads as the
     * command being broken rather than the skill being off.
     */
    listInstalled(workspaceId: string, userId: string): Omit<import("drizzle-orm/pg-core").PgSelectBase<"skills", {
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
    }, "partial", Record<"skills", "not-null">, false, "where" | "orderBy", {
        id: string;
        name: string;
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
    }>, "where" | "orderBy">;
    /** Which of these skills the caller has installed — one read, not N. */
    installedIds(workspaceId: string, userId: string): Promise<string[]>;
    /**
     * §15 memory — [18:42]: "yeh hum jo bhi baat karenge woh STORE karega apne
     * andar." Reading a skill's memory needs only the right to see the skill;
     * writing to it is owner-only, for the reason in `assertOwned`.
     */
    listMemories(workspaceId: string, userId: string, skillId: string): Promise<{
        id: string;
        skillId: string;
        workspaceId: string;
        authorId: string | null;
        content: string;
        source: "manual" | "chat";
        createdAt: Date;
    }[]>;
    addMemory(workspaceId: string, userId: string, skillId: string, input: {
        content: string;
        source?: 'chat' | 'manual';
    }): Promise<{
        id: string;
        createdAt: Date;
        workspaceId: string;
        authorId: string | null;
        content: string;
        source: "manual" | "chat";
        skillId: string;
    }>;
    removeMemory(workspaceId: string, userId: string, skillId: string, memoryId: string): Promise<{
        ok: boolean;
    }>;
    listConnections(workspaceId: string, userId: string, skillId: string): Promise<{
        id: string;
        skillId: string;
        provider: string;
        connectionId: string | null;
        config: Record<string, unknown>;
        createdAt: Date;
        status: string | null;
        account: string | null;
    }[]>;
    /**
     * Bind a skill to one of the workspace's existing integrations.
     *
     * The binding never carries a credential of its own — it points at the grant
     * the workspace already holds. That is what makes revoking the integration
     * revoke every skill leaning on it, in one move, without a sweep.
     */
    addConnection(workspaceId: string, userId: string, skillId: string, input: {
        provider: string;
        connectionId?: string;
        config?: Record<string, unknown>;
    }): Promise<{
        id: string;
        createdAt: Date;
        workspaceId: string;
        createdById: string | null;
        provider: string;
        config: Record<string, unknown>;
        connectionId: string | null;
        skillId: string;
    }>;
    removeConnection(workspaceId: string, userId: string, skillId: string, connectionRowId: string): Promise<{
        ok: boolean;
    }>;
    /**
     * Everything the assistant needs to answer *as* this skill: the playbook, the
     * memory it has accumulated, and the systems it is allowed to draw on.
     *
     * A disabled skill cannot be invoked — her library's Enabled tab is a switch,
     * not a label — and the check is here, on the one path that builds a prompt,
     * rather than on each caller.
     */
    buildInvocationContext(workspaceId: string, userId: string, skillId: string): Promise<{
        skill: {
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
        };
        memories: {
            content: string;
            createdAt: Date;
        }[];
        connections: {
            provider: string;
        }[];
    }>;
    /**
     * Render that context as a system-prompt fragment.
     *
     * The last paragraph is the boundary, and it is deliberate: a skill shapes a
     * reply, it does not act unattended. Nothing in the video shows a skill
     * running on its own — even the assistant authoring one stops to ask
     * ("Approve this approach and I'll create it", [18:58]). Connections are
     * named here so the model knows what it may cite, not so it may reach out.
     */
    renderSkillPrompt(ctx: {
        skill: {
            name: string;
            description: string | null;
            instructions: string;
        };
        memories: Array<{
            content: string;
        }>;
        connections: Array<{
            provider: string;
        }>;
    }): string;
    /** Counts for the hub header, in one round trip rather than three. */
    counts(workspaceId: string, userId: string): Promise<{
        all: number;
        enabled: number;
        mine: number;
    }>;
}
