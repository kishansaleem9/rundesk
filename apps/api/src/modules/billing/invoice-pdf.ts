// App-side branded invoice PDF (Plan §14.1). Reuses the dependency-free,
// text-only PDF writer from the reports module (renderReportPdf / tableToLines)
// so we ship a real PDF receipt without pulling in puppeteer/pdfkit. This keeps
// invoice generation self-contained in the billing module while sharing the one
// PDF-rendering idiom used everywhere else in the app.

import { renderReportPdf, tableToLines } from '../reports/pdf'

/** A single billed line item (amount in the currency's minor unit, e.g. cents). */
export type InvoiceLineItem = {
  description: string
  amount: number
}

/** Everything the invoice PDF needs — derived from a Stripe invoice + workspace. */
export type InvoicePdfData = {
  /** Human-facing invoice number (Stripe `number`), falling back to the id. */
  invoiceNumber: string
  workspaceName: string
  /** Who the invoice is billed to (email / name); optional. */
  billTo?: string | null
  /** Stripe invoice status, e.g. 'paid'. */
  status: string
  /** ISO-4217 currency code (e.g. 'usd'). */
  currency: string
  /** Total amount in the currency's minor unit (cents). */
  amountTotal: number
  /** Issue date (invoice.created). */
  issuedAt: Date
  /** Line items; when empty a single "Subscription" line for the total is used. */
  lines?: InvoiceLineItem[]
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  usd: '$',
  eur: '€',
  gbp: '£',
  cad: 'CA$',
  aud: 'A$',
}

/** Format a minor-unit amount (cents) as e.g. "$20.00" / "12.50 SEK". */
export function formatMoney(minorUnits: number, currency: string): string {
  const code = String(currency || 'usd').toLowerCase()
  const major = (Number(minorUnits) || 0) / 100
  const value = major.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const symbol = CURRENCY_SYMBOLS[code]
  return symbol ? `${symbol}${value}` : `${value} ${code.toUpperCase()}`
}

/**
 * Render a branded Rundesk invoice to a PDF Buffer. Text-only (Helvetica),
 * mirroring the reports PDF: a header block (number / date / bill-to / status)
 * followed by an itemized table and the total.
 */
export function renderInvoicePdf(data: InvoicePdfData): Buffer {
  const issued = data.issuedAt instanceof Date && !Number.isNaN(data.issuedAt.getTime())
    ? data.issuedAt
    : new Date()
  const issuedLabel = issued.toISOString().slice(0, 10)

  const items: InvoiceLineItem[] =
    data.lines && data.lines.length > 0
      ? data.lines
      : [{ description: 'Subscription', amount: data.amountTotal }]

  const header: string[] = [
    'Rundesk',
    '',
    `Invoice: ${data.invoiceNumber}`,
    `Issued: ${issuedLabel}`,
    `Billed to: ${data.workspaceName}${data.billTo ? ` (${data.billTo})` : ''}`,
    `Status: ${String(data.status || '').toUpperCase()}`,
    '',
  ]

  const table = tableToLines(
    ['Description', 'Amount'],
    items.map((it) => [it.description, formatMoney(it.amount, data.currency)]),
  )

  const totals: string[] = [
    '',
    `Total: ${formatMoney(data.amountTotal, data.currency)}`,
    '',
    'Thank you for your business.',
  ]

  return renderReportPdf(`Rundesk Invoice ${data.invoiceNumber}`, [...header, ...table, ...totals])
}
