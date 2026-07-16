import { pgTable, text, timestamp, uuid, integer, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { clients } from './clients'
import { projects } from './projects'
import { users } from './users'

/**
 * §12.10 — client-facing invoices for billable project work. Distinct from the
 * SaaS `invoices` table (that mirrors Stripe subscription billing). A client
 * invoice is generated from a project's unbilled billable time entries: those
 * entries roll up into `client_invoice_line_items`, and each entry is stamped
 * with `time_entries.client_invoice_id` so it is never invoiced twice.
 *
 * When Stripe is configured the invoice can be pushed to Stripe (invoice +
 * invoice items); `stripe_invoice_id`/`hosted_url` mirror that. Everything is
 * env-gated — with no Stripe key the invoice stays a local draft/record.
 */
export const clientInvoices = pgTable(
  'client_invoices',
  {
    id:              uuid('id').primaryKey().defaultRandom(),
    workspaceId:     uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    clientId:        uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
    projectId:       uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    number:          text('number').notNull(),
    // draft | sent | paid | void
    status:          text('status').notNull().default('draft'),
    currency:        text('currency').notNull().default('usd'),
    // Amounts in the currency minor unit (cents).
    subtotalCents:   integer('subtotal_cents').notNull().default(0),
    totalCents:      integer('total_cents').notNull().default(0),
    notes:           text('notes'),
    stripeInvoiceId: text('stripe_invoice_id'),
    hostedUrl:       text('hosted_url'),
    issuedAt:        timestamp('issued_at', { withTimezone: true }),
    dueAt:           timestamp('due_at', { withTimezone: true }),
    createdById:     uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index('client_invoices_workspace_idx').on(t.workspaceId),
    byClient:    index('client_invoices_client_idx').on(t.clientId),
  }),
)

/** One line on a client invoice — typically a rolled-up block of billable time. */
export const clientInvoiceLineItems = pgTable(
  'client_invoice_line_items',
  {
    id:              uuid('id').primaryKey().defaultRandom(),
    invoiceId:       uuid('invoice_id').notNull().references(() => clientInvoices.id, { onDelete: 'cascade' }),
    description:     text('description').notNull(),
    // Billable minutes represented by this line (0 for an ad-hoc line).
    quantityMinutes: integer('quantity_minutes').notNull().default(0),
    unitAmountCents: integer('unit_amount_cents').notNull().default(0),
    amountCents:     integer('amount_cents').notNull().default(0),
    // The time_entry ids rolled into this line (for traceability/audit).
    timeEntryIds:    jsonb('time_entry_ids').$type<string[]>().notNull().default([]),
    createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byInvoice: index('client_invoice_line_items_invoice_idx').on(t.invoiceId),
  }),
)

export const clientInvoicesRelations = relations(clientInvoices, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [clientInvoices.workspaceId], references: [workspaces.id] }),
  client:    one(clients,    { fields: [clientInvoices.clientId],    references: [clients.id] }),
  project:   one(projects,   { fields: [clientInvoices.projectId],   references: [projects.id] }),
  lineItems: many(clientInvoiceLineItems),
}))

export const clientInvoiceLineItemsRelations = relations(clientInvoiceLineItems, ({ one }) => ({
  invoice: one(clientInvoices, { fields: [clientInvoiceLineItems.invoiceId], references: [clientInvoices.id] }),
}))
