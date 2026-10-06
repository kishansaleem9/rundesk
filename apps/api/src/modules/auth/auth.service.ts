import { Injectable, UnauthorizedException, ConflictException, ForbiddenException, BadRequestException, Inject, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { randomUUID, randomBytes } from 'node:crypto'
import { and, eq, isNull, desc, sql } from 'drizzle-orm'
import { users, sessions, organizations, organizationMembers, workspaces, workspaceMembers, invitations, passwordResets, emailVerifications, taskTypes, featureFlags, DEFAULT_TASK_TYPES } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { signupFeatureRows } from './signup-features'
import { DB_TOKEN } from '../../common/database/database.module'
import { NO_ACCOUNT_HASH, passwords } from '../../common/security/password-hash'
import { hashRefreshToken } from '../../common/security/refresh-token'
import { clearLockoutIfUnlocked, countWrongPassword, type LockoutPolicy } from '../../common/security/lockout'
import { UsersService } from '../users/users.service'
import { WorkspacesService } from '../workspaces/workspaces.service'
import { FeatureFlagsService } from '../feature-flags/feature-flags.service'
import { EmailService } from '../email/email.service'
import { SecurityService } from '../security/security.service'
import { WorkspaceSecuritySettingsService } from '../security/workspace-security-settings.service'
import { isIpAllowed } from '../security/ip-allowlist.util'
import type { SignupDto } from './dto/signup.dto'

type SessionMeta = { userAgent?: string; ip?: string }
/** The session a refresh keeps: its row, and the hash of the refresh token presented for it. */
type RotateSession = { sessionId: string; refreshTokenHash: string }

function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 40) || 'workspace'
}

