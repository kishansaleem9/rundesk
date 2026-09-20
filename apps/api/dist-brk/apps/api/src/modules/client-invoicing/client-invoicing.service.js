"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ClientInvoicingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientInvoicingService = exports.DEFAULT_RATE_PER_HOUR_CENTS = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const stripe_provider_1 = require("../billing/stripe.provider");
const item_visibility_1 = require("../../common/permissions/item-visibility");
/**
 * Default billable rate applied when the caller supplies none.
 *
 * We deliberately looked for a stored rate: neither `projects` nor `clients`
 * carries a billable-rate column (projects only has `default_billable`, a
 * boolean). So the rate is an input — `opts.ratePerHourCents` — and this
 * constant ($100.00/hour) is the sensible fallback when it is omitted.
 */
exports.DEFAULT_RATE_PER_HOUR_CENTS = 10_000;
/**
 * §12.10 Client invoicing.
 *
 * Turns a project's unbilled billable time into a client-facing invoice: the
 * qualifying `time_entries` (billable, not yet invoiced, on a task in the
 * project) roll up into one line per task, each entry is stamped with
 * `time_entries.client_invoice_id` so it can never be invoiced twice, and — when
 * Stripe is configured and the client has an email — the invoice is pushed to
 * Stripe (customer + invoice items + finalized invoice).
 *
 * Everything Stripe-related is env-gated via the shared `STRIPE_CLIENT` provider
 * (null when `STRIPE_SECRET_KEY` is unset): with no key the invoice simply stays
 * a local draft and no method ever throws on the missing optional config.
 */
