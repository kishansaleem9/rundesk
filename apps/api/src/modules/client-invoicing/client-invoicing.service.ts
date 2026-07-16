import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { and, desc, eq, inArray, isNull, isNotNull } from 'drizzle-orm'
import type Stripe from 'stripe'
import {
  clientInvoices,
  clientInvoiceLineItems,
  timeEntries,
  tasks,
  lists,
  projects,
  spaces,
  clients,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { STRIPE_CLIENT } from '../billing/stripe.provider'

/**
 * Default billable rate applied when the caller supplies none.
 *
 * We deliberately looked for a stored rate: neither `projects` nor `clients`
 * carries a billable-rate column (projects only has `default_billable`, a
 * boolean). So the rate is an input — `opts.ratePerHourCents` — and this
 * constant ($100.00/hour) is the sensible fallback when it is omitted.
 */
export const DEFAULT_RATE_PER_HOUR_CENTS = 10_000

/** Options for {@link ClientInvoicingService.generateFromProject}. */
export type GenerateInvoiceOpts = {
  /** Billable rate in cents per hour. Defaults to {@link DEFAULT_RATE_PER_HOUR_CENTS}. */
  ratePerHourCents?: number
  /** ISO currency (minor unit == cents). Defaults to 'usd'. */
  currency?: string
  /** Days until the invoice is due (stamped as `due_at`). Defaults to 30. */
  dueInDays?: number
  /** Free-text note stored on the invoice. */
  notes?: string
  /** The user generating the invoice (stamped as `created_by_id`). */
  createdById?: string
}

/** One rolled-up billable-time line, before it is written to the DB. */
type BuiltLine = {
  description: string
  quantityMinutes: number
  unitAmountCents: number
  amountCents: number
  timeEntryIds: string[]
}

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
@Injectable()
export class ClientInvoicingService {
  private readonly logger = new Logger(ClientInvoicingService.name)

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    // Reuses the billing module's Stripe provider: resolves to `null` when
    // STRIPE_SECRET_KEY is not configured, so the push degrades gracefully.
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
  ) {}

  /** True when a Stripe client is available (STRIPE_SECRET_KEY is configured). */
  private stripeConfigured(): boolean {
    return this.stripe !== null
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
  async generateFromProject(workspaceId: string, projectId: string, opts: GenerateInvoiceOpts = {}) {
    const ratePerHourCents =
      typeof opts.ratePerHourCents === 'number' && opts.ratePerHourCents >= 0
        ? Math.round(opts.ratePerHourCents)
        : DEFAULT_RATE_PER_HOUR_CENTS
    const currency = (opts.currency ?? 'usd').toLowerCase()

    // Resolve the project inside this workspace (via its space) and require a
    // client to bill to.
    const [project] = await this.db
      .select({ id: projects.id, name: projects.name, clientId: projects.clientId })
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(projects.id, projectId), eq(spaces.workspaceId, workspaceId)))
      .limit(1)
    if (!project) throw new NotFoundException('Project not found')
    if (!project.clientId) {
      throw new BadRequestException('This project has no client to bill — assign a client first')
    }

    const [client] = await this.db
      .select({ id: clients.id, name: clients.name, contactEmail: clients.contactEmail })
      .from(clients)
      .where(and(eq(clients.id, project.clientId), eq(clients.workspaceId, workspaceId)))
      .limit(1)
    if (!client) throw new BadRequestException('The project client no longer exists')

    // Billable + not-yet-invoiced + has a duration, for tasks in this project.
    const rows = await this.db
      .select({
        entryId: timeEntries.id,
        durationSec: timeEntries.durationSec,
        isBillable: timeEntries.isBillable,
        clientInvoiceId: timeEntries.clientInvoiceId,
        taskId: tasks.id,
        taskTitle: tasks.title,
      })
      .from(timeEntries)
      .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .where(
        and(
          eq(lists.projectId, projectId),
          eq(timeEntries.isBillable, true),
          isNull(timeEntries.clientInvoiceId),
          isNotNull(timeEntries.durationSec),
        ),
      )

    // The WHERE already filters, but re-check in memory so the roll-up can never
    // include a non-billable, already-invoiced, or zero-duration entry.
    const billable = rows.filter(
      (r) => r.isBillable && !r.clientInvoiceId && (r.durationSec ?? 0) > 0,
    )
    if (billable.length === 0) {
      throw new BadRequestException('No unbilled billable time entries for this project')
    }

    const { lines, subtotalCents, entryIds } = this.rollUp(billable, ratePerHourCents)
    const totalCents = subtotalCents // no tax/discount modelled yet

    const now = new Date()
    const dueAt = new Date(now.getTime() + (opts.dueInDays ?? 30) * 24 * 60 * 60 * 1000)

    const [invoice] = await this.db
      .insert(clientInvoices)
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
      .returning()

    const insertedLines = await this.db
      .insert(clientInvoiceLineItems)
      .values(
        lines.map((l) => ({
          invoiceId: invoice.id,
          description: l.description,
          quantityMinutes: l.quantityMinutes,
          unitAmountCents: l.unitAmountCents,
          amountCents: l.amountCents,
          timeEntryIds: l.timeEntryIds,
          createdAt: now,
        })),
      )
      .returning()

    // Stamp every included entry so it is never rolled into another invoice.
    // Drizzle UPDATE straight on the time_entries table (time-entries.service
    // is intentionally untouched).
    await this.db
      .update(timeEntries)
      .set({ clientInvoiceId: invoice.id, updatedAt: now })
      .where(inArray(timeEntries.id, entryIds))

    // Best-effort Stripe push — never throws; a failure leaves the local draft.
    const stripeResult = await this.pushToStripe(invoice, client, lines, currency)

    return {
      ...invoice,
      ...(stripeResult ?? {}),
      lineItems: insertedLines,
    }
  }

  /** Group entries by task into priced line items and total them. */
  private rollUp(
    rows: Array<{ entryId: string; durationSec: number | null; taskId: string; taskTitle: string }>,
    ratePerHourCents: number,
  ) {
    const byTask = new Map<string, { title: string; seconds: number; entryIds: string[] }>()
    for (const r of rows) {
      const g = byTask.get(r.taskId) ?? { title: r.taskTitle, seconds: 0, entryIds: [] }
      g.seconds += r.durationSec ?? 0
      g.entryIds.push(r.entryId)
      byTask.set(r.taskId, g)
    }

    const lines: BuiltLine[] = []
    let subtotalCents = 0
    for (const g of byTask.values()) {
      const quantityMinutes = Math.round(g.seconds / 60)
      // `unit_amount_cents` holds the hourly rate applied to the line; the line
      // amount is that rate pro-rated over the billed minutes, rounded to a cent.
      const amountCents = Math.round((quantityMinutes / 60) * ratePerHourCents)
      lines.push({
        description: g.title,
        quantityMinutes,
        unitAmountCents: ratePerHourCents,
        amountCents,
        timeEntryIds: g.entryIds,
      })
      subtotalCents += amountCents
    }

    const entryIds = rows.map((r) => r.entryId)
    return { lines, subtotalCents, entryIds }
  }

  /** A short, human-friendly invoice number, e.g. INV-8F3A1C7D. */
  private generateNumber(): string {
    return `INV-${randomBytes(4).toString('hex').toUpperCase()}`
  }

  // ── Reads ───────────────────────────────────────────────────────────────────

  /** List a workspace's client invoices, newest first. */
  list(workspaceId: string) {
    return this.db
      .select()
      .from(clientInvoices)
      .where(eq(clientInvoices.workspaceId, workspaceId))
      .orderBy(desc(clientInvoices.createdAt))
  }

  /** Fetch one invoice (workspace-scoped) with its line items. */
  async get(workspaceId: string, id: string) {
    const invoice = await this.loadInvoice(workspaceId, id)
    const lineItems = await this.db
      .select()
      .from(clientInvoiceLineItems)
      .where(eq(clientInvoiceLineItems.invoiceId, id))
      .orderBy(clientInvoiceLineItems.createdAt)
    return { ...invoice, lineItems }
  }

  // ── State transitions ─────────────────────────────────────────────────────────

  /** Mark an invoice as sent (stamps `issued_at` the first time). */
  async markSent(workspaceId: string, id: string) {
    const invoice = await this.loadInvoice(workspaceId, id)
    return this.setStatus(id, 'sent', { issuedAt: invoice.issuedAt ?? new Date() })
  }

  /** Mark an invoice as paid. */
  async markPaid(workspaceId: string, id: string) {
    await this.loadInvoice(workspaceId, id)
    return this.setStatus(id, 'paid')
  }

  /**
   * Void an invoice AND release its time entries (clear their
   * `client_invoice_id`) so they become billable again on a future invoice.
   */
  async void(workspaceId: string, id: string) {
    await this.loadInvoice(workspaceId, id)
    const updated = await this.setStatus(id, 'void')
    await this.db
      .update(timeEntries)
      .set({ clientInvoiceId: null, updatedAt: new Date() })
      .where(eq(timeEntries.clientInvoiceId, id))
    return updated
  }

  private async setStatus(id: string, status: string, extra: Record<string, unknown> = {}) {
    const [updated] = await this.db
      .update(clientInvoices)
      .set({ status, updatedAt: new Date(), ...extra })
      .where(eq(clientInvoices.id, id))
      .returning()
    return updated
  }

  private async loadInvoice(workspaceId: string, id: string) {
    const [invoice] = await this.db
      .select()
      .from(clientInvoices)
      .where(and(eq(clientInvoices.id, id), eq(clientInvoices.workspaceId, workspaceId)))
      .limit(1)
    if (!invoice) throw new NotFoundException('Invoice not found')
    return invoice
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
  private async pushToStripe(
    invoice: { id: string },
    client: { name: string; contactEmail: string | null },
    lines: BuiltLine[],
    currency: string,
  ): Promise<{ stripeInvoiceId: string; hostedUrl: string | null } | null> {
    if (!this.stripeConfigured() || !this.stripe || !client.contactEmail) return null
    try {
      const customer = await this.stripe.customers.create({
        email: client.contactEmail,
        name: client.name,
      })
      for (const line of lines) {
        await this.stripe.invoiceItems.create({
          customer: customer.id,
          amount: line.amountCents,
          currency,
          description: line.description,
        })
      }
      const created = await this.stripe.invoices.create({
        customer: customer.id,
        collection_method: 'send_invoice',
        days_until_due: 30,
        auto_advance: false,
        metadata: { rundeskInvoiceId: invoice.id },
      })
      const finalized = await this.stripe.invoices.finalizeInvoice(created.id)

      const mirror = {
        stripeInvoiceId: finalized.id,
        hostedUrl: finalized.hosted_invoice_url ?? null,
      }
      await this.db
        .update(clientInvoices)
        .set({ ...mirror, updatedAt: new Date() })
        .where(eq(clientInvoices.id, invoice.id))
      return mirror
    } catch (err) {
      // Optional integration — log and fall back to the local draft.
      this.logger.warn(
        `Stripe push failed for invoice ${invoice.id}; keeping local draft: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      return null
    }
  }
}
