/**
 * Semantic knowledge store (Plan §15.1). One row = one embedded piece of
 * workspace content (a task, a doc, a task comment, or the extracted text of a
 * task attachment), used to answer "Ask about your workspace" via vector
 * similarity instead of keyword match.
 *
 * PORTABILITY — the `embedding` column is a plain `double precision[]` (float8[]),
 * NOT the pgvector `vector` type. This means the table works on stock Postgres
 * with no `CREATE EXTENSION vector`, so the migration stays additive/idempotent
 * and the whole feature is testable on the verify database (and in CI) without
 * any extension. Cosine similarity is computed in the app (vectors are stored
 * L2-normalized, so cosine == dot product). If pgvector is ever present it can
 * be layered on top; it is intentionally NOT required.
 */
export type KnowledgeSourceType = 'task' | 'doc' | 'comment' | 'attachment' | 'meeting';
export declare const knowledgeEmbeddings: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "knowledge_embeddings";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "knowledge_embeddings";
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
            tableName: "knowledge_embeddings";
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
        sourceType: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "source_type";
            tableName: "knowledge_embeddings";
            dataType: "string";
            columnType: "PgText";
            data: KnowledgeSourceType;
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
        }, {}, {
            $type: KnowledgeSourceType;
        }>;
        sourceId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "source_id";
            tableName: "knowledge_embeddings";
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
        title: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "title";
            tableName: "knowledge_embeddings";
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
        url: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "url";
            tableName: "knowledge_embeddings";
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
        contentHash: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "content_hash";
            tableName: "knowledge_embeddings";
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
        embedding: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "embedding";
            tableName: "knowledge_embeddings";
            dataType: "array";
            columnType: "PgArray";
            data: number[];
            driverParam: string | (string | number)[];
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: import("node_modules/drizzle-orm").Column<{
                name: "embedding";
                tableName: "knowledge_embeddings";
                dataType: "number";
                columnType: "PgDoublePrecision";
                data: number;
                driverParam: string | number;
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
            identity: undefined;
            generated: undefined;
        }, {}, {
            baseBuilder: import("node_modules/drizzle-orm/pg-core").PgColumnBuilder<{
                name: "embedding";
                dataType: "number";
                columnType: "PgDoublePrecision";
                data: number;
                driverParam: string | number;
                enumValues: undefined;
            }, {}, {}, import("node_modules/drizzle-orm").ColumnBuilderExtraConfig>;
            size: undefined;
        }>;
        dim: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "dim";
            tableName: "knowledge_embeddings";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
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
        updatedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "knowledge_embeddings";
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
export declare const knowledgeEmbeddingsRelations: import("node_modules/drizzle-orm").Relations<"knowledge_embeddings", {
    workspace: import("node_modules/drizzle-orm").One<"workspaces", true>;
}>;
