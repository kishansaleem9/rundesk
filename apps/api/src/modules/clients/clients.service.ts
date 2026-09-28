import { Injectable, Inject, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { and, asc, count, eq } from 'drizzle-orm'
import { clients, clientInvoices } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

@Injectable()
export class ClientsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  list(workspaceId: string) {
    return this.db
      .select({
        id: clients.id,
        name: clients.name,
        contactEmail: clients.contactEmail,
        createdById: clients.createdById,
        createdAt: clients.createdAt,
      })
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId))
      .orderBy(asc(clients.name))
  }

  async create(workspaceId: string, name: string, contactEmail: string | undefined, createdById: string) {
    // Reject a non-string name up front — `.trim()` on a number/object threw and
    // surfaced as a 500 instead of a 400.
    if (typeof name !== 'string' || !name.trim()) throw new BadRequestException('Client name is required')
    const trimmed = name.trim()
    const email = typeof contactEmail === 'string' ? contactEmail.trim() || null : null
    const [row] = await this.db
      .insert(clients)
      .values({ workspaceId, name: trimmed, contactEmail: email, createdById })
      .onConflictDoNothing()
      .returning()
    if (!row) throw new BadRequestException('A client with that name already exists')
    return row
  }

  /**
   * A CLIENT WITH INVOICES IS NOT DELETED. `client_invoices.client_id` cascades,
   * and so do the invoices' lines, so deleting a client deleted its billing
   * records and returned their time to unbilled — for anyone holding
   * `client.manage`, every manager by default, with or without
   * `workspace.billing` (`found-28-sep/client-delete-cascades-invoices`). And a
   * client that is not there answered `{ ok: true }`.
   */
  async remove(clientId: string, workspaceId: string) {
    const [row] = await this.db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
      .limit(1)
    if (!row) throw new NotFoundException('Client not found')
    const [{ n }] = await this.db.select({ n: count() }).from(clientInvoices).where(eq(clientInvoices.clientId, clientId))
    if (Number(n) > 0) {
      throw new ConflictException(`${row.name} has ${n} invoice(s), which deleting the client would delete with it — void or remove the invoices first`)
    }
    await this.db.delete(clients).where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
    return { ok: true }
  }
}