// One-way hash of a refresh token for storage/lookup; defined beside the
// password hasher so the users service can use it too, and re-exported here.
export { hashRefreshToken }

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private usersService: UsersService,
    private workspacesService: WorkspacesService,
    private jwtService: JwtService,
    private config: ConfigService,
    private featureFlagsService: FeatureFlagsService,
    private emailService: EmailService,
    private security: SecurityService,
    private securitySettings: WorkspaceSecuritySettingsService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email)
    /*
     * EVERY "INVALID CREDENTIALS" TAKES ONE HASH
     * (`found-30-sep/sign-in-time-tells-an-account`).
     *
     * An email with no account and an account with no password (it signs in
     * through SSO, Google or Microsoft only) were answered here before any
     * hashing, in 15–30 ms; a real account's wrong password after a compare at
     * cost 12, in about 400. The same words at two speeds said whether an
     * account exists. Each now compares the password with `NO_ACCOUNT_HASH`,
     * made at the same cost, and throws the answer away.
     */
    if (!user?.passwordHash) {
      await passwords.compare(password, NO_ACCOUNT_HASH)
      throw new UnauthorizedException('Invalid credentials')
    }

    /*
     * THE COMPARE STARTS NOW, BESIDE THE POLICY'S READ, on a worker: a real
     * account's refusal then takes a hash, not a hash and then the two
     * queries an email with no account never makes, and a locked account's
     * refusal waits for this compare instead of making a second one. Caught at
     * once so a failed read below does not leave its rejection unheard;
     * `await` still sees it.
     */
    const matches = passwords.compare(password, user.passwordHash)
    matches.catch(() => undefined)
    const { settings } = await this.securitySettings.getEffectiveForUser(user.id)
    const now = new Date()

    // Account currently locked from prior failed attempts (auto-releasing).
    // Enforcement stays server-side (a locked account cannot log in), but the
    // client always sees the SAME generic "Invalid credentials" message — a
    // distinct "account locked" response would let an attacker enumerate which
    // emails belong to real accounts. And in the same TIME: a lock answered
    // before any hashing said the account exists as plainly as the words would,
    // so the refusal waits for the account's compare and does not read it.
    if (settings.lockoutEnabled && user.lockedUntil && new Date(user.lockedUntil) > now) {
      await matches
      throw new UnauthorizedException('Invalid credentials')
    }

    if (!(await matches)) {
      // Counted, and the account locked at the threshold, server-side; the
      // client is told neither.
      if (settings.lockoutEnabled) await this.countWrongPassword(user.id, settings, now)
      throw new UnauthorizedException('Invalid credentials')
    }

    if (!user.isActive) throw new UnauthorizedException('Account is disabled')

    /*
     * A RIGHT PASSWORD IS REFUSED IF THE ACCOUNT LOCKED WHILE IT COMPARED
     * (`found-30-sep/a-burst-is-compared-before-the-lock`).
     *
     * A compare takes a hash's time, and the lock is read once (above) from the
     * account as it was read. So a burst of wrong passwords and the account's
     * right one, sent at once, each read an unlocked account; each was compared;
     * the wrong ones locked the account as they finished, and the right one
     * among them — read unlocked, compared true — signed in although the burst
     * had locked it. Measured on a lane: twenty wrong and the right one sent at
     * once signed in (200), the right one among them. The lockout counts the
     * wrong passwords (`countWrongPassword`, atomic), but the count bounded what
     * was counted, not whether a success stands against a lock set meanwhile.
     *
     * So a successful password clears the count ONLY IF the account is not locked
     * now, in one statement (`clearLockoutIfUnlocked`, its WHERE excludes a
     * locked account): a right password that finds the account locked — by this
     * very burst, or a prior window — is refused with the same generic words,
     * where a wrong one is counted. The lock is driven by FAILED attempts alone
     * (OWASP's ASVS 2.2.1: "no more than 100 failed attempts per hour … on a
     * single account"), so concurrent SUCCESSFUL sign-ins, however many at once,
     * all stand: none is a failure, so none locks the account.
     */
    if (settings.lockoutEnabled) {
      const cleared = await clearLockoutIfUnlocked(this.db, user.id, now)
      if (!cleared) throw new UnauthorizedException('Invalid credentials')
    } else if ((user.failedLoginAttempts ?? 0) > 0 || user.lockedUntil) {
      await this.db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id))
    }

    /*
     * A HASH MADE AT A LOWER COST IS MADE AGAIN, now that the password is known.
     * Changing a password in the profile hashed it at cost 10, and such an
     * account's wrong password answered in a quarter of the time the others
     * take. OWASP's password storage cheat sheet: "wait until the user next
     * authenticates, then re-hash their password with the new work factor".
     */
    if (passwords.needsRehash(user.passwordHash)) {
      const passwordHash = await passwords.hash(password)
      await this.db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id))
    }

    return user
  }

  /**
   * ONE WRONG PASSWORD, COUNTED IN ONE STATEMENT
   * (`found-30-sep/lockout-counts-overlapping-attempts-once`): the statement is
   * `common/security/lockout.ts`'s, which a password change's wrong current
   * password is counted by too (`found-30-sep/password-change-guesses-600-an-hour`),
   * so the two share one count per account. Answers the count and the lock as
   * the statement left them, or null when it counted nothing.
   */
  private async countWrongPassword(userId: string, policy: LockoutPolicy, now: Date) {
    return countWrongPassword(this.db, userId, policy, now)
  }

  /**
   * Second factor enforcement, run AFTER the password has been validated and
   * BEFORE any session token is issued.
   *
   * - If the account has no VERIFIED TOTP secret, this is a no-op (returns) so
   *   password-only accounts — including the entire existing test suite — behave
   *   exactly as before.
   * - If TOTP is enabled but no `totpCode` was supplied, throws HTTP 401 with a
   *   machine-readable `{ error: 'totp_required' }` body so the frontend can
   *   prompt for the code. No tokens are issued.
   * - If a code is supplied it is verified via the security module's
   *   {@link SecurityService.validateTotp}, which also accepts a one-time backup
   *   code. An invalid code throws 401.
   */
  async assertTotpSatisfied(userId: string, totpCode?: string): Promise<void> {
    const { enabled } = await this.security.getTotpStatus(userId)
    if (!enabled) return

    if (!totpCode) {
      throw new UnauthorizedException({
        error: 'totp_required',
        message: 'A two-factor authentication code is required.',
      })
    }

    const ok = await this.security.validateTotp(userId, totpCode)
    if (!ok) {
      throw new UnauthorizedException({
        error: 'totp_invalid',
        message: 'Invalid two-factor authentication code.',
      })
    }
  }

  /**
   * A session's tokens: a new session (sign-in, sign-up, a claim, SSO, Google),
   * or, with `rotate`, the session a refresh token names, kept and given a new
   * refresh token (`refresh`).
   */
  async login(user: typeof users.$inferSelect, meta: SessionMeta = {}, rotate?: RotateSession) {
    const memberships = await this.workspacesService.findByMember(user.id)

    /*
     * WHICH WORKSPACE'S POLICY GOVERNS THIS SESSION.
     *
     * This used to be `memberships[0]` — the first row of a query that had no
     * `ORDER BY`. That one arbitrary row decided four things: the
     * `workspaceId` claim baked into the access token, the feature flags baked
     * in beside it, the refresh-token TTL and concurrent-session cap, and
     * whether the IP allowlist applied at all. For anyone in two workspaces,
     * Postgres was choosing the security policy.
     *
     * `validateUser`, seventy lines above, already asked the right question —
     * `getEffectiveForUser`, which orders by `joinedAt` and returns the role of
     * THAT membership. So the password-lockout policy came from one workspace
     * while the IP allowlist came from whichever one the planner put first, and
     * they were not necessarily the same workspace in the same sign-in.
     *
     * Now both paths resolve identically. `findByMember` is ordered to match,
     * so the switcher's first entry is the workspace being described here.
     */
    const { settings, isWorkspaceAdmin } = await this.securitySettings.getEffectiveForUser(user.id)
    const primaryWorkspaceId = settings.workspaceId

    // IP allowlist: block credential/refresh logins from disallowed IPs. Fails
    // OPEN when the list is empty or the client IP can't be determined, and
    // exempts workspace admins unless the policy opts them in (emergency access).
    if (settings.ipAllowlistEnabled && settings.ipAllowlist.length > 0 && meta.ip) {
      /*
       * The exemption reads the role of the SAME membership the policy came
       * from. It used to read `memberships[0]?.role`, so being an admin in any
       * workspace could exempt you from a different workspace's allowlist.
       */
      const exempt = isWorkspaceAdmin && !settings.ipAllowlistIncludeAdmins
      if (!exempt && !isIpAllowed(meta.ip, settings.ipAllowlist)) {
        await this.security.logAuditEvent({
          workspaceId: primaryWorkspaceId ?? undefined,
          actorId: user.id,
          actorEmail: user.email,
          action: 'auth.ip_blocked',
          resourceType: 'user',
          resourceId: user.id,
          description: `Login blocked by IP allowlist from ${meta.ip}`,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        })
        throw new ForbiddenException('Access from your IP address is not allowed by this workspace’s security policy.')
      }
    }

    // Fetch org memberships for workspace switcher (ClickUp-style)
    const orgMemberships = await this.db
      .select({ org: organizations, role: organizationMembers.role })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
      .where(eq(organizationMembers.userId, user.id))

    const resolvedFlags = await this.featureFlagsService.resolveForUser({
      userId: user.id,
      workspaceId: primaryWorkspaceId ?? '',
      role: user.role,
    })

    /*
     * THE ACCESS TOKEN NAMES ITS SESSION (`sid`,
     * `found-30-sep/revoked-sessions-keep-their-access-tokens`), and
     * `JwtStrategy` refuses one whose session is revoked, expired or gone. It
     * named none, so a session revoked by a password change, a reset, "sign out
     * other sessions", revoking it, signing out or the session cap went on
     * reading for the fifteen minutes its access token had left. The id is the
     * session row's, made here so the token can carry it before the row is
     * written; a refresh keeps it.
     */
    const sessionId = rotate?.sessionId ?? randomUUID()
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      workspaceId: primaryWorkspaceId,
      flags: resolvedFlags.flags,
      sid: sessionId,
    })

    // Session lifetime is driven by the workspace policy (idle/inactivity
    // timeout): each refresh rotates the token and re-extends the window, so a
    // session that goes unused longer than this expires and forces re-login.
    const ttlMinutes = settings.sessionTimeoutMinutes
    const refreshToken = this.jwtService.sign(
      { sub: user.id, type: 'refresh', jti: randomUUID() },
      {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: `${ttlMinutes}m`,
      },
    )

    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000)

    if (rotate) {
      /*
       * A REFRESH KEEPS ITS SESSION: the same row, its refresh token replaced
       * and its window extended, where it used to revoke the row and make
       * another. The session is what an access token names now, so a new row
       * per refresh would void every access token made before it, and a
       * browser's requests in flight across a refresh would be refused and
       * refresh again, each voiding the last. Only the refresh token the
       * caller presented is replaced, on a row still live: of two refreshes
       * with one token, one rotates it and the other is refused, as a used
       * refresh token was.
       */
      const [kept] = await this.db
        .update(sessions)
        .set({ refreshToken: hashRefreshToken(refreshToken), expiresAt, userAgent: meta.userAgent, ipAddress: meta.ip })
        .where(and(eq(sessions.id, rotate.sessionId), eq(sessions.refreshToken, rotate.refreshTokenHash), eq(sessions.isRevoked, false)))
        .returning({ id: sessions.id })
      if (!kept) throw new UnauthorizedException('Session expired')
    } else {
      // Store only the hash of the refresh token at rest (the raw JWT is still
      // returned to the client below). See hashRefreshToken().
      await this.db.insert(sessions).values({
        id: sessionId,
        userId: user.id,
        refreshToken: hashRefreshToken(refreshToken),
        userAgent: meta.userAgent,
        ipAddress: meta.ip,
        expiresAt,
      })

      // Concurrent-session cap: revoke the oldest sessions beyond the limit.
      if (settings.maxConcurrentSessions > 0) {
        await this.enforceSessionCap(user.id, settings.maxConcurrentSessions)
      }
    }

    await this.security.logAuditEvent({
      workspaceId: primaryWorkspaceId ?? undefined,
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.login',
      resourceType: 'user',
      resourceId: user.id,
      description: `Signed in as ${user.email}`,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    })

    const { passwordHash: _discard, ...safeUser } = user
    void _discard
    return {
      accessToken,
      refreshToken,
      user: safeUser,
      workspaces: memberships.map((m) => ({ ...m.workspace, role: m.role })),
      organizations: orgMemberships.map((m) => ({ ...m.org, role: m.role })),
    }
  }

  async issueSessionForUserId(userId: string, meta: SessionMeta = {}) {
    const user = await this.usersService.findById(userId)
    if (!user) throw new UnauthorizedException('User not found')
    return this.login(user, meta)
  }

  /**
   * Revoke the active sessions beyond `max`, those used least recently first:
   * ordered by `expiresAt`, which a sign-in sets and each refresh extends. It
   * was `createdAt`, which meant the same while a refresh made a new row; a
   * refresh keeps its row now (`login`, rotate), so `createdAt` is when the
   * session signed in, and the cap would end a session in daily use before
   * one left idle since the day after.
   */
  private async enforceSessionCap(userId: string, max: number) {
    const active = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.isRevoked, false)))
      .orderBy(desc(sessions.expiresAt))
    for (const stale of active.slice(max)) {
      await this.db.update(sessions).set({ isRevoked: true }).where(eq(sessions.id, stale.id))
    }
  }

  /**
   * Apply the password policy (strength + breach check) to a new password: the
   * settings service's, which the profile's password change applies too.
   */
  private async enforcePasswordPolicy(
    password: string,
    policy: { requireStrong: boolean; blockBreached: boolean },
  ) {
    await this.securitySettings.enforcePasswordPolicy(password, policy)
  }

  /**
   * POST /auth/signup — Atomic org + workspace creation.
   * All rows (user, org, org_member, workspace, workspace_member, invitations)
   * are inserted in a single DB transaction; any failure rolls back everything.
   */
  async signUp(dto: SignupDto, meta: SessionMeta = {}) {
    const existing = await this.usersService.findByEmail(dto.email.toLowerCase())
    if (existing) throw new ConflictException('An account with this email already exists')

    // New accounts must meet the strong-password baseline. (Breach checking is
    // a per-workspace opt-in; there is no workspace yet at sign-up time.)
    await this.enforcePasswordPolicy(dto.password, { requireStrong: true, blockBreached: false })

    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:5173')
    // On a worker, and before the transaction: not a connection held open while it hashes.
    const passwordHash = await passwords.hash(dto.password)

    const result = await this.db.transaction(async (tx) => {
      // 1. Create user
      const [user] = await tx
        .insert(users)
        .values({
          email: dto.email.toLowerCase(),
          displayName: dto.fullName,
          passwordHash,
          emailVerified: false,
        })
        .returning()

      // 2. Create organization
      const baseSlug = slugify(dto.organizationSlug ?? dto.organizationName)
      let orgSlug = baseSlug
      let attempt = 0
      while (true) {
        const [hit] = await tx
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.slug, orgSlug))
          .limit(1)
        if (!hit) break
        attempt++
        orgSlug = `${baseSlug}-${attempt}`
        if (attempt > 50) orgSlug = `${baseSlug}-${Date.now()}`
      }

      const [org] = await tx
        .insert(organizations)
        .values({ name: dto.organizationName, slug: orgSlug })
        .returning()

      // 3. Make user the org owner
      await tx.insert(organizationMembers).values({
        organizationId: org.id,
        userId: user.id,
        role: 'owner',
      })

      // 4. Create default workspace (same name as org)
      const wsSlug = orgSlug
      const [workspace] = await tx
        .insert(workspaces)
        .values({ organizationId: org.id, name: dto.organizationName, slug: wsSlug })
        .returning()

      // 5. Make user workspace_admin
      await tx.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: user.id,
        role: 'workspace_admin',
      })

      // §1.1 — this path inserts the workspace itself rather than going through
      // workspacesService.create(), so seeding types only there left every
      // account created through signup with none. A workspace with no types
      // hides the type picker, the search filter and the settings tab, so the
      // feature was invisible on the path most workspaces are actually born on.
      await tx.insert(taskTypes).values(
        DEFAULT_TASK_TYPES.map((type) => ({ ...type, workspaceId: workspace.id })),
      )

      /*
       * G08-4 [08:43], [09:02] — honour the feature picker.
       *
       * The wizard's second step says, in as many words: "Pick what you'll use
       * — we'll turn the rest off so the workspace stays uncluttered." The
       * picks arrived, the DTO declared them, and `signUp` read them nowhere.
       * The sentence was false, and the workspace came up with the platform
       * defaults whatever anybody ticked.
       *
       * Written inside the same transaction as the workspace: a workspace that
       * exists with the wrong features switched on, because a second write
       * failed, is the state this is meant to prevent.
       *
       * Only flags named by a pill are touched. Auth and SSO keep their
       * defaults because nobody was asked about them, and writing rows for
       * settings a user never saw would be its own kind of dishonest.
       */
      const flagRows = signupFeatureRows(dto.features, workspace, user.id)
      if (flagRows.length) {
        await tx
          .insert(featureFlags)
          .values(flagRows)
          // A flag can be governed by more than one pill in future; last write
          // wins rather than blowing up the whole signup on a unique clash.
          .onConflictDoUpdate({
            target: [featureFlags.flagKey, featureFlags.scope, featureFlags.scopeId, featureFlags.workspaceId],
            set: { enabled: sql`excluded.enabled`, updatedAt: new Date() },
          })
      }

      // 6. Create initial invitations
      const inviteTokens: Array<{ email: string; token: string; claimUrl: string }> = []
      if (dto.invites && dto.invites.length > 0) {
        for (const inv of dto.invites) {
          const token = randomBytes(32).toString('base64url')
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          await tx.insert(invitations).values({
            organizationId: org.id,
            email: inv.email.toLowerCase(),
            orgRole: inv.orgRole === 'admin' ? 'admin' : 'member',
            workspaceMemberships: [
              {
                workspaceId: workspace.id,
                role: inv.workspaceRole ?? 'member',
              },
            ],
            invitedByUserId: user.id,
            token,
            expiresAt,
          }).onConflictDoNothing()

          const claimUrl = `${appUrl}/accept-invite?token=${token}`
          inviteTokens.push({ email: inv.email.toLowerCase(), token, claimUrl })
        }
      }

      return { user, org, workspace, inviteTokens }
    })

    // Log claim URLs in dev (when email service not configured)
    for (const inv of result.inviteTokens) {
      this.logger.log(`[DEV] Invitation for ${inv.email}: ${inv.claimUrl}`)
    }

    // Send an email-verification link (best-effort; never blocks signup).
    await this.issueEmailVerification(result.user.id, result.user.email, result.user.displayName)

    return this.login(result.user, meta)
  }

  /** Create a verification token and email the confirmation link. */
  private async issueEmailVerification(userId: string, email: string, displayName?: string) {
    try {
      const token = randomBytes(32).toString('base64url')
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      await this.db.insert(emailVerifications).values({ userId, token, expiresAt })
      const appUrl = this.config.get<string>('APP_URL', 'http://localhost:5173')
      await this.emailService.sendVerificationEmail({
        to: email,
        recipientName: displayName,
        verifyUrl: `${appUrl}/verify-email?token=${token}`,
        expiresAt,
      })
    } catch (err) {
      this.logger.error(
        `Failed to issue email verification for ${email}: ${(err as Error).message}`,
      )
    }
  }

  /** Confirm an email with a token, flipping users.emailVerified to true. */
  async verifyEmail(token: string) {
    if (!token) throw new BadRequestException('Missing verification token')
    const [row] = await this.db
      .select()
      .from(emailVerifications)
      .where(and(eq(emailVerifications.token, token), isNull(emailVerifications.usedAt)))
      .limit(1)
    if (!row || row.expiresAt < new Date()) {
      throw new BadRequestException('Verification link is invalid or expired')
    }
    await this.db.update(users).set({ emailVerified: true }).where(eq(users.id, row.userId))
    await this.db
      .update(emailVerifications)
      .set({ usedAt: new Date() })
      .where(eq(emailVerifications.id, row.id))
    return { ok: true }
  }

  /** Re-send a verification link. Silent about whether the account exists. */
  async resendVerification(email: string) {
    const normalized = email.toLowerCase().trim()
    const user = await this.usersService.findByEmail(normalized)
    if (user && !user.emailVerified) {
      await this.issueEmailVerification(user.id, user.email, user.displayName)
    }
    return { ok: true }
  }

  /**
   * Locate the session row for a presented refresh token.
   *
   * Primary path: match on the token's SHA-256 hash — how all new/rotated
   * sessions are stored (see hashRefreshToken).
   *
   * Migration-in-place fallback: if the hash misses, retry with the raw token to
   * catch sessions written before hashing-at-rest was introduced. On a legacy
   * hit we transparently re-store that row's `refreshToken` as the hash, so it is
   * upgraded on first use. This is what avoids force-logging-out every existing
   * session on deploy. The legacy branch can be deleted once all sessions have
   * rotated past the old plaintext storage.
   */
  private async findSessionByRefreshToken(token: string) {
    const hashed = hashRefreshToken(token)
    const [byHash] = await this.db.select().from(sessions).where(eq(sessions.refreshToken, hashed))
    if (byHash) return byHash

    const [legacy] = await this.db.select().from(sessions).where(eq(sessions.refreshToken, token))
    if (legacy) {
      await this.db.update(sessions).set({ refreshToken: hashed }).where(eq(sessions.id, legacy.id))
      return { ...legacy, refreshToken: hashed }
    }
    return undefined
  }

  async refresh(token: string, meta: SessionMeta = {}) {
    let payload: any
    try {
      payload = this.jwtService.verify(token, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      })
    } catch {
      throw new UnauthorizedException('Invalid refresh token')
    }

    // The token is a real, signature-verified JWT (checked above); we only look
    // up the session ROW by the token's hash here.
    const session = await this.findSessionByRefreshToken(token)
    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired')
    }

    const user = await this.usersService.findById(payload.sub)
    if (!user) throw new UnauthorizedException()

    // The session is kept, and the refresh token presented for it replaced
    // (`login`, rotate): its access tokens name it, and stay good.
    try {
      return await this.login(user, meta, { sessionId: session.id, refreshTokenHash: session.refreshToken })
    } catch (err) {
      // A refresh the workspace's IP allowlist refuses ends the session, as it
      // did when the old session was revoked before a new one was made.
      if (err instanceof ForbiddenException) {
        await this.db.update(sessions).set({ isRevoked: true }).where(eq(sessions.id, session.id))
      }
      throw err
    }
  }

  async logout(refreshToken: string) {
    // Locate by hash (with the legacy raw-token fallback) then revoke by id, so
    // logout keeps working for both hashed and not-yet-upgraded sessions.
    const session = await this.findSessionByRefreshToken(refreshToken)
    if (session) {
      await this.db.update(sessions).set({ isRevoked: true }).where(eq(sessions.id, session.id))
    }
  }

  async listSessions(userId: string, currentRefreshToken?: string | null) {
    const rows = await this.db
      .select({
        id: sessions.id,
        userAgent: sessions.userAgent,
        ipAddress: sessions.ipAddress,
        isRevoked: sessions.isRevoked,
        expiresAt: sessions.expiresAt,
        createdAt: sessions.createdAt,
        refreshToken: sessions.refreshToken,
      })
      .from(sessions)
      .where(eq(sessions.userId, userId))

    // Stored tokens are SHA-256 hashes, so hash the presented token before
    // comparing. The raw fallback matches legacy sessions not yet upgraded.
    const hashedCurrent = currentRefreshToken ? hashRefreshToken(currentRefreshToken) : null

    return rows
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((row) => ({
        id: row.id,
        userAgent: row.userAgent,
        ipAddress: row.ipAddress,
        isRevoked: row.isRevoked,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
        isCurrent:
          Boolean(currentRefreshToken) &&
          (row.refreshToken === hashedCurrent || row.refreshToken === currentRefreshToken),
      }))
  }

  async revokeSession(userId: string, sessionId: string) {
    const [session] = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
      .limit(1)
    if (!session) throw new UnauthorizedException('Session not found')
    await this.db.update(sessions).set({ isRevoked: true }).where(eq(sessions.id, session.id))
    return { revoked: true }
  }

  async revokeOtherSessions(userId: string, currentRefreshToken?: string | null) {
    const userSessions = await this.db
      .select({ id: sessions.id, refreshToken: sessions.refreshToken })
      .from(sessions)
      .where(eq(sessions.userId, userId))
    // Keep the current session; stored tokens are hashes, so compare against the
    // hash (raw fallback covers legacy, not-yet-upgraded sessions).
    const hashedCurrent = currentRefreshToken ? hashRefreshToken(currentRefreshToken) : null
    const idsToRevoke = userSessions
      .filter(
        (s) =>
          !currentRefreshToken ||
          (s.refreshToken !== hashedCurrent && s.refreshToken !== currentRefreshToken),
      )
      .map((s) => s.id)
    for (const id of idsToRevoke) {
      await this.db.update(sessions).set({ isRevoked: true }).where(eq(sessions.id, id))
    }
    return { revoked: idsToRevoke.length }
  }

  async requestPasswordReset(email: string) {
    const normalizedEmail = email.toLowerCase().trim()
    const user = await this.usersService.findByEmail(normalizedEmail)
    // Do not reveal whether an account exists.
    if (!user) return { ok: true }

    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    await this.db.insert(passwordResets).values({
      userId: user.id,
      token,
      expiresAt,
    })

    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:5173')
    const resetUrl = `${appUrl}/login?token=${token}`
    if ((this.config.get<string>('NODE_ENV') ?? 'development') !== 'production') {
      this.logger.log(`[DEV] Password reset for ${user.email}: ${resetUrl}`)
    }
    await this.emailService.sendPasswordResetEmail({
      to: user.email,
      recipientName: user.displayName,
      resetUrl,
      expiresAt,
    })
    return { ok: true }
  }

  async resetPassword(token: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) {
      throw new UnauthorizedException('Password must be at least 8 characters')
    }

    const [row] = await this.db
      .select()
      .from(passwordResets)
      .where(and(eq(passwordResets.token, token), isNull(passwordResets.usedAt)))
      .limit(1)

    if (!row || row.expiresAt < new Date()) {
      throw new UnauthorizedException('Reset link is invalid or expired')
    }

    // Enforce the resetting user's workspace password policy.
    const { settings } = await this.securitySettings.getEffectiveForUser(row.userId)
    await this.enforcePasswordPolicy(newPassword, {
      requireStrong: settings.requireStrongPasswords,
      blockBreached: settings.blockBreachedPasswords,
    })

    // On a worker, and before the transaction: not a connection held open while it hashes.
    const passwordHash = await passwords.hash(newPassword)
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, row.userId))

      await tx
        .update(passwordResets)
        .set({ usedAt: new Date() })
        .where(eq(passwordResets.id, row.id))

      // Revoke all active sessions for security after password change.
      await tx.update(sessions).set({ isRevoked: true }).where(eq(sessions.userId, row.userId))
    })

    return { ok: true }
  }
}
