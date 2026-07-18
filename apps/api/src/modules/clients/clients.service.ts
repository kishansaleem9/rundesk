import { Injectable, Inject, BadRequestException } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'
import { clients } from '@rundesk/db'
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

  async remove(clientId: string, workspaceId: string) {
    await this.db.delete(clients).where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
    return { ok: true }
  }
}
