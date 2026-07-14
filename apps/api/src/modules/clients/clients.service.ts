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
    const trimmed = (name ?? '').trim()
    if (!trimmed) throw new BadRequestException('Client name is required')
    const [row] = await this.db
      .insert(clients)
      .values({ workspaceId, name: trimmed, contactEmail: contactEmail?.trim() || null, createdById })
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
