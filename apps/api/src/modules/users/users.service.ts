import { Injectable, Inject, UnauthorizedException, BadRequestException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import * as bcrypt from 'bcryptjs'
import { users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

/** Locales the web app ships translations for (Plan §13). */
export const SUPPORTED_LOCALES = ['en', 'es', 'ar'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

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

  async updateProfile(
    userId: string,
    patch: { displayName?: string; bio?: string | null; timezone?: string; avatarUrl?: string | null; locale?: string },
  ) {
    if (patch.locale !== undefined && !SUPPORTED_LOCALES.includes(patch.locale as SupportedLocale)) {
      throw new BadRequestException(`Unsupported locale: ${patch.locale}`)
    }
    const [row] = await this.db
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning()
    if (!row) throw new BadRequestException('User not found')
    return this.publicProfile(row)
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (newPassword.length < 8) throw new BadRequestException('Password must be at least 8 characters')
    const user = await this.findById(userId)
    if (!user) throw new BadRequestException('User not found')
    if (!user.passwordHash) throw new BadRequestException('Account uses SSO; set a password via reset flow')
    const ok = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!ok) throw new UnauthorizedException('Current password is incorrect')
    const passwordHash = await bcrypt.hash(newPassword, 10)
    await this.db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId))
    return { ok: true }
  }

  publicProfile(user: typeof users.$inferSelect) {
    const { passwordHash, ...rest } = user
    return rest
  }
}
