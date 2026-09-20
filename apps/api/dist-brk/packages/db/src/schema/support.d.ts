/**
 * Customer Support & Help Center (Plan §14.4). Four tables back the human
 * support surface that complements the existing AI help center (POST /ai/help):
 *
 *   * support_tickets          — a workspace-scoped support request with a
 *                                lifecycle (open→pending→resolved→closed), a
 *                                priority, an optional assignee and SLA clocks.
 *   * support_ticket_messages  — the conversation thread; each reply is flagged
 *                                staff vs. requester (`is_staff`).
 *   * status_components        — the services shown on the public status page.
 *   * status_incidents         — incidents posted against the status page.
 *
 * Statuses / priorities / impacts are stored as plain `text` (validated at the
 * app layer, like the billing tables) so the migration stays additive and
 * idempotent — no CREATE TYPE / ALTER TYPE churn.
 */
/** Ticket lifecycle status. */
export type SupportTicketStatus = 'open' | 'pending' | 'resolved' | 'closed';
/** Ticket priority — drives the SLA due-date policy. */
export type SupportTicketPriority = 'low' | 'normal' | 'high' | 'urgent';
/** A status-page component's current health. */
export type StatusComponentStatus = 'operational' | 'degraded' | 'partial_outage' | 'major_outage';
/** A status-page incident's lifecycle. */
export type StatusIncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';
/**
 * A support ticket. `first_response_due_at` / `resolution_due_at` are stamped
 * from the priority SLA policy at creation; `first_response_at` / `resolved_at`
 * are stamped when a staff member first replies / when the ticket is resolved.
 * SLA-breach is derived (due date passed with no matching stamp) — not stored.
 */
export declare const supportTickets: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "support_tickets";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "support_tickets";
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
            tableName: "support_tickets";
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
            tableName: "support_tickets";
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
        subject: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "subject";
            tableName: "support_tickets";
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
        body: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "body";
            tableName: "support_tickets";
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
        kind: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "kind";
            tableName: "support_tickets";
            dataType: "string";
            columnType: "PgText";
            data: "call" | "question";
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
            $type: "call" | "question";
        }>;
        requestedSlots: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "requested_slots";
            tableName: "support_tickets";
            dataType: "json";
            columnType: "PgJsonb";
            data: string[] | null;
            driverParam: unknown;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: string[] | null;
        }>;
        scheduledAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "scheduled_at";
            tableName: "support_tickets";
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
        status: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "support_tickets";
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
        priority: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "priority";
            tableName: "support_tickets";
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
        assignedToId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "assigned_to_id";
            tableName: "support_tickets";
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
        firstResponseAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "first_response_at";
            tableName: "support_tickets";
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
        resolvedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "resolved_at";
            tableName: "support_tickets";
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
        firstResponseDueAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "first_response_due_at";
            tableName: "support_tickets";
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
        resolutionDueAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "resolution_due_at";
            tableName: "support_tickets";
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
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "support_tickets";
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
            tableName: "support_tickets";
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
/** A single message in a ticket thread. `is_staff` marks a support-side reply. */
export declare const supportTicketMessages: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "support_ticket_messages";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "support_ticket_messages";
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
        ticketId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "ticket_id";
            tableName: "support_ticket_messages";
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
            tableName: "support_ticket_messages";
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
        body: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "body";
            tableName: "support_ticket_messages";
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
        isStaff: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "is_staff";
            tableName: "support_ticket_messages";
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
            tableName: "support_ticket_messages";
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
/** A service shown on the public status page. `position` orders the list. */
export declare const statusComponents: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "status_components";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "status_components";
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
        name: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "name";
            tableName: "status_components";
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
            tableName: "status_components";
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
        position: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "position";
            tableName: "status_components";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
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
 * An incident posted to the public status page. Optionally tied to a component.
 * `impact` mirrors a component severity ('none'|'minor'|'major'|'critical'),
 * `status` walks the incident lifecycle.
 */
export declare const statusIncidents: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "status_incidents";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "status_incidents";
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
        title: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "title";
            tableName: "status_incidents";
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
        body: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "body";
            tableName: "status_incidents";
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
        impact: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "impact";
            tableName: "status_incidents";
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
        status: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "status_incidents";
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
        componentId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "component_id";
            tableName: "status_incidents";
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
        startedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "started_at";
            tableName: "status_incidents";
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
        resolvedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "resolved_at";
            tableName: "status_incidents";
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
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "status_incidents";
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
export declare const supportTicketsRelations: import("node_modules/drizzle-orm").Relations<"support_tickets", {
    workspace: import("node_modules/drizzle-orm").One<"workspaces", true>;
    createdBy: import("node_modules/drizzle-orm").One<"users", true>;
    messages: import("node_modules/drizzle-orm").Many<"support_ticket_messages">;
}>;
export declare const supportTicketMessagesRelations: import("node_modules/drizzle-orm").Relations<"support_ticket_messages", {
    ticket: import("node_modules/drizzle-orm").One<"support_tickets", true>;
    author: import("node_modules/drizzle-orm").One<"users", true>;
}>;
export declare const statusIncidentsRelations: import("node_modules/drizzle-orm").Relations<"status_incidents", {
    component: import("node_modules/drizzle-orm").One<"status_components", false>;
}>;
