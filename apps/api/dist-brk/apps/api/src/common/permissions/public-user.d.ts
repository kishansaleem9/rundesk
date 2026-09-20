/**
 * The only user columns that may leave the server when a user is embedded in
 * someone else's payload — a task's creator, a comment's author, a watcher.
 *
 * The `users` row carries `passwordHash`, `failedLoginAttempts`, `lockedUntil`
 * and the owner's private `notificationPreferences`. Drizzle's `with: { user:
 * true }` and `.select({ user: users })` both take the whole row, so embedding a
 * user was shipping all of that to every workspace member who could read the
 * parent object. Naming the columns is what stops a future column from being
 * exposed by default: a new secret added to `users` does not appear here unless
 * someone puts it here on purpose.
 *
 * Use `PUBLIC_USER_COLUMNS` for `.select()`, and `PUBLIC_USER_WITH` for the
 * relational `with:` form.
 */
export declare const PUBLIC_USER_COLUMNS: {
    readonly id: import("drizzle-orm/pg-core").PgColumn<{
        name: "id";
        tableName: "users";
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
    readonly email: import("drizzle-orm/pg-core").PgColumn<{
        name: "email";
        tableName: "users";
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
    readonly displayName: import("drizzle-orm/pg-core").PgColumn<{
        name: "display_name";
        tableName: "users";
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
    readonly avatarUrl: import("drizzle-orm/pg-core").PgColumn<{
        name: "avatar_url";
        tableName: "users";
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
    readonly bio: import("drizzle-orm/pg-core").PgColumn<{
        name: "bio";
        tableName: "users";
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
    readonly timezone: import("drizzle-orm/pg-core").PgColumn<{
        name: "timezone";
        tableName: "users";
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
    readonly role: import("drizzle-orm/pg-core").PgColumn<{
        name: "role";
        tableName: "users";
        dataType: "string";
        columnType: "PgEnumColumn";
        data: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
        driverParam: string;
        notNull: true;
        hasDefault: true;
        isPrimaryKey: false;
        isAutoincrement: false;
        hasRuntimeDefault: false;
        enumValues: ["super_admin", "workspace_admin", "manager", "member", "guest"];
        baseColumn: never;
        identity: undefined;
        generated: undefined;
    }, {}, {}>;
    readonly lastSeenAt: import("drizzle-orm/pg-core").PgColumn<{
        name: "last_seen_at";
        tableName: "users";
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
    readonly presenceStatus: import("drizzle-orm/pg-core").PgColumn<{
        name: "presence_status";
        tableName: "users";
        dataType: "string";
        columnType: "PgText";
        data: "online" | "away" | "busy" | "offline";
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
    }, {}, {
        $type: "online" | "away" | "busy" | "offline";
    }>;
};
/**
 * The same allow-list in the shape drizzle's relational queries want:
 * `with: { creator: PUBLIC_USER_WITH }`.
 */
export declare const PUBLIC_USER_WITH: {
    readonly columns: {
        readonly id: true;
        readonly email: true;
        readonly displayName: true;
        readonly avatarUrl: true;
        readonly bio: true;
        readonly timezone: true;
        readonly role: true;
        readonly lastSeenAt: true;
        readonly presenceStatus: true;
    };
};
