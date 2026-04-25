import { Injectable, Inject } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

@Injectable()
export class UsersService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async findById(id: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, id))
    return user ?? null
  }

  async findByEmail(email: string) {
    const [user] = await this.db.select().from(users).where(eq(users.email, email))
    return user ?? null
  }

  async create(data: { email: string; displayName: string; passwordHash?: string; emailVerified?: boolean }) {
    const [user] = await this.db.insert(users).values(data).returning()
    return user
  }
}
