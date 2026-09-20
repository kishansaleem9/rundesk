/**
 * §V2-14 — a person's connected calendars. More than one, and theirs.
 *
 * `[13:32]`–`[13:38]` "'Manage Account' pe click karoongi … 'Add Account' … aur
 * jitna chahoon main add kar sakti hoon." Frame `13:50` is the list, with a
 * Default calendar and a set of Busy calendars beneath it.
 *
 * WHY A NEW TABLE RATHER THAN A RELAXED CONSTRAINT.
 * `workspace_integration_connections` is unique on (workspace_id, provider) and
 * the OAuth callback UPSERTS on that key — so connecting a second Google
 * account never failed, it silently replaced the first and orphaned every
 * `task_calendar_links` row pointing at it. It is also owned by the WORKSPACE
 * with a `connected_by_id`, so it was one calendar for everybody rather than
 * one each. The unit of ownership has to move to the person; multiple accounts
 * then follow from that rather than the other way round.
 *
 * THE TWO FLAGS ARE DIFFERENT IN KIND, not in rank — this is what the frame
 * means by a primary and a secondary calendar. `isDefault` is where new events
 * are WRITTEN; `countsAsBusy` is whether the calendar is READ when working out
 * when somebody is free. A person with a work account and a personal one wants
 * work as the default and BOTH counted as busy, which is why one is a single
 * choice enforced by a partial unique index and the other is a plain boolean.
 */
export declare const userCalendarAccounts: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "user_calendar_accounts";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "user_calendar_accounts";
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
        userId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "user_calendar_accounts";
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
            tableName: "user_calendar_accounts";
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
            tableName: "user_calendar_accounts";
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
        externalAccountId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "external_account_id";
            tableName: "user_calendar_accounts";
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
        externalAccountEmail: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "external_account_email";
            tableName: "user_calendar_accounts";
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
        externalCalendarId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "external_calendar_id";
            tableName: "user_calendar_accounts";
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
        accessToken: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "access_token";
            tableName: "user_calendar_accounts";
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
        refreshToken: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "refresh_token";
            tableName: "user_calendar_accounts";
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
        tokenExpiresAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "token_expires_at";
            tableName: "user_calendar_accounts";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
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
        scopes: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "scopes";
            tableName: "user_calendar_accounts";
            dataType: "array";
            columnType: "PgArray";
            data: string[];
            driverParam: string | string[];
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: import("node_modules/drizzle-orm").Column<{
                name: "scopes";
                tableName: "user_calendar_accounts";
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
            identity: undefined;
            generated: undefined;
        }, {}, {
            baseBuilder: import("node_modules/drizzle-orm/pg-core").PgColumnBuilder<{
                name: "scopes";
                dataType: "string";
                columnType: "PgText";
                data: string;
                enumValues: [string, ...string[]];
                driverParam: string;
            }, {}, {}, import("node_modules/drizzle-orm").ColumnBuilderExtraConfig>;
            size: undefined;
        }>;
        status: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "user_calendar_accounts";
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
        isDefault: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "is_default";
            tableName: "user_calendar_accounts";
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
        countsAsBusy: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "counts_as_busy";
            tableName: "user_calendar_accounts";
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
            tableName: "user_calendar_accounts";
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
            tableName: "user_calendar_accounts";
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
export declare const userCalendarAccountsRelations: import("node_modules/drizzle-orm").Relations<"user_calendar_accounts", {
    user: import("node_modules/drizzle-orm").One<"users", true>;
    workspace: import("node_modules/drizzle-orm").One<"workspaces", true>;
}>;
/**
 * The shape a calendar account may be shown as.
 *
 * Named and exported so every read path spells the same safe columns, and so a
 * new endpoint cannot accidentally widen it: tokens are absent by construction
 * rather than by the author remembering.
 */
export declare const PUBLIC_CALENDAR_ACCOUNT_COLUMNS: {
    readonly id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
        name: "id";
        tableName: "user_calendar_accounts";
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
    readonly provider: import("node_modules/drizzle-orm/pg-core").PgColumn<{
        name: "provider";
        tableName: "user_calendar_accounts";
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
    readonly externalAccountEmail: import("node_modules/drizzle-orm/pg-core").PgColumn<{
        name: "external_account_email";
        tableName: "user_calendar_accounts";
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
    readonly externalCalendarId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
        name: "external_calendar_id";
        tableName: "user_calendar_accounts";
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
    readonly status: import("node_modules/drizzle-orm/pg-core").PgColumn<{
        name: "status";
        tableName: "user_calendar_accounts";
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
    readonly isDefault: import("node_modules/drizzle-orm/pg-core").PgColumn<{
        name: "is_default";
        tableName: "user_calendar_accounts";
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
    readonly countsAsBusy: import("node_modules/drizzle-orm/pg-core").PgColumn<{
        name: "counts_as_busy";
        tableName: "user_calendar_accounts";
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
    readonly createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
        name: "created_at";
        tableName: "user_calendar_accounts";
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
