/**
 * Pending workspace invitations sent by org admins.
 *
 * One invite is **organization-scoped**: it grants org membership at the chosen
 * `orgRole` and optionally adds the user to N workspaces with their respective
 * roles (encoded in `workspaceMemberships`). On acceptance, the corresponding
 * `organization_members` row + N `workspace_members` rows are created in a
 * single transaction.
 *
 * Tokens are random URL-safe strings (32 bytes, base64url) — never derived
 * from email/timestamp. Single-use enforcement happens via the
 * `WHERE status = 'pending'` guard on the claim transaction.
 */
export declare const invitations: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "invitations";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "invitations";
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
        organizationId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "organization_id";
            tableName: "invitations";
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
        email: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "email";
            tableName: "invitations";
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
        orgRole: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "org_role";
            tableName: "invitations";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "member" | "owner" | "admin" | "billing";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: ["owner", "admin", "billing", "member"];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        workspaceMemberships: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "workspace_memberships";
            tableName: "invitations";
            dataType: "json";
            columnType: "PgJsonb";
            data: {
                workspaceId: string;
                role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
            }[];
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
                workspaceId: string;
                role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
            }[];
        }>;
        invitedByUserId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "invited_by_user_id";
            tableName: "invitations";
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
        token: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "token";
            tableName: "invitations";
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
        status: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "invitations";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "pending" | "accepted" | "revoked" | "expired" | "declined";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: ["pending", "accepted", "revoked", "expired", "declined"];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        expiresAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "expires_at";
            tableName: "invitations";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
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
        acceptedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "accepted_at";
            tableName: "invitations";
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
        acceptedByUserId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "accepted_by_user_id";
            tableName: "invitations";
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
            tableName: "invitations";
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
export declare const invitationsRelations: import("node_modules/drizzle-orm").Relations<"invitations", {
    organization: import("node_modules/drizzle-orm").One<"organizations", true>;
    invitedBy: import("node_modules/drizzle-orm").One<"users", true>;
    acceptedBy: import("node_modules/drizzle-orm").One<"users", false>;
}>;
