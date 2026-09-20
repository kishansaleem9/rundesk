"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clientInvoiceLineItemsRelations = exports.clientInvoicesRelations = exports.clientInvoiceLineItems = exports.clientInvoices = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const clients_1 = require("./clients");
const projects_1 = require("./projects");
const users_1 = require("./users");
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
exports.clientInvoices = (0, pg_core_1.pgTable)('client_invoices', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    clientId: (0, pg_core_1.uuid)('client_id').notNull().references(() => clients_1.clients.id, { onDelete: 'cascade' }),
    projectId: (0, pg_core_1.uuid)('project_id').references(() => projects_1.projects.id, { onDelete: 'set null' }),
    number: (0, pg_core_1.text)('number').notNull(),
    // draft | sent | paid | void
    status: (0, pg_core_1.text)('status').notNull().default('draft'),
    currency: (0, pg_core_1.text)('currency').notNull().default('usd'),
    // Amounts in the currency minor unit (cents).
    subtotalCents: (0, pg_core_1.integer)('subtotal_cents').notNull().default(0),
    totalCents: (0, pg_core_1.integer)('total_cents').notNull().default(0),
    notes: (0, pg_core_1.text)('notes'),
    stripeInvoiceId: (0, pg_core_1.text)('stripe_invoice_id'),
    hostedUrl: (0, pg_core_1.text)('hosted_url'),
    issuedAt: (0, pg_core_1.timestamp)('issued_at', { withTimezone: true }),
    dueAt: (0, pg_core_1.timestamp)('due_at', { withTimezone: true }),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    byWorkspace: (0, pg_core_1.index)('client_invoices_workspace_idx').on(t.workspaceId),
    byClient: (0, pg_core_1.index)('client_invoices_client_idx').on(t.clientId),
}));
/** One line on a client invoice — typically a rolled-up block of billable time. */
exports.clientInvoiceLineItems = (0, pg_core_1.pgTable)('client_invoice_line_items', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    invoiceId: (0, pg_core_1.uuid)('invoice_id').notNull().references(() => exports.clientInvoices.id, { onDelete: 'cascade' }),
    description: (0, pg_core_1.text)('description').notNull(),
    // Billable minutes represented by this line (0 for an ad-hoc line).
    quantityMinutes: (0, pg_core_1.integer)('quantity_minutes').notNull().default(0),
    unitAmountCents: (0, pg_core_1.integer)('unit_amount_cents').notNull().default(0),
    amountCents: (0, pg_core_1.integer)('amount_cents').notNull().default(0),
    // The time_entry ids rolled into this line (for traceability/audit).
    timeEntryIds: (0, pg_core_1.jsonb)('time_entry_ids').$type().notNull().default([]),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    byInvoice: (0, pg_core_1.index)('client_invoice_line_items_invoice_idx').on(t.invoiceId),
}));
exports.clientInvoicesRelations = (0, drizzle_orm_1.relations)(exports.clientInvoices, ({ one, many }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.clientInvoices.workspaceId], references: [workspaces_1.workspaces.id] }),
    client: one(clients_1.clients, { fields: [exports.clientInvoices.clientId], references: [clients_1.clients.id] }),
    project: one(projects_1.projects, { fields: [exports.clientInvoices.projectId], references: [projects_1.projects.id] }),
    lineItems: many(exports.clientInvoiceLineItems),
}));
exports.clientInvoiceLineItemsRelations = (0, drizzle_orm_1.relations)(exports.clientInvoiceLineItems, ({ one }) => ({
    invoice: one(exports.clientInvoices, { fields: [exports.clientInvoiceLineItems.invoiceId], references: [exports.clientInvoices.id] }),
}));
//# sourceMappingURL=client-invoices.js.map