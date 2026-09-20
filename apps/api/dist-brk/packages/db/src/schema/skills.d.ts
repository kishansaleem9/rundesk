/**
 * Skills (§15) — the thing she was most insistent on naming correctly.
 *
 *   "Ab yeh jo SKILL wali cheez hai na… aap jo kaam karte ho woh aap ka AGENT
 *    kar sakta hai" — [17:38], and again at [19:12]: a SKILL, not a feature.
 *
 * A skill is a **named, reusable playbook**: a persona plus instructions that
 * shape the assistant's reply when a person invokes it.
 *
 * That boundary is not our invention, and it is worth being exact because
 * [17:46] ("aap ka AGENT kar sakta hai; aap REPLACE ho sakte ho") sounds like
 * the opposite. In ClickUp these are two different products:
 *
 *   AI Skills — "reusable instructions that allow Brain to load the right
 *   workflow, format, or expertise on demand instead of rewriting the same
 *   prompt every time. Think of a Skill as a saved playbook… you define the
 *   steps, context, and style one time, and Brain follows it every time the
 *   Skill is used."
 *
 *   Autopilot / Super Agents — the layer that ACTS: they "perform actions
 *   based on defined triggers and conditions", run on Lists, Folders, Spaces
 *   and Chat Channels, and are configured with "instructions, triggers,
 *   skills, knowledge, and memory" — where "the Skills section holds all of
 *   your Super Agent's tools".
 *
 * So a Skill is a component an Agent uses, not a small Agent. Her sentence
 * describes the category; the Skills Hub she is demonstrating is the
 * instructions half of it. Building action into this table would not be
 * ambition, it would be the wrong product.
 */
export declare const skills: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "skills";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
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
        workspaceId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
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
        createdById: import("node_modules/drizzle-orm/pg-core").PgColumn<{
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
        name: import("node_modules/drizzle-orm/pg-core").PgColumn<{
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
        description: import("node_modules/drizzle-orm/pg-core").PgColumn<{
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
        instructions: import("node_modules/drizzle-orm/pg-core").PgColumn<{
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
        archetype: import("node_modules/drizzle-orm/pg-core").PgColumn<{
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
        visibility: import("node_modules/drizzle-orm/pg-core").PgColumn<{
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
        enabled: import("node_modules/drizzle-orm/pg-core").PgColumn<{
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
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
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
        updatedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
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
    };
    dialect: "pg";
}>;
/**
 * Skill memory — `[18:42]`: "Yeh MEMORY hai — yeh hum jo bhi baat karenge woh
 * STORE karega apne andar."
 *
 * Append-only notes belonging to one skill. Recalled into the system prompt on
 * every invocation, which is what "never explain it again" actually costs.
 */
export declare const skillMemories: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "skill_memories";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "skill_memories";
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
        skillId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "skill_id";
            tableName: "skill_memories";
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
        workspaceId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "workspace_id";
            tableName: "skill_memories";
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
        authorId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "author_id";
            tableName: "skill_memories";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        content: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "content";
            tableName: "skill_memories";
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
        source: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "source";
            tableName: "skill_memories";
            dataType: "string";
            columnType: "PgText";
            data: "manual" | "chat";
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
            $type: "manual" | "chat";
        }>;
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "skill_memories";
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
    };
    dialect: "pg";
}>;
/**
 * Skill connections — `[18:58]`: "agar main is ko build karoongi to main is ko
 * kisi bhi system mein CONNECT kar sakti hoon."
 *
 * A binding, not a credential. The workspace already holds the OAuth grant in
 * `workspace_integration_connections`; this row records which of those a given
 * skill is allowed to draw on, so the skill inherits access it can never widen
 * and revoking the workspace connection revokes it everywhere at once.
 */
export declare const skillConnections: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "skill_connections";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "skill_connections";
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
        skillId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "skill_id";
            tableName: "skill_connections";
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
        workspaceId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "workspace_id";
            tableName: "skill_connections";
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
        provider: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "provider";
            tableName: "skill_connections";
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
        connectionId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "connection_id";
            tableName: "skill_connections";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        config: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "config";
            tableName: "skill_connections";
            dataType: "json";
            columnType: "PgJsonb";
            data: Record<string, unknown>;
            driverParam: unknown;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: Record<string, unknown>;
        }>;
        createdById: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_by_id";
            tableName: "skill_connections";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "skill_connections";
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
    };
    dialect: "pg";
}>;
/**
 * §15 — who has installed a skill.
 *
 * ClickUp's Skills Hub is where you "browse, INSTALL, and manage" skills, and
 * her library tabs are All Skills / Enabled / Created by me (frame `285_1743`).
 * Three tabs over one library only mean three different things if Enabled is
 * per-person: otherwise it is a filter on a flag the author controls, which
 * would sit oddly next to "Created by me".
 *
 * So installing is a row here, not a column on the skill. The author's
 * `skills.enabled` stays what it is — a kill-switch over their own skill for
 * everyone — and this records who chose to pick it up.
 */
export declare const skillInstalls: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "skill_installs";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "skill_installs";
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
        skillId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "skill_id";
            tableName: "skill_installs";
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
        workspaceId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "workspace_id";
            tableName: "skill_installs";
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
        userId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "skill_installs";
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
        installedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "installed_at";
            tableName: "skill_installs";
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
    };
    dialect: "pg";
}>;
export declare const skillInstallsRelations: import("node_modules/drizzle-orm").Relations<"skill_installs", {
    skill: import("node_modules/drizzle-orm").One<"skills", true>;
    workspace: import("node_modules/drizzle-orm").One<"workspaces", true>;
    user: import("node_modules/drizzle-orm").One<"users", true>;
}>;
export declare const skillsRelations: import("node_modules/drizzle-orm").Relations<"skills", {
    workspace: import("node_modules/drizzle-orm").One<"workspaces", true>;
    createdBy: import("node_modules/drizzle-orm").One<"users", true>;
    memories: import("node_modules/drizzle-orm").Many<"skill_memories">;
    connections: import("node_modules/drizzle-orm").Many<"skill_connections">;
    installs: import("node_modules/drizzle-orm").Many<"skill_installs">;
}>;
export declare const skillMemoriesRelations: import("node_modules/drizzle-orm").Relations<"skill_memories", {
    skill: import("node_modules/drizzle-orm").One<"skills", true>;
    workspace: import("node_modules/drizzle-orm").One<"workspaces", true>;
    author: import("node_modules/drizzle-orm").One<"users", false>;
}>;
export declare const skillConnectionsRelations: import("node_modules/drizzle-orm").Relations<"skill_connections", {
    skill: import("node_modules/drizzle-orm").One<"skills", true>;
    workspace: import("node_modules/drizzle-orm").One<"workspaces", true>;
    connection: import("node_modules/drizzle-orm").One<"workspace_integration_connections", false>;
    createdBy: import("node_modules/drizzle-orm").One<"users", false>;
}>;
