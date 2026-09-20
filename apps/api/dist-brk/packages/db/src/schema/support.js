"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statusIncidentsRelations = exports.supportTicketMessagesRelations = exports.supportTicketsRelations = exports.statusIncidents = exports.statusComponents = exports.supportTicketMessages = exports.supportTickets = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
/**
 * A support ticket. `first_response_due_at` / `resolution_due_at` are stamped
 * from the priority SLA policy at creation; `first_response_at` / `resolved_at`
 * are stamped when a staff member first replies / when the ticket is resolved.
 * SLA-breach is derived (due date passed with no matching stamp) — not stored.
 */
exports.supportTickets = (0, pg_core_1.pgTable)('support_tickets', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    createdById: (0, pg_core_1.uuid)('created_by_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    subject: (0, pg_core_1.text)('subject').notNull(),
    body: (0, pg_core_1.text)('body').notNull().default(''),
    /**
     * §G06 [07:30] — "main meeting schedule bhi start kar sakti hoon".
     *
     * Help had two of the three routes she named: read the docs, or open a
     * ticket. The third — talk to a person, at a time — went to a `mailto:`.
     *
     * A ticket with a kind rather than a separate booking system. The request
     * then lands in the queue the team already works, inherits the SLA clock
     * that is already on this table, and can be answered in the thread that is
     * already there. A scheduler of our own would need availability we do not
     * model, and inventing slots nobody has published is how a "booking" ends
     * up being a form that promises a time it cannot keep.
     */
    kind: (0, pg_core_1.text)('kind').$type().notNull().default('question'),
    /** Times the requester offered, ISO-8601. Only meaningful for kind 'call'. */
    requestedSlots: (0, pg_core_1.jsonb)('requested_slots').$type(),
    /** Set when the team confirms one of them. Until then, nothing is booked. */
    scheduledAt: (0, pg_core_1.timestamp)('scheduled_at', { withTimezone: true }),
    // 'open' | 'pending' | 'resolved' | 'closed'
    status: (0, pg_core_1.text)('status').notNull().default('open'),
    // 'low' | 'normal' | 'high' | 'urgent'
    priority: (0, pg_core_1.text)('priority').notNull().default('normal'),
    assignedToId: (0, pg_core_1.uuid)('assigned_to_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    firstResponseAt: (0, pg_core_1.timestamp)('first_response_at', { withTimezone: true }),
    resolvedAt: (0, pg_core_1.timestamp)('resolved_at', { withTimezone: true }),
    firstResponseDueAt: (0, pg_core_1.timestamp)('first_response_due_at', { withTimezone: true }).notNull(),
    resolutionDueAt: (0, pg_core_1.timestamp)('resolution_due_at', { withTimezone: true }).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    byWorkspace: (0, pg_core_1.index)('support_tickets_workspace_idx').on(t.workspaceId),
    byCreator: (0, pg_core_1.index)('support_tickets_creator_idx').on(t.createdById),
    byStatus: (0, pg_core_1.index)('support_tickets_status_idx').on(t.status),
}));
/** A single message in a ticket thread. `is_staff` marks a support-side reply. */
exports.supportTicketMessages = (0, pg_core_1.pgTable)('support_ticket_messages', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    ticketId: (0, pg_core_1.uuid)('ticket_id').notNull().references(() => exports.supportTickets.id, { onDelete: 'cascade' }),
    authorId: (0, pg_core_1.uuid)('author_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    body: (0, pg_core_1.text)('body').notNull(),
    isStaff: (0, pg_core_1.boolean)('is_staff').notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    byTicket: (0, pg_core_1.index)('support_ticket_messages_ticket_idx').on(t.ticketId),
}));
/** A service shown on the public status page. `position` orders the list. */
exports.statusComponents = (0, pg_core_1.pgTable)('status_components', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    name: (0, pg_core_1.text)('name').notNull(),
    // 'operational' | 'degraded' | 'partial_outage' | 'major_outage'
    status: (0, pg_core_1.text)('status').notNull().default('operational'),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
}, (t) => ({
    byPosition: (0, pg_core_1.index)('status_components_position_idx').on(t.position),
}));
/**
 * An incident posted to the public status page. Optionally tied to a component.
 * `impact` mirrors a component severity ('none'|'minor'|'major'|'critical'),
 * `status` walks the incident lifecycle.
 */
exports.statusIncidents = (0, pg_core_1.pgTable)('status_incidents', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    title: (0, pg_core_1.text)('title').notNull(),
    body: (0, pg_core_1.text)('body').notNull().default(''),
    impact: (0, pg_core_1.text)('impact').notNull().default('minor'),
    // 'investigating' | 'identified' | 'monitoring' | 'resolved'
    status: (0, pg_core_1.text)('status').notNull().default('investigating'),
    componentId: (0, pg_core_1.uuid)('component_id').references(() => exports.statusComponents.id, { onDelete: 'set null' }),
    startedAt: (0, pg_core_1.timestamp)('started_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: (0, pg_core_1.timestamp)('resolved_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    byStarted: (0, pg_core_1.index)('status_incidents_started_idx').on(t.startedAt),
    byComponent: (0, pg_core_1.index)('status_incidents_component_idx').on(t.componentId),
}));
exports.supportTicketsRelations = (0, drizzle_orm_1.relations)(exports.supportTickets, ({ one, many }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.supportTickets.workspaceId], references: [workspaces_1.workspaces.id] }),
    createdBy: one(users_1.users, { fields: [exports.supportTickets.createdById], references: [users_1.users.id] }),
    messages: many(exports.supportTicketMessages),
}));
exports.supportTicketMessagesRelations = (0, drizzle_orm_1.relations)(exports.supportTicketMessages, ({ one }) => ({
    ticket: one(exports.supportTickets, { fields: [exports.supportTicketMessages.ticketId], references: [exports.supportTickets.id] }),
    author: one(users_1.users, { fields: [exports.supportTicketMessages.authorId], references: [users_1.users.id] }),
}));
exports.statusIncidentsRelations = (0, drizzle_orm_1.relations)(exports.statusIncidents, ({ one }) => ({
    component: one(exports.statusComponents, { fields: [exports.statusIncidents.componentId], references: [exports.statusComponents.id] }),
}));
//# sourceMappingURL=support.js.map