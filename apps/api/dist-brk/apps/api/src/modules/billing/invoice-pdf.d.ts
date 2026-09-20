/** A single billed line item (amount in the currency's minor unit, e.g. cents). */
export type InvoiceLineItem = {
    description: string;
    amount: number;
};
/** Everything the invoice PDF needs — derived from a Stripe invoice + workspace. */
export type InvoicePdfData = {
    /** Human-facing invoice number (Stripe `number`), falling back to the id. */
    invoiceNumber: string;
    workspaceName: string;
    /** Who the invoice is billed to (email / name); optional. */
    billTo?: string | null;
    /** Stripe invoice status, e.g. 'paid'. */
    status: string;
    /** ISO-4217 currency code (e.g. 'usd'). */
    currency: string;
    /** Total amount in the currency's minor unit (cents). */
    amountTotal: number;
    /** Issue date (invoice.created). */
    issuedAt: Date;
    /** Line items; when empty a single "Subscription" line for the total is used. */
    lines?: InvoiceLineItem[];
};
/** Format a minor-unit amount (cents) as e.g. "$20.00" / "12.50 SEK". */
export declare function formatMoney(minorUnits: number, currency: string): string;
/**
 * Render a branded Rundesk invoice to a PDF Buffer. Text-only (Helvetica),
 * mirroring the reports PDF: a header block (number / date / bill-to / status)
 * followed by an itemized table and the total.
 */
export declare function renderInvoicePdf(data: InvoicePdfData): Buffer;
