import { Injectable, Inject, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common'
import { and, eq, desc, isNull, or } from 'drizzle-orm'
import * as crypto from 'crypto'
import * as OTPAuth from 'otpauth'
import * as bcrypt from 'bcryptjs'
import { userTotpSecrets, apiKeys, auditLogs, users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

// ─── TOTP / 2FA ───────────────────────────────────────────────────────────────

@Injectable()
export class SecurityService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  // ── TOTP setup ──────────────────────────────────────────────────────────────
  async setupTotp(userId: string): Promise<{ otpauthUrl: string; secret: string; qrCodeUrl: string }> {
    const [user] = await this.db.select({ email: users.email, displayName: users.displayName }).from(users).where(eq(users.id, userId))
    if (!user) throw new NotFoundException('User not found')

    // Delete any unverified existing secret
    await this.db.delete(userTotpSecrets).where(and(eq(userTotpSecrets.userId, userId), eq(userTotpSecrets.verified, false)))

    const totp = new OTPAuth.TOTP({
      issuer: 'Rundesk',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromUTF8(crypto.randomBytes(20).toString('hex').slice(0, 32)),
    })

    const secret = totp.secret.base32

    await this.db.insert(userTotpSecrets).values({ userId, secret, verified: false })

    const otpauthUrl = totp.toString()
    // Google Charts QR code
    const qrCodeUrl = `https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=${encodeURIComponent(otpauthUrl)}`

    return { otpauthUrl, secret, qrCodeUrl }
  }

  async verifyAndActivateTotp(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const [row] = await this.db.select().from(userTotpSecrets).where(eq(userTotpSecrets.userId, userId))
    if (!row) throw new BadRequestException('TOTP setup not started')

    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(row.secret), algorithm: 'SHA1', digits: 6, period: 30 })
    const valid = totp.validate({ token: code, window: 1 })
    if (valid === null) throw new BadRequestException('Invalid TOTP code')

    // Generate 10 backup codes
    const rawCodes = Array.from({ length: 10 }, () => crypto.randomBytes(5).toString('hex').toUpperCase())
    const hashedCodes = await Promise.all(rawCodes.map((c) => bcrypt.hash(c, 10)))

    await this.db
      .update(userTotpSecrets)
      .set({ verified: true, verifiedAt: new Date(), backupCodes: hashedCodes })
      .where(eq(userTotpSecrets.userId, userId))

    return { backupCodes: rawCodes }
  }

  async validateTotp(userId: string, code: string): Promise<boolean> {
    const [row] = await this.db.select().from(userTotpSecrets).where(and(eq(userTotpSecrets.userId, userId), eq(userTotpSecrets.verified, true)))
    if (!row) return true // 2FA not set up — allow through

    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(row.secret), algorithm: 'SHA1', digits: 6, period: 30 })
    const valid = totp.validate({ token: code, window: 1 })
    if (valid !== null) return true

    // Check backup codes
    const codes = (row.backupCodes as string[]) ?? []
    for (let i = 0; i < codes.length; i++) {
      if (await bcrypt.compare(code, codes[i])) {
        // Remove used backup code
        const remaining = codes.filter((_, idx) => idx !== i)
        await this.db.update(userTotpSecrets).set({ backupCodes: remaining }).where(eq(userTotpSecrets.userId, userId))
        return true
      }
    }
    return false
  }

  async disableTotp(userId: string): Promise<void> {
    await this.db.delete(userTotpSecrets).where(eq(userTotpSecrets.userId, userId))
  }

  async getTotpStatus(userId: string) {
    const [row] = await this.db.select({ verified: userTotpSecrets.verified }).from(userTotpSecrets).where(eq(userTotpSecrets.userId, userId))
    return { enabled: row?.verified ?? false }
  }

  // ─── API Keys ──────────────────────────────────────────────────────────────

  async listApiKeys(workspaceId: string) {
    return this.db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scope: apiKeys.scope,
        isRevoked: apiKeys.isRevoked,
        lastUsedAt: apiKeys.lastUsedAt,
        requestCount: apiKeys.requestCount,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.workspaceId, workspaceId))
      .orderBy(desc(apiKeys.createdAt))
  }

  async createApiKey(workspaceId: string, userId: string, name: string, scope = 'read_write') {
    // Generate a secure random key: rd_live_<32 hex chars>
    const raw = `rd_live_${crypto.randomBytes(16).toString('hex')}`
    const keyPrefix = raw.slice(0, 12) // rd_live_xxxx
    const keyHash = crypto.createHash('sha256').update(raw).digest('hex')

    const [key] = await this.db
      .insert(apiKeys)
      .values({ workspaceId, createdById: userId, name, keyHash, keyPrefix, scope })
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scope: apiKeys.scope,
        createdAt: apiKeys.createdAt,
      })

    // Return the raw key only this once — never stored in plaintext
    return { ...key, key: raw }
  }

  async revokeApiKey(keyId: string) {
    await this.db.update(apiKeys).set({ isRevoked: true }).where(eq(apiKeys.id, keyId))
    return { ok: true }
  }

  async deleteApiKey(keyId: string) {
    await this.db.delete(apiKeys).where(eq(apiKeys.id, keyId))
    return { ok: true }
  }

  // ─── Audit Logs ───────────────────────────────────────────────────────────

  async logAuditEvent(opts: {
    workspaceId?: string
    actorId?: string
    actorEmail?: string
    action: string
    resourceType?: string
    resourceId?: string
    description: string
    metadata?: Record<string, string | number | boolean | null>
    ipAddress?: string
    userAgent?: string
  }) {
    await this.db.insert(auditLogs).values(opts)
  }

  async getAuditLogs(
    workspaceId: string,
    opts: { page?: number; limit?: number; action?: string } = {},
  ) {
    const limit = Math.min(opts.limit ?? 50, 200)
    const offset = ((opts.page ?? 1) - 1) * limit

    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.workspaceId, workspaceId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset)

    return rows
  }
}
