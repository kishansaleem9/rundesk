import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common'
import { and, eq, desc, or, like, gte, lte } from 'drizzle-orm'
import * as crypto from 'crypto'
import * as OTPAuth from 'otpauth'
import { userTotpSecrets, apiKeys, auditLogs, users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { passwords } from '../../common/security/password-hash'

/**
 * A backup code's hash cost. Not a password's 12: a code is 40 random bits, and
 * a sign-in with one compares it with up to ten stored codes in turn.
 */
const BACKUP_CODE_HASH_COST = 10

// ─── TOTP / 2FA ───────────────────────────────────────────────────────────────

@Injectable()
export class SecurityService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  // ── TOTP setup ──────────────────────────────────────────────────────────────
  async setupTotp(userId: string): Promise<{ otpauthUrl: string; secret: string }> {
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

    // Return the raw otpauth:// URI so the CLIENT renders the QR code locally.
    // We must never send the TOTP seed to a third party — the previous Google
    // Charts QR URL embedded the base32 secret in a request to
    // chart.googleapis.com (also a deprecated/dead API).
    const otpauthUrl = totp.toString()

    return { otpauthUrl, secret }
  }

  async verifyAndActivateTotp(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const [row] = await this.db.select().from(userTotpSecrets).where(eq(userTotpSecrets.userId, userId))
    if (!row) throw new BadRequestException('TOTP setup not started')

    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(row.secret), algorithm: 'SHA1', digits: 6, period: 30 })
    const valid = totp.validate({ token: code, window: 1 })
    if (valid === null) throw new BadRequestException('Invalid TOTP code')

    // Generate 10 backup codes
    const rawCodes = Array.from({ length: 10 }, () => crypto.randomBytes(5).toString('hex').toUpperCase())
    // On the workers, as every password hash is (`found-30-sep/password-hash-holds-the-event-loop`).
    const hashedCodes = await Promise.all(rawCodes.map((c) => passwords.hash(c, BACKUP_CODE_HASH_COST)))

    await this.db
      .update(userTotpSecrets)
      .set({ verified: true, verifiedAt: new Date(), backupCodes: hashedCodes })
      .where(eq(userTotpSecrets.userId, userId))

    await this.logAuditEvent({
      actorId: userId,
      action: '2fa.enabled',
      resourceType: 'user',
      resourceId: userId,
      description: 'Two-factor authentication enabled',
    })

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
      if (await passwords.compare(code, codes[i])) {
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
    await this.logAuditEvent({
      actorId: userId,
      action: '2fa.disabled',
      resourceType: 'user',
      resourceId: userId,
      description: 'Two-factor authentication disabled',
    })
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

  async createApiKey(workspaceId: string, userId: string, name: string, scope = 'read_write', ipAddress?: string) {
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

    await this.logAuditEvent({
      workspaceId,
      actorId: userId,
      action: 'api_key.created',
      resourceType: 'api_key',
      resourceId: key.id,
      description: `Created API key "${name}"`,
      metadata: { name, scope, keyPrefix },
      ipAddress,
    })

    // Return the raw key only this once — never stored in plaintext
    return { ...key, key: raw }
  }

  private async assertApiKeyOwnership(workspaceId: string, keyId: string) {
    const [row] = await this.db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.workspaceId, workspaceId)))
      .limit(1)
    if (!row) throw new NotFoundException('API key not found')
    return row
  }

  async revokeApiKey(workspaceId: string, keyId: string, actorId?: string, ipAddress?: string) {
    const row = await this.assertApiKeyOwnership(workspaceId, keyId)
    await this.db.update(apiKeys).set({ isRevoked: true }).where(eq(apiKeys.id, keyId))
    await this.logAuditEvent({
      workspaceId,
      actorId,
      action: 'api_key.revoked',
      resourceType: 'api_key',
      resourceId: keyId,
      description: `Revoked API key "${row.name}"`,
      metadata: { name: row.name, keyPrefix: row.keyPrefix },
      ipAddress,
    })
    return { ok: true }
  }

  async deleteApiKey(workspaceId: string, keyId: string, actorId?: string, ipAddress?: string) {
    const row = await this.assertApiKeyOwnership(workspaceId, keyId)
    await this.db.delete(apiKeys).where(eq(apiKeys.id, keyId))
    await this.logAuditEvent({
      workspaceId,
      actorId,
      action: 'api_key.deleted',
      resourceType: 'api_key',
      resourceId: keyId,
      description: `Deleted API key "${row.name}"`,
      metadata: { name: row.name, keyPrefix: row.keyPrefix },
      ipAddress,
    })
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

  private auditFilters(
    workspaceId: string,
    opts: { action?: string; actionPrefix?: string; actionPrefixes?: string[]; actorId?: string; from?: Date; to?: Date },
  ) {
    const filters = [eq(auditLogs.workspaceId, workspaceId)]
    if (opts.action) filters.push(eq(auditLogs.action, opts.action))
    // Action-type grouping (Plan §13.3): a group like "Members" spans several
    // prefixes (member., role.), so match ANY of the supplied prefixes. Single
    // `actionPrefix` is folded in for backward compatibility.
    const prefixes = [...(opts.actionPrefix ? [opts.actionPrefix] : []), ...(opts.actionPrefixes ?? [])].filter(Boolean)
    if (prefixes.length) {
      const likes = prefixes.map((p) => like(auditLogs.action, `${p}%`))
      filters.push(likes.length === 1 ? likes[0] : or(...likes)!)
    }
    if (opts.actorId) filters.push(eq(auditLogs.actorId, opts.actorId))
    if (opts.from) filters.push(gte(auditLogs.createdAt, opts.from))
    if (opts.to) filters.push(lte(auditLogs.createdAt, opts.to))
    return filters
  }

  async getAuditLogs(
    workspaceId: string,
    opts: {
      page?: number
      limit?: number
      action?: string
      actionPrefix?: string
      actionPrefixes?: string[]
      actorId?: string
      from?: Date
      to?: Date
    } = {},
  ) {
    const limit = Math.min(opts.limit ?? 50, 200)
    const offset = ((opts.page ?? 1) - 1) * limit

    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(and(...this.auditFilters(workspaceId, opts)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset)

    return rows
  }

  /** Export the (filtered) audit trail as a CSV string (Plan §13.3). */
  async exportAuditLogsCsv(
    workspaceId: string,
    opts: { action?: string; actionPrefix?: string; actionPrefixes?: string[]; actorId?: string; from?: Date; to?: Date } = {},
  ) {
    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(and(...this.auditFilters(workspaceId, opts)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(10000)

    const esc = (v: unknown) => {
      let s = String(v ?? '')
      // Neutralize spreadsheet formula/CSV injection: a cell that begins with
      // =, +, -, @, tab, or CR can be executed as a formula by Excel/Sheets.
      // Prefix such values with a single quote before quoting the field.
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
      return `"${s.replace(/"/g, '""')}"`
    }
    const header = ['Timestamp', 'Actor', 'Action', 'Resource', 'Description', 'IP address']
    const lines = rows.map((r) =>
      [
        (r.createdAt as Date).toISOString(),
        r.actorEmail ?? r.actorId ?? '',
        r.action,
        [r.resourceType, r.resourceId].filter(Boolean).join(':'),
        r.description,
        r.ipAddress ?? '',
      ]
        .map(esc)
        .join(','),
    )
    return [header.map(esc).join(','), ...lines].join('\n')
  }
}