let ClientInvoicingService = ClientInvoicingService_1 = class ClientInvoicingService {
    constructor(db, stripe) {
        this.db = db;
        this.stripe = stripe;
        this.logger = new common_1.Logger(ClientInvoicingService_1.name);
    }
    /** True when a Stripe client is available (STRIPE_SECRET_KEY is configured). */
    stripeConfigured() {
        return this.stripe !== null;
    }
    // ── Generation ──────────────────────────────────────────────────────────────
    /**
     * Generate a draft invoice from a project's unbilled billable time.
     *
     * Gathers every `time_entries` row whose task belongs to `projectId`
     * (time_entries → tasks → lists → project) that is billable, has a recorded
     * duration, and is not yet attached to an invoice. Those entries are grouped
     * by task into line items (one line per task; description = task title, summed
     * minutes), priced at `ratePerHourCents`, and written as a `client_invoices`
     * row (status 'draft') + `client_invoice_line_items`. Each included entry is
     * then stamped with the new invoice id so it is never double-invoiced.
     */
    async generateFromProject(workspaceId, projectId, opts = {}) {
        const ratePerHourCents = typeof opts.ratePerHourCents === 'number' && opts.ratePerHourCents >= 0
            ? Math.round(opts.ratePerHourCents)
            : exports.DEFAULT_RATE_PER_HOUR_CENTS;
        const currency = (opts.currency ?? 'usd').toLowerCase();
        // Resolve the project inside this workspace (via its space) and require a
        // client to bill to.
        const [project] = await this.db
            .select({ id: db_1.projects.id, name: db_1.projects.name, clientId: db_1.projects.clientId })
            .from(db_1.projects)
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.projects.id, projectId), (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId)))
            .limit(1);
        if (!project)
            throw new common_1.NotFoundException('Project not found');
        if (!project.clientId) {
            throw new common_1.BadRequestException('This project has no client to bill — assign a client first');
        }
        const [client] = await this.db
            .select({ id: db_1.clients.id, name: db_1.clients.name, contactEmail: db_1.clients.contactEmail })
            .from(db_1.clients)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.clients.id, project.clientId), (0, drizzle_orm_1.eq)(db_1.clients.workspaceId, workspaceId)))
            .limit(1);
        if (!client)
            throw new common_1.BadRequestException('The project client no longer exists');
        // Per-item task privacy (§2): never roll a private task's title into a line
        // item unless the caller may see that task. The caller is `createdById` (the
        // user generating the invoice) — usually a manager/admin (unrestricted), but
        // the helper is applied unconditionally so a non-manager caller is correct.
        const actorId = opts.createdById ?? '';
        const isManager = actorId ? await (0, item_visibility_1.resolveIsManager)(this.db, workspaceId, actorId, opts.createdByRole) : false;
        // Billable + not-yet-invoiced + has a duration, for tasks in this project.
        const rows = await this.db
            .select({
            entryId: db_1.timeEntries.id,
            durationSec: db_1.timeEntries.durationSec,
            isBillable: db_1.timeEntries.isBillable,
            clientInvoiceId: db_1.timeEntries.clientInvoiceId,
            taskId: db_1.tasks.id,
            taskTitle: db_1.tasks.title,
        })
            .from(db_1.timeEntries)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.timeEntries.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.lists.projectId, projectId), (0, drizzle_orm_1.eq)(db_1.timeEntries.isBillable, true), (0, drizzle_orm_1.isNull)(db_1.timeEntries.clientInvoiceId), (0, drizzle_orm_1.isNotNull)(db_1.timeEntries.durationSec), (0, item_visibility_1.taskVisibilityFilter)(this.db, actorId, isManager)));
        // The WHERE already filters, but re-check in memory so the roll-up can never
        // include a non-billable, already-invoiced, or zero-duration entry.
        const billable = rows.filter((r) => r.isBillable && !r.clientInvoiceId && (r.durationSec ?? 0) > 0);
        if (billable.length === 0) {
            throw new common_1.BadRequestException('No unbilled billable time entries for this project');
        }
        const { lines, subtotalCents, entryIds } = this.rollUp(billable, ratePerHourCents);
        const totalCents = subtotalCents; // no tax/discount modelled yet
        const now = new Date();
        const dueAt = new Date(now.getTime() + (opts.dueInDays ?? 30) * 24 * 60 * 60 * 1000);
        const [invoice] = await this.db
            .insert(db_1.clientInvoices)
            .values({
            workspaceId,
            clientId: client.id,
            projectId: project.id,
            number: this.generateNumber(),
            status: 'draft',
            currency,
            subtotalCents,
            totalCents,
            notes: opts.notes?.trim() || null,
            dueAt,
            createdById: opts.createdById ?? null,
            createdAt: now,
            updatedAt: now,
        })
            .returning();
        const insertedLines = await this.db
            .insert(db_1.clientInvoiceLineItems)
            .values(lines.map((l) => ({
            invoiceId: invoice.id,
            description: l.description,
            quantityMinutes: l.quantityMinutes,
            unitAmountCents: l.unitAmountCents,
            amountCents: l.amountCents,
            timeEntryIds: l.timeEntryIds,
            createdAt: now,
        })))
            .returning();
        // Stamp every included entry so it is never rolled into another invoice.
        // Drizzle UPDATE straight on the time_entries table (time-entries.service
        // is intentionally untouched).
        await this.db
            .update(db_1.timeEntries)
            .set({ clientInvoiceId: invoice.id, updatedAt: now })
            .where((0, drizzle_orm_1.inArray)(db_1.timeEntries.id, entryIds));
        // Best-effort Stripe push — never throws; a failure leaves the local draft.
        const stripeResult = await this.pushToStripe(invoice, client, lines, currency);
        return {
            ...invoice,
            ...(stripeResult ?? {}),
            lineItems: insertedLines,
        };
    }
    /** Group entries by task into priced line items and total them. */
    rollUp(rows, ratePerHourCents) {
        const byTask = new Map();
        for (const r of rows) {
            const g = byTask.get(r.taskId) ?? { title: r.taskTitle, seconds: 0, entryIds: [] };
            g.seconds += r.durationSec ?? 0;
            g.entryIds.push(r.entryId);
            byTask.set(r.taskId, g);
        }
        const lines = [];
        let subtotalCents = 0;
        for (const g of byTask.values()) {
            const quantityMinutes = Math.round(g.seconds / 60);
            // `unit_amount_cents` holds the hourly rate applied to the line; the line
            // amount is that rate pro-rated over the billed minutes, rounded to a cent.
            const amountCents = Math.round((quantityMinutes / 60) * ratePerHourCents);
            lines.push({
                description: g.title,
                quantityMinutes,
                unitAmountCents: ratePerHourCents,
                amountCents,
                timeEntryIds: g.entryIds,
            });
            subtotalCents += amountCents;
        }
        const entryIds = rows.map((r) => r.entryId);
        return { lines, subtotalCents, entryIds };
    }
    /** A short, human-friendly invoice number, e.g. INV-8F3A1C7D. */
    generateNumber() {
        return `INV-${(0, node_crypto_1.randomBytes)(4).toString('hex').toUpperCase()}`;
    }
    // ── Reads ───────────────────────────────────────────────────────────────────
    /** List a workspace's client invoices, newest first. */
    list(workspaceId) {
        return this.db
            .select()
            .from(db_1.clientInvoices)
            .where((0, drizzle_orm_1.eq)(db_1.clientInvoices.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.clientInvoices.createdAt));
    }
    /** Fetch one invoice (workspace-scoped) with its line items. */
    async get(workspaceId, id) {
        const invoice = await this.loadInvoice(workspaceId, id);
        const lineItems = await this.db
            .select()
            .from(db_1.clientInvoiceLineItems)
            .where((0, drizzle_orm_1.eq)(db_1.clientInvoiceLineItems.invoiceId, id))
            .orderBy(db_1.clientInvoiceLineItems.createdAt);
        return { ...invoice, lineItems };
    }
    // ── State transitions ─────────────────────────────────────────────────────────
    /** Mark an invoice as sent (stamps `issued_at` the first time). */
    async markSent(workspaceId, id) {
        const invoice = await this.loadInvoice(workspaceId, id);
        return this.setStatus(id, 'sent', { issuedAt: invoice.issuedAt ?? new Date() });
    }
    /** Mark an invoice as paid. */
    async markPaid(workspaceId, id) {
        await this.loadInvoice(workspaceId, id);
        return this.setStatus(id, 'paid');
    }
    /**
     * Void an invoice AND release its time entries (clear their
     * `client_invoice_id`) so they become billable again on a future invoice.
     */
    async void(workspaceId, id) {
        await this.loadInvoice(workspaceId, id);
        const updated = await this.setStatus(id, 'void');
        await this.db
            .update(db_1.timeEntries)
            .set({ clientInvoiceId: null, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.timeEntries.clientInvoiceId, id));
        return updated;
    }
    async setStatus(id, status, extra = {}) {
        const [updated] = await this.db
            .update(db_1.clientInvoices)
            .set({ status, updatedAt: new Date(), ...extra })
            .where((0, drizzle_orm_1.eq)(db_1.clientInvoices.id, id))
            .returning();
        return updated;
    }
    async loadInvoice(workspaceId, id) {
        const [invoice] = await this.db
            .select()
            .from(db_1.clientInvoices)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.clientInvoices.id, id), (0, drizzle_orm_1.eq)(db_1.clientInvoices.workspaceId, workspaceId)))
            .limit(1);
        if (!invoice)
            throw new common_1.NotFoundException('Invoice not found');
        return invoice;
    }
    // ── Stripe (optional, env-gated) ──────────────────────────────────────────────
    /**
     * Push a freshly-generated invoice to Stripe: create a customer for the
     * client, add an invoice item per line, then create + finalize the Stripe
     * invoice and mirror `stripe_invoice_id` / `hosted_url` back onto our row.
     *
     * Returns the mirrored fields on success, or `null` when Stripe is not
     * configured / the client has no email / the push fails — the caller keeps the
     * local draft either way. Never throws.
     */
    async pushToStripe(invoice, client, lines, currency) {
        if (!this.stripeConfigured() || !this.stripe || !client.contactEmail)
            return null;
        try {
            const customer = await this.stripe.customers.create({
                email: client.contactEmail,
                name: client.name,
            });
            for (const line of lines) {
                await this.stripe.invoiceItems.create({
                    customer: customer.id,
                    amount: line.amountCents,
                    currency,
                    description: line.description,
                });
            }
            const created = await this.stripe.invoices.create({
                customer: customer.id,
                collection_method: 'send_invoice',
                days_until_due: 30,
                auto_advance: false,
                metadata: { rundeskInvoiceId: invoice.id },
            });
            const finalized = await this.stripe.invoices.finalizeInvoice(created.id);
            const mirror = {
                stripeInvoiceId: finalized.id,
                hostedUrl: finalized.hosted_invoice_url ?? null,
            };
            await this.db
                .update(db_1.clientInvoices)
                .set({ ...mirror, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(db_1.clientInvoices.id, invoice.id));
            return mirror;
        }
        catch (err) {
            // Optional integration — log and fall back to the local draft.
            this.logger.warn(`Stripe push failed for invoice ${invoice.id}; keeping local draft: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }
};
exports.ClientInvoicingService = ClientInvoicingService;
exports.ClientInvoicingService = ClientInvoicingService = ClientInvoicingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __param(1, (0, common_1.Inject)(stripe_provider_1.STRIPE_CLIENT)),
    __metadata("design:paramtypes", [Object, Object])
], ClientInvoicingService);
//# sourceMappingURL=client-invoicing.service.js.map