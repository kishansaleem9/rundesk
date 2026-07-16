import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { and, eq } from 'drizzle-orm'
import { users, oauthAccounts } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { SecurityService } from '../security/security.service'
import {
  buildAuthorizeUrl,
  createOAuthState,
  verifyOAuthState,
  PROVIDER_META,
  type OAuthProvider,
} from './oauth.util'

type ProviderCreds = { clientId: string; clientSecret: string }

export type OAuthProfile = {
  providerId: string
  email: string
  displayName: string
  avatarUrl: string | null
}

export type OAuthTokens = {
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
}

const PROVIDER_LABEL: Record<OAuthProvider, string> = { google: 'Google', microsoft: 'Microsoft' }

/**
 * Google + Microsoft social login (OAuth 2.0 authorization-code flow).
 *
 * Credentials are read from the environment via ConfigService and the whole
 * feature is env-gated: when a provider's client id/secret are absent the
 * provider is simply reported as "not configured" (like web-push), so the flow
 * stays dormant until an operator sets the secrets. Session minting is delegated
 * to AuthService (see the controller) — this service only resolves the external
 * identity and links it to a Rundesk user.
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name)

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private config: ConfigService,
    private security: SecurityService,
  ) {}

  // ─── Env-gated provider credentials ─────────────────────────────────────────

  private creds(provider: OAuthProvider): ProviderCreds | null {
    const prefix = provider === 'google' ? 'GOOGLE' : 'MICROSOFT'
    const clientId = this.config.get<string>(`${prefix}_OAUTH_CLIENT_ID`)
    const clientSecret = this.config.get<string>(`${prefix}_OAUTH_CLIENT_SECRET`)
    if (!clientId || !clientSecret) return null
    return { clientId, clientSecret }
  }

  isConfigured(provider: OAuthProvider): boolean {
    return this.creds(provider) !== null
  }

  /** Which providers have env creds present — powers GET /auth/oauth/providers. */
  configuredProviders(): { google: boolean; microsoft: boolean } {
    return { google: this.isConfigured('google'), microsoft: this.isConfigured('microsoft') }
  }

  // ─── State signing + redirect URI ───────────────────────────────────────────

  /** HMAC key for the signed `state`. Falls back to the always-present JWT secret. */
  private get stateSecret(): string {
    return this.config.get<string>('OAUTH_STATE_SECRET') ?? this.config.getOrThrow<string>('JWT_ACCESS_SECRET')
  }

  /**
   * The provider redirect_uri. Must be identical at authorize + token-exchange
   * time, so both paths call this. Falls back to `${API_URL}/api/v1` (the global
   * route prefix) when OAUTH_REDIRECT_BASE is not set.
   */
  redirectUri(provider: OAuthProvider): string {
    const configured = this.config.get<string>('OAUTH_REDIRECT_BASE')
    const base = configured
      ? configured.replace(/\/$/, '')
      : `${(this.config.get<string>('API_URL') ?? 'http://localhost:3001').replace(/\/$/, '')}/api/v1`
    return `${base}/auth/oauth/${provider}/callback`
  }

  // ─── Authorize step ─────────────────────────────────────────────────────────

  /** Build the provider authorize URL + the signed state to plant in a cookie. */
  beginLogin(provider: OAuthProvider): { url: string; state: string } {
    const creds = this.creds(provider)
    if (!creds) throw new BadRequestException(`${PROVIDER_LABEL[provider]} OAuth is not configured`)
    const state = createOAuthState(provider, this.stateSecret)
    const url = buildAuthorizeUrl(provider, {
      clientId: creds.clientId,
      redirectUri: this.redirectUri(provider),
      state,
    })
    return { url, state }
  }

  /**
   * Validate the round-tripped `state`: it must equal the value we planted in
   * the httpOnly cookie AND carry a valid, unexpired signature for this provider.
   */
  validateState(provider: OAuthProvider, queryState?: string, cookieState?: string): void {
    if (!queryState || !cookieState || queryState !== cookieState) {
      throw new BadRequestException('Invalid or missing OAuth state')
    }
    if (!verifyOAuthState(queryState, this.stateSecret, { provider })) {
      throw new BadRequestException('OAuth state failed verification')
    }
  }

  // ─── Callback step: code → tokens → profile ─────────────────────────────────

  async exchangeCodeForProfile(
    provider: OAuthProvider,
    code: string,
  ): Promise<{ profile: OAuthProfile; tokens: OAuthTokens }> {
    const creds = this.creds(provider)
    if (!creds) throw new BadRequestException(`${PROVIDER_LABEL[provider]} OAuth is not configured`)
    const meta = PROVIDER_META[provider]

    const form = new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code,
      redirect_uri: this.redirectUri(provider),
      grant_type: 'authorization_code',
    })
    const tokenRes = await fetch(meta.tokenUrl, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(20_000),
    })
    if (!tokenRes.ok) {
      this.logger.warn(`${provider} token exchange failed (${tokenRes.status})`)
      throw new BadRequestException(`OAuth token exchange failed (${tokenRes.status})`)
    }
    const token = (await tokenRes.json()) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
    }
    if (!token.access_token) throw new BadRequestException('OAuth token payload missing access token')

    const infoRes = await fetch(meta.userInfoUrl, {
      headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!infoRes.ok) {
      throw new BadRequestException(`Failed to fetch ${PROVIDER_LABEL[provider]} profile (${infoRes.status})`)
    }
    const info = (await infoRes.json()) as Record<string, unknown>

    const email = String(info.email ?? info.preferred_username ?? info.upn ?? '')
      .toLowerCase()
      .trim()
    if (!email) throw new BadRequestException(`${PROVIDER_LABEL[provider]} account did not return an email`)
    const providerId = String(info.sub ?? info.id ?? email)
    const displayName = String(info.name ?? info.given_name ?? email.split('@')[0])
    const avatarUrl = info.picture ? String(info.picture) : null

    return {
      profile: { providerId, email, displayName, avatarUrl },
      tokens: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
      },
    }
  }

  // ─── User upsert + account linking ──────────────────────────────────────────

  /**
   * Upsert the Rundesk user by email and link the `oauth_accounts` row for
   * (provider, providerId). New users are created password-less with a verified
   * email (the provider vouches for it), mirroring SSO JIT provisioning. Returns
   * the user id for session minting + an audit trail entry.
   */
  async upsertUserAndLink(
    provider: OAuthProvider,
    profile: OAuthProfile,
    tokens: OAuthTokens,
    meta: { ip?: string; userAgent?: string } = {},
  ): Promise<{ userId: string; isNewUser: boolean }> {
    let user = (await this.db.select().from(users).where(eq(users.email, profile.email)).limit(1))[0]

    let isNewUser = false
    if (!user) {
      const [created] = await this.db
        .insert(users)
        .values({
          email: profile.email,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          passwordHash: null,
          emailVerified: true,
        })
        .returning()
      user = created
      isNewUser = true
    } else {
      // Refresh name/avatar from the provider without clobbering set values with blanks.
      const patch: Partial<typeof users.$inferInsert> = {}
      if (profile.displayName && profile.displayName !== user.displayName) patch.displayName = profile.displayName
      if (profile.avatarUrl && profile.avatarUrl !== user.avatarUrl) patch.avatarUrl = profile.avatarUrl
      if (!user.emailVerified) patch.emailVerified = true
      if (Object.keys(patch).length > 0) {
        await this.db.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, user.id))
      }
    }

    // Link (or refresh the stored tokens on) the oauth_accounts row.
    const existingLink = (
      await this.db
        .select()
        .from(oauthAccounts)
        .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerId, profile.providerId)))
        .limit(1)
    )[0]
    if (existingLink) {
      await this.db
        .update(oauthAccounts)
        .set({
          userId: user.id,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
        })
        .where(eq(oauthAccounts.id, existingLink.id))
    } else {
      await this.db.insert(oauthAccounts).values({
        userId: user.id,
        provider,
        providerId: profile.providerId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      })
    }

    await this.security.logAuditEvent({
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.oauth_login',
      resourceType: 'user',
      resourceId: user.id,
      description: `Signed in via ${PROVIDER_LABEL[provider]} (OAuth)`,
      metadata: { provider, newUser: isNewUser },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    })

    return { userId: user.id, isNewUser }
  }
}
