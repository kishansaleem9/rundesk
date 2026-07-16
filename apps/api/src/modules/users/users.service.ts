import { Injectable, Inject, UnauthorizedException, BadRequestException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import * as bcrypt from 'bcryptjs'
import { users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { R2Service } from '../../common/storage/r2.service'

/** Locales the web app ships translations for (Plan §13). */
export const SUPPORTED_LOCALES = ['en', 'es', 'ar', 'ur'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

/** Image content types accepted for avatar uploads, mapped to a file extension. */
const AVATAR_CONTENT_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** Hard cap on an uploaded avatar image (Plan §1.2). */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024 // 5 MB

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private readonly r2: R2Service,
  ) {}

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

  /**
   * Presign a direct-to-R2 PUT for a user's avatar image (Plan §1.2). Mirrors
   * the clip/attachment presign flow: validate the image type + size, hand back
   * a short-lived upload URL plus the public URL the client stores via
   * PATCH /users/me. Keys live under `avatars/<userId>-<rand>.<ext>`.
   */
  async createAvatarUploadUrl(userId: string, body: { contentType: string; sizeBytes?: number }) {
    if (!this.r2.configured) throw new BadRequestException('R2 storage is not configured')
    const contentType = (body.contentType || '').toLowerCase()
    const ext = AVATAR_CONTENT_TYPES[contentType]
    if (!ext) {
      throw new BadRequestException('Only image files (PNG, JPEG, WebP, or GIF) are allowed')
    }
    if (body.sizeBytes != null && Number.isFinite(body.sizeBytes) && body.sizeBytes > MAX_AVATAR_BYTES) {
      const mb = Math.round(MAX_AVATAR_BYTES / (1024 * 1024))
      throw new BadRequestException(`Avatar image exceeds the ${mb} MB limit`)
    }
    const key = `avatars/${userId}-${randomBytes(8).toString('hex')}.${ext}`
    const uploadUrl = await this.r2.presignPutObject(key, contentType, { uploadedby: userId })
    // Resolve the browser-facing URL the same way clips/attachments do; with a
    // public R2/CDN domain this is a stable URL suitable for persisting.
    const publicUrl = await this.r2.getObjectUrl(key)
    return { uploadUrl, publicUrl, storageKey: key }
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
