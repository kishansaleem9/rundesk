import { pgTable, text, timestamp, uuid, integer, boolean, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

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
export type SupportTicketStatus = 'open' | 'pending' | 'resolved' | 'closed'
/** Ticket priority — drives the SLA due-date policy. */
export type SupportTicketPriority = 'low' | 'normal' | 'high' | 'urgent'
/** A status-page component's current health. */
export type StatusComponentStatus =
  | 'operational'
  | 'degraded'
  | 'partial_outage'
  | 'major_outage'
/** A status-page incident's lifecycle. */
export type StatusIncidentStatus =
  | 'investigating'
  | 'identified'
  | 'monitoring'
  | 'resolved'

/**
 * A support ticket. `first_response_due_at` / `resolution_due_at` are stamped
 * from the priority SLA policy at creation; `first_response_at` / `resolved_at`
 * are stamped when a staff member first replies / when the ticket is resolved.
 * SLA-breach is derived (due date passed with no matching stamp) — not stored.
 */
export const supportTickets = pgTable(
  'support_tickets',
  {
    id:                 uuid('id').primaryKey().defaultRandom(),
    workspaceId:        uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    createdById:        uuid('created_by_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    subject:            text('subject').notNull(),
    body:               text('body').notNull().default(''),
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
    kind:               text('kind').$type<'question' | 'call'>().notNull().default('question'),
    /** Times the requester offered, ISO-8601. Only meaningful for kind 'call'. */
    requestedSlots:     jsonb('requested_slots').$type<string[] | null>(),
    /** Set when the team confirms one of them. Until then, nothing is booked. */
    scheduledAt:        timestamp('scheduled_at', { withTimezone: true }),
    // 'open' | 'pending' | 'resolved' | 'closed'
    status:             text('status').notNull().default('open'),
    // 'low' | 'normal' | 'high' | 'urgent'
    priority:           text('priority').notNull().default('normal'),
    assignedToId:       uuid('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),
    firstResponseAt:    timestamp('first_response_at', { withTimezone: true }),
    resolvedAt:         timestamp('resolved_at', { withTimezone: true }),
    firstResponseDueAt: timestamp('first_response_due_at', { withTimezone: true }).notNull(),
    resolutionDueAt:    timestamp('resolution_due_at', { withTimezone: true }).notNull(),
    createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:          timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index('support_tickets_workspace_idx').on(t.workspaceId),
    byCreator:   index('support_tickets_creator_idx').on(t.createdById),
    byStatus:    index('support_tickets_status_idx').on(t.status),
  }),
)

/** A single message in a ticket thread. `is_staff` marks a support-side reply. */
export const supportTicketMessages = pgTable(
  'support_ticket_messages',
  {
    id:        uuid('id').primaryKey().defaultRandom(),
    ticketId:  uuid('ticket_id').notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
    authorId:  uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    body:      text('body').notNull(),
    isStaff:   boolean('is_staff').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTicket: index('support_ticket_messages_ticket_idx').on(t.ticketId),
  }),
)

/** A service shown on the public status page. `position` orders the list. */
export const statusComponents = pgTable(
  'status_components',
  {
    id:       uuid('id').primaryKey().defaultRandom(),
    name:     text('name').notNull(),
    // 'operational' | 'degraded' | 'partial_outage' | 'major_outage'
    status:   text('status').notNull().default('operational'),
    position: integer('position').notNull().default(0),
  },
  (t) => ({
    byPosition: index('status_components_position_idx').on(t.position),
  }),
)

/**
 * An incident posted to the public status page. Optionally tied to a component.
 * `impact` mirrors a component severity ('none'|'minor'|'major'|'critical'),
 * `status` walks the incident lifecycle.
 */
export const statusIncidents = pgTable(
  'status_incidents',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    title:       text('title').notNull(),
    body:        text('body').notNull().default(''),
    impact:      text('impact').notNull().default('minor'),
    // 'investigating' | 'identified' | 'monitoring' | 'resolved'
    status:      text('status').notNull().default('investigating'),
    componentId: uuid('component_id').references(() => statusComponents.id, { onDelete: 'set null' }),
    startedAt:   timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt:  timestamp('resolved_at', { withTimezone: true }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byStarted:   index('status_incidents_started_idx').on(t.startedAt),
    byComponent: index('status_incidents_component_idx').on(t.componentId),
  }),
)

export const supportTicketsRelations = relations(supportTickets, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [supportTickets.workspaceId], references: [workspaces.id] }),
  createdBy: one(users, { fields: [supportTickets.createdById], references: [users.id] }),
  messages:  many(supportTicketMessages),
}))

export const supportTicketMessagesRelations = relations(supportTicketMessages, ({ one }) => ({
  ticket: one(supportTickets, { fields: [supportTicketMessages.ticketId], references: [supportTickets.id] }),
  author: one(users, { fields: [supportTicketMessages.authorId], references: [users.id] }),
}))

export const statusIncidentsRelations = relations(statusIncidents, ({ one }) => ({
  component: one(statusComponents, { fields: [statusIncidents.componentId], references: [statusComponents.id] }),
}))
