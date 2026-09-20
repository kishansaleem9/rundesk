/**
 * §7.13 Project Health Scoring — one persisted row per active project per day.
 * The daily cron (ProjectHealthService) reuses the deterministic formula in
 * ReportsService.getProjectHealth and folds in a comment-sentiment component,
 * then upserts here keyed by (project_id, scored_on) so re-runs the same day are
 * idempotent. The trend endpoint reads these rows back for a 30-day sparkline.
 */
export declare const projectHealthScores: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "project_health_scores";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "project_health_scores";
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
        projectId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "project_id";
            tableName: "project_health_scores";
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
            tableName: "project_health_scores";
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
        score: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "score";
            tableName: "project_health_scores";
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
        band: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "band";
            tableName: "project_health_scores";
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
        components: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "components";
            tableName: "project_health_scores";
            dataType: "json";
            columnType: "PgJsonb";
            data: {
                onTime: number;
                overdue: number;
                blockers: number;
                activity: number;
                sentiment: number;
            };
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
            $type: {
                onTime: number;
                overdue: number;
                blockers: number;
                activity: number;
                sentiment: number;
            };
        }>;
        sentiment: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "sentiment";
            tableName: "project_health_scores";
            dataType: "json";
            columnType: "PgJsonb";
            data: {
                score: number;
                label: "positive" | "neutral" | "negative";
                positive: number;
                negative: number;
                samples: number;
                source: "ai" | "deterministic";
            };
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
            $type: {
                score: number;
                label: "positive" | "neutral" | "negative";
                positive: number;
                negative: number;
                samples: number;
                source: "ai" | "deterministic";
            };
        }>;
        scoredOn: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "scored_on";
            tableName: "project_health_scores";
            dataType: "string";
            columnType: "PgDateString";
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
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "project_health_scores";
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
export declare const projectHealthScoresRelations: import("node_modules/drizzle-orm").Relations<"project_health_scores", {
    project: import("node_modules/drizzle-orm").One<"projects", true>;
    workspace: import("node_modules/drizzle-orm").One<"workspaces", true>;
}>;
