import { Injectable, Inject, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { eq, and, lt, isNotNull } from 'drizzle-orm'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import * as openidClient from 'openid-client'
import { SAML } from '@node-saml/node-saml'
import {
  ssoConnections,
  ssoLoginStates,
  users,
  workspaces,
  workspaceMembers,
  type SsoProvider,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { SecurityService } from '../security/security.service'

export type SsoConnectionUpdate = {
  displayName?: string
  isEnabled?: boolean
  enforceForDomain?: string | null
  jitProvisioning?: boolean
  defaultRole?: string
  oidcIssuer?: string | null
  oidcClientId?: string | null
  oidcClientSecret?: string | null
  oidcScopes?: string | null
  samlIdpEntityId?: string | null
  samlIdpSsoUrl?: string | null
  samlIdpCertificate?: string | null
  samlSpEntityId?: string | null
  samlSignRequests?: boolean
  attributeMapping?: { email?: string; displayName?: string; groups?: string }
}

export type SsoCallbackResult = {
  userId: string
  email: string
  displayName: string
  workspaceId: string
  isNewUser: boolean
  isNewMembership: boolean
  connectionId: string
}

@Injectable()
export class SsoService {
  private readonly appUrl: string

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private config: ConfigService,
    private security: SecurityService,
  ) {
    this.appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:5173'
  }

  // ─── Configuration CRUD ──────────────────────────────────────────────────

  async listConnections(workspaceId: string) {
    const rows = await this.db
      .select()
      .from(ssoConnections)
      .where(eq(ssoConnections.workspaceId, workspaceId))
    return rows.map(this.sanitizeConnection)
  }

  async getConnectionByProvider(workspaceId: string, provider: SsoProvider) {
    const [row] = await this.db
      .select()
      .from(ssoConnections)
      .where(and(eq(ssoConnections.workspaceId, workspaceId), eq(ssoConnections.provider, provider)))
      .limit(1)
    return row ?? null
  }

  async upsertConnection(
    workspaceId: string,
    provider: SsoProvider,
    actorId: string,
    patch: SsoConnectionUpdate,
  ) {
    const existing = await this.getConnectionByProvider(workspaceId, provider)
    if (existing) {
      const [updated] = await this.db
        .update(ssoConnections)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(ssoConnections.id, existing.id))
        .returning()
      await this.security.logAuditEvent({
        workspaceId,
        actorId,
        action: 'sso.connection_updated',
        resourceType: 'sso_connection',
        resourceId: existing.id,
        description: `Updated ${provider.toUpperCase()} SSO connection`,
        metadata: { provider, enabled: updated.isEnabled },
      })
      return this.sanitizeConnection(updated)
    }
    if (!patch.displayName) {
      throw new BadRequestException('displayName is required when creating a connection')
    }
    const [created] = await this.db
      .insert(ssoConnections)
      .values({
        workspaceId,
        provider,
        displayName: patch.displayName,
        createdById: actorId,
        ...patch,
      })
      .returning()
    await this.security.logAuditEvent({
      workspaceId,
      actorId,
      action: 'sso.connection_created',
      resourceType: 'sso_connection',
      resourceId: created.id,
      description: `Created ${provider.toUpperCase()} SSO connection "${created.displayName}"`,
      metadata: { provider },
    })
    return this.sanitizeConnection(created)
  }

  async deleteConnection(workspaceId: string, connectionId: string, actorId: string) {
    const [existing] = await this.db
      .select()
      .from(ssoConnections)
      .where(and(eq(ssoConnections.id, connectionId), eq(ssoConnections.workspaceId, workspaceId)))
      .limit(1)
    if (!existing) throw new NotFoundException('SSO connection not found')
    await this.db.delete(ssoConnections).where(eq(ssoConnections.id, connectionId))
    await this.security.logAuditEvent({
      workspaceId,
      actorId,
      action: 'sso.connection_deleted',
      resourceType: 'sso_connection',
      resourceId: connectionId,
      description: `Deleted ${existing.provider.toUpperCase()} SSO connection "${existing.displayName}"`,
      metadata: { provider: existing.provider },
    })
    return { ok: true }
  }

  /**
   * Look up the SSO connection that should be used for a user based on their
   * email domain. Used by the sign-in page to decide whether to surface a
   * "Sign in with SSO" path.
   */
  async findConnectionForEmail(email: string): Promise<typeof ssoConnections.$inferSelect | null> {
    const domain = email.split('@')[1]?.toLowerCase()
    if (!domain) return null
    const candidates = await this.db
      .select()
      .from(ssoConnections)
      .where(and(eq(ssoConnections.enforceForDomain, domain), eq(ssoConnections.isEnabled, true)))
      .limit(1)
    return candidates[0] ?? null
  }

  // ─── OIDC flow ────────────────────────────────────────────────────────────

  async beginOidcLogin(workspaceId: string, redirectTo?: string) {
    const conn = await this.getConnectionByProvider(workspaceId, 'oidc')
    if (!conn || !conn.isEnabled) throw new NotFoundException('OIDC not configured for workspace')
    if (!conn.oidcIssuer || !conn.oidcClientId || !conn.oidcClientSecret) {
      throw new BadRequestException('OIDC connection is missing issuer/client credentials')
    }

    const config = await openidClient.discovery(
      new URL(conn.oidcIssuer),
      conn.oidcClientId,
      conn.oidcClientSecret,
    )
    const state = randomUUID()
    const nonce = openidClient.randomNonce()
    const codeVerifier = openidClient.randomPKCECodeVerifier()
    const codeChallenge = await openidClient.calculatePKCECodeChallenge(codeVerifier)

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
    await this.db.insert(ssoLoginStates).values({
      connectionId: conn.id,
      workspaceId,
      state,
      nonce,
      codeVerifier,
      redirectTo: redirectTo ?? null,
      expiresAt,
    })

    const url = openidClient.buildAuthorizationUrl(config, {
      redirect_uri: this.callbackUrl('oidc'),
      scope: conn.oidcScopes ?? 'openid email profile',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })

    return { url: url.toString(), state }
  }

  async handleOidcCallback(callbackUrl: URL): Promise<SsoCallbackResult> {
    const state = callbackUrl.searchParams.get('state')
    if (!state) throw new BadRequestException('Missing state parameter')

    const [stored] = await this.db
      .select()
      .from(ssoLoginStates)
      .where(eq(ssoLoginStates.state, state))
      .limit(1)
    if (!stored) throw new BadRequestException('Invalid or expired SSO state')
    if (stored.expiresAt < new Date()) {
      await this.db.delete(ssoLoginStates).where(eq(ssoLoginStates.id, stored.id))
      throw new BadRequestException('SSO state has expired')
    }

    const [conn] = await this.db
      .select()
      .from(ssoConnections)
      .where(eq(ssoConnections.id, stored.connectionId))
      .limit(1)
    if (!conn || !conn.oidcIssuer || !conn.oidcClientId || !conn.oidcClientSecret) {
      throw new NotFoundException('OIDC connection no longer available')
    }

    const config = await openidClient.discovery(
      new URL(conn.oidcIssuer),
      conn.oidcClientId,
      conn.oidcClientSecret,
    )

    const tokens = await openidClient.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: stored.codeVerifier ?? undefined,
      expectedNonce: stored.nonce ?? undefined,
      expectedState: state,
    })

    const claims = tokens.claims()
    if (!claims) throw new BadRequestException('ID token missing claims')
    const emailClaim = (conn.attributeMapping as any)?.email ?? 'email'
    const nameClaim = (conn.attributeMapping as any)?.displayName ?? 'name'
    const rawEmail = String((claims as any)[emailClaim] ?? '').toLowerCase()
    if (!rawEmail) throw new BadRequestException('OIDC response did not include an email claim')
    const displayName = String((claims as any)[nameClaim] ?? rawEmail.split('@')[0])

    await this.db.delete(ssoLoginStates).where(eq(ssoLoginStates.id, stored.id))

    return this.completeSsoLogin(conn, rawEmail, displayName)
  }

  // ─── SAML flow ────────────────────────────────────────────────────────────

  async beginSamlLogin(workspaceId: string, redirectTo?: string): Promise<{ url: string }> {
    const conn = await this.getConnectionByProvider(workspaceId, 'saml')
    if (!conn || !conn.isEnabled) throw new NotFoundException('SAML not configured for workspace')
    if (!conn.samlIdpSsoUrl || !conn.samlIdpEntityId || !conn.samlIdpCertificate) {
      throw new BadRequestException('SAML connection is missing IdP metadata')
    }
    const saml = this.buildSamlClient(conn)
    const url = await saml.getAuthorizeUrlAsync('', this.callbackUrl('saml'), {})

    const state = randomUUID()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
    await this.db.insert(ssoLoginStates).values({
      connectionId: conn.id,
      workspaceId,
      state,
      redirectTo: redirectTo ?? null,
      expiresAt,
    })

    return { url }
  }

  async handleSamlCallback(body: { SAMLResponse: string; RelayState?: string }): Promise<SsoCallbackResult> {
    if (!body?.SAMLResponse) throw new BadRequestException('Missing SAMLResponse')

    const conns = await this.db
      .select()
      .from(ssoConnections)
      .where(and(eq(ssoConnections.provider, 'saml'), eq(ssoConnections.isEnabled, true)))

    // Try each enabled SAML connection until one validates. In practice this
    // is small (one connection per workspace) and the cert match makes the
    // correct conn unambiguous.
    let lastError: unknown
    for (const conn of conns) {
      if (!conn.samlIdpSsoUrl || !conn.samlIdpCertificate) continue
      try {
        const saml = this.buildSamlClient(conn)
        const { profile } = await saml.validatePostResponseAsync({
          SAMLResponse: body.SAMLResponse,
        })
        if (!profile) throw new BadRequestException('SAML response missing profile')

        const emailClaim = (conn.attributeMapping as any)?.email ?? 'email'
        const nameClaim = (conn.attributeMapping as any)?.displayName ?? 'displayName'
        const email = String(
          profile[emailClaim] ?? profile.email ?? profile.nameID ?? '',
        ).toLowerCase()
        if (!email) throw new BadRequestException('SAML response did not include an email attribute')
        const displayName = String(
          profile[nameClaim] ?? profile.displayName ?? profile.cn ?? email.split('@')[0],
        )

        return await this.completeSsoLogin(conn, email, displayName)
      } catch (err) {
        lastError = err
        continue
      }
    }
    throw new BadRequestException(
      `SAML response could not be validated: ${(lastError as Error)?.message ?? 'unknown error'}`,
    )
  }

  private buildSamlClient(conn: typeof ssoConnections.$inferSelect) {
    return new SAML({
      issuer: conn.samlSpEntityId ?? `rundesk:${conn.workspaceId}`,
      callbackUrl: this.callbackUrl('saml'),
      entryPoint: conn.samlIdpSsoUrl!,
      idpIssuer: conn.samlIdpEntityId!,
      idpCert: conn.samlIdpCertificate!,
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: false,
      signatureAlgorithm: 'sha256',
      digestAlgorithm: 'sha256',
      authnRequestBinding: 'HTTP-Redirect',
      identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      racComparison: 'exact',
    })
  }

  // ─── JIT provisioning + audit ─────────────────────────────────────────────

  private async completeSsoLogin(
    conn: typeof ssoConnections.$inferSelect,
    email: string,
    displayName: string,
  ): Promise<SsoCallbackResult> {
    // Enforce domain match when configured
    if (conn.enforceForDomain) {
      const domain = email.split('@')[1]?.toLowerCase()
      if (!domain || domain !== conn.enforceForDomain.toLowerCase()) {
        throw new BadRequestException(
          `Email ${email} does not match the workspace-enforced SSO domain @${conn.enforceForDomain}`,
        )
      }
    }

    const [workspace] = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, conn.workspaceId))
      .limit(1)
    if (!workspace) throw new NotFoundException('Workspace not found')

    let user = (
      await this.db.select().from(users).where(eq(users.email, email)).limit(1)
    )[0]

    let isNewUser = false
    if (!user) {
      if (!conn.jitProvisioning) {
        throw new ConflictException(
          'JIT provisioning is disabled for this workspace. Ask an admin to invite you first.',
        )
      }
      const [created] = await this.db
        .insert(users)
        .values({
          email,
          displayName,
          passwordHash: null,
          emailVerified: true,
        })
        .returning()
      user = created
      isNewUser = true
    } else if (user.displayName !== displayName && displayName) {
      await this.db.update(users).set({ displayName, updatedAt: new Date() }).where(eq(users.id, user.id))
      user.displayName = displayName
    }

    const [membership] = await this.db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, user.id)))
      .limit(1)

    let isNewMembership = false
    if (!membership) {
      if (!conn.jitProvisioning) {
        throw new ConflictException(
          'JIT provisioning is disabled for this workspace. Ask an admin to invite you first.',
        )
      }
      await this.db.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: user.id,
        role: (conn.defaultRole ?? 'member') as any,
      })
      isNewMembership = true
    }

    await this.db
      .update(ssoConnections)
      .set({ lastUsedAt: new Date() })
      .where(eq(ssoConnections.id, conn.id))

    await this.security.logAuditEvent({
      workspaceId: conn.workspaceId,
      actorId: user.id,
      actorEmail: user.email,
      action: 'sso.login',
      resourceType: 'sso_connection',
      resourceId: conn.id,
      description: `Signed in via ${conn.provider.toUpperCase()} (${conn.displayName})`,
      metadata: { provider: conn.provider, jitNewUser: isNewUser, jitNewMember: isNewMembership },
    })

    return {
      userId: user.id,
      email: user.email,
      displayName: user.displayName ?? email,
      workspaceId: conn.workspaceId,
      isNewUser,
      isNewMembership,
      connectionId: conn.id,
    }
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  private callbackUrl(provider: SsoProvider): string {
    const base = this.config.get<string>('API_URL') ?? this.appUrl.replace(':5173', ':3000')
    return `${base.replace(/\/$/, '')}/auth/sso/${provider}/callback`
  }

  /**
   * Strip secrets so connections can be returned to the UI safely. The full
   * client secret / certificate values are never exposed back to the client
   * — only redacted placeholders that indicate whether the field is set.
   */
  private sanitizeConnection(row: typeof ssoConnections.$inferSelect) {
    const redact = (value: string | null) => (value ? '••••••••' : null)
    return {
      ...row,
      oidcClientSecret: redact(row.oidcClientSecret),
      samlIdpCertificate: row.samlIdpCertificate
        ? `${row.samlIdpCertificate.slice(0, 40)}…(${row.samlIdpCertificate.length} chars)`
        : null,
    }
  }

  /** Best-effort cleanup of stale state rows; called by a scheduled task. */
  async pruneExpiredStates(): Promise<void> {
    await this.db.delete(ssoLoginStates).where(lt(ssoLoginStates.expiresAt, new Date()))
  }

  /** Issue a hash for SCIM token storage. Used by SCIM module. */
  hashScimToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex')
  }

  generateScimToken(): { raw: string; hash: string; prefix: string } {
    const raw = `scim_${randomBytes(24).toString('base64url')}`
    const hash = this.hashScimToken(raw)
    return { raw, hash, prefix: raw.slice(0, 12) }
  }

  /** Touch a connection on every SSO action so admins see real activity. */
  async touchConnection(connectionId: string) {
    await this.db
      .update(ssoConnections)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(ssoConnections.id, connectionId), isNotNull(ssoConnections.id)))
  }
}
