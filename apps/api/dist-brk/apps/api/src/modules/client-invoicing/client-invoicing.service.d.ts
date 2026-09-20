import type Stripe from 'stripe';
import type { Db } from '@rundesk/db';
/**
 * Default billable rate applied when the caller supplies none.
 *
 * We deliberately looked for a stored rate: neither `projects` nor `clients`
 * carries a billable-rate column (projects only has `default_billable`, a
 * boolean). So the rate is an input — `opts.ratePerHourCents` — and this
 * constant ($100.00/hour) is the sensible fallback when it is omitted.
 */
export declare const DEFAULT_RATE_PER_HOUR_CENTS = 10000;
/** Options for {@link ClientInvoicingService.generateFromProject}. */
export type GenerateInvoiceOpts = {
    /** Billable rate in cents per hour. Defaults to {@link DEFAULT_RATE_PER_HOUR_CENTS}. */
    ratePerHourCents?: number;
    /** ISO currency (minor unit == cents). Defaults to 'usd'. */
    currency?: string;
    /** Days until the invoice is due (stamped as `due_at`). Defaults to 30. */
    dueInDays?: number;
    /** Free-text note stored on the invoice. */
    notes?: string;
    /** The user generating the invoice (stamped as `created_by_id`). */
    createdById?: string;
    /** The generating user's global role, for the per-item task-privacy check. */
    createdByRole?: string | null;
};
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
export declare class ClientInvoicingService {
    private readonly db;
    private readonly stripe;
    private readonly logger;
    constructor(db: Db, stripe: Stripe | null);
    /** True when a Stripe client is available (STRIPE_SECRET_KEY is configured). */
    private stripeConfigured;
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
    generateFromProject(workspaceId: string, projectId: string, opts?: GenerateInvoiceOpts): Promise<{
        lineItems: {
            id: string;
            createdAt: Date;
            description: string;
            invoiceId: string;
            quantityMinutes: number;
            unitAmountCents: number;
            amountCents: number;
            timeEntryIds: string[];
        }[];
        stripeInvoiceId: string | null;
        hostedUrl: string | null;
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        createdById: string | null;
        clientId: string;
        projectId: string | null;
        status: string;
        notes: string | null;
        dueAt: Date | null;
        currency: string;
        subtotalCents: number;
        totalCents: number;
        issuedAt: Date | null;
    }>;
    /** Group entries by task into priced line items and total them. */
    private rollUp;
    /** A short, human-friendly invoice number, e.g. INV-8F3A1C7D. */
    private generateNumber;
    /** List a workspace's client invoices, newest first. */
    list(workspaceId: string): Omit<import("drizzle-orm/pg-core").PgSelectBase<"client_invoices", {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "client_invoices";
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
        workspaceId: import("drizzle-orm/pg-core").PgColumn<{
            name: "workspace_id";
            tableName: "client_invoices";
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
        clientId: import("drizzle-orm/pg-core").PgColumn<{
            name: "client_id";
            tableName: "client_invoices";
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
        projectId: import("drizzle-orm/pg-core").PgColumn<{
            name: "project_id";
            tableName: "client_invoices";
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
        number: import("drizzle-orm/pg-core").PgColumn<{
            name: "number";
            tableName: "client_invoices";
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
        status: import("drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "client_invoices";
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
        currency: import("drizzle-orm/pg-core").PgColumn<{
            name: "currency";
            tableName: "client_invoices";
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
        subtotalCents: import("drizzle-orm/pg-core").PgColumn<{
            name: "subtotal_cents";
            tableName: "client_invoices";
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
        totalCents: import("drizzle-orm/pg-core").PgColumn<{
            name: "total_cents";
            tableName: "client_invoices";
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
        notes: import("drizzle-orm/pg-core").PgColumn<{
            name: "notes";
            tableName: "client_invoices";
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
        stripeInvoiceId: import("drizzle-orm/pg-core").PgColumn<{
            name: "stripe_invoice_id";
            tableName: "client_invoices";
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
        hostedUrl: import("drizzle-orm/pg-core").PgColumn<{
            name: "hosted_url";
            tableName: "client_invoices";
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
        issuedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "issued_at";
            tableName: "client_invoices";
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
        dueAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "due_at";
            tableName: "client_invoices";
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
        createdById: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_by_id";
            tableName: "client_invoices";
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
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "client_invoices";
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
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "client_invoices";
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
    }, "single", Record<"client_invoices", "not-null">, false, "where" | "orderBy", {
        id: string;
        workspaceId: string;
        clientId: string;
        projectId: string | null;
        number: string;
        status: string;
        currency: string;
        subtotalCents: number;
        totalCents: number;
        notes: string | null;
        stripeInvoiceId: string | null;
        hostedUrl: string | null;
        issuedAt: Date | null;
        dueAt: Date | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }[], {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "client_invoices";
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
        workspaceId: import("drizzle-orm/pg-core").PgColumn<{
            name: "workspace_id";
            tableName: "client_invoices";
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
        clientId: import("drizzle-orm/pg-core").PgColumn<{
            name: "client_id";
            tableName: "client_invoices";
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
        projectId: import("drizzle-orm/pg-core").PgColumn<{
            name: "project_id";
            tableName: "client_invoices";
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
        number: import("drizzle-orm/pg-core").PgColumn<{
            name: "number";
            tableName: "client_invoices";
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
        status: import("drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "client_invoices";
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
        currency: import("drizzle-orm/pg-core").PgColumn<{
            name: "currency";
            tableName: "client_invoices";
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
        subtotalCents: import("drizzle-orm/pg-core").PgColumn<{
            name: "subtotal_cents";
            tableName: "client_invoices";
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
        totalCents: import("drizzle-orm/pg-core").PgColumn<{
            name: "total_cents";
            tableName: "client_invoices";
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
        notes: import("drizzle-orm/pg-core").PgColumn<{
            name: "notes";
            tableName: "client_invoices";
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
        stripeInvoiceId: import("drizzle-orm/pg-core").PgColumn<{
            name: "stripe_invoice_id";
            tableName: "client_invoices";
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
        hostedUrl: import("drizzle-orm/pg-core").PgColumn<{
            name: "hosted_url";
            tableName: "client_invoices";
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
        issuedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "issued_at";
            tableName: "client_invoices";
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
        dueAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "due_at";
            tableName: "client_invoices";
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
        createdById: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_by_id";
            tableName: "client_invoices";
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
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "client_invoices";
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
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "client_invoices";
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
    }>, "where" | "orderBy">;
    /** Fetch one invoice (workspace-scoped) with its line items. */
    get(workspaceId: string, id: string): Promise<{
        lineItems: {
            id: string;
            invoiceId: string;
            description: string;
            quantityMinutes: number;
            unitAmountCents: number;
            amountCents: number;
            timeEntryIds: string[];
            createdAt: Date;
        }[];
        id: string;
        workspaceId: string;
        clientId: string;
        projectId: string | null;
        number: string;
        status: string;
        currency: string;
        subtotalCents: number;
        totalCents: number;
        notes: string | null;
        stripeInvoiceId: string | null;
        hostedUrl: string | null;
        issuedAt: Date | null;
        dueAt: Date | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /** Mark an invoice as sent (stamps `issued_at` the first time). */
    markSent(workspaceId: string, id: string): Promise<{
        id: string;
        workspaceId: string;
        clientId: string;
        projectId: string | null;
        number: string;
        status: string;
        currency: string;
        subtotalCents: number;
        totalCents: number;
        notes: string | null;
        stripeInvoiceId: string | null;
        hostedUrl: string | null;
        issuedAt: Date | null;
        dueAt: Date | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /** Mark an invoice as paid. */
    markPaid(workspaceId: string, id: string): Promise<{
        id: string;
        workspaceId: string;
        clientId: string;
        projectId: string | null;
        number: string;
        status: string;
        currency: string;
        subtotalCents: number;
        totalCents: number;
        notes: string | null;
        stripeInvoiceId: string | null;
        hostedUrl: string | null;
        issuedAt: Date | null;
        dueAt: Date | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /**
     * Void an invoice AND release its time entries (clear their
     * `client_invoice_id`) so they become billable again on a future invoice.
     */
    void(workspaceId: string, id: string): Promise<{
        id: string;
        workspaceId: string;
        clientId: string;
        projectId: string | null;
        number: string;
        status: string;
        currency: string;
        subtotalCents: number;
        totalCents: number;
        notes: string | null;
        stripeInvoiceId: string | null;
        hostedUrl: string | null;
        issuedAt: Date | null;
        dueAt: Date | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    private setStatus;
    private loadInvoice;
    /**
     * Push a freshly-generated invoice to Stripe: create a customer for the
     * client, add an invoice item per line, then create + finalize the Stripe
     * invoice and mirror `stripe_invoice_id` / `hosted_url` back onto our row.
     *
     * Returns the mirrored fields on success, or `null` when Stripe is not
     * configured / the client has no email / the push fails — the caller keeps the
     * local draft either way. Never throws.
     */
    private pushToStripe;
}
