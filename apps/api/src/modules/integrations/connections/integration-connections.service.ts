import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { DRIVE_SEARCH_SCOPE } from '../../search/drive-scope'
import { ConfigService } from '@nestjs/config'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Db } from '@rundesk/db'
import {
  integrationAccessRequests,
  users,
  workspaceIntegrationConnections,
  workspaceMembers,
} from '@rundesk/db'
import { DB_TOKEN } from '../../../common/database/database.module'
import { SecurityService } from '../../security/security.service'
import { NotificationsService } from '../../notifications/notifications.service'
import { CalendarAccountsService } from '../../calendar-sync/calendar-accounts.service'

type Provider =
  | 'github'
  | 'gitlab'
  | 'gcal'
  | 'google-drive'
  | 'outlook'
  | 'onedrive'
  | 'linear'
  | 'salesforce'
  | 'dropbox'
  | 'zoom'
type ProviderConfig = {
  provider: Provider
  authUrl: string
  tokenUrl: string
  clientId: string
  clientSecret: string
  scopes: string[]
  extraAuthParams?: Record<string, string>
  /**
   * How the client authenticates at the token endpoint. Most providers accept
   * `client_id`/`client_secret` in the POST body ('body', the default); Zoom
   * requires HTTP Basic auth ('basic').
   */
  tokenAuthStyle?: 'body' | 'basic'
}
type ProviderAvailability = {
  provider: Provider
  available: boolean
  reason?: string
}

@Injectable()
export class IntegrationConnectionsService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly security: SecurityService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly calendarAccounts: CalendarAccountsService,
  ) {}

  async list(workspaceId: string) {
    const rows = await this.db
      .select()
      .from(workspaceIntegrationConnections)
      .where(eq(workspaceIntegrationConnections.workspaceId, workspaceId))
    return rows.map((row) => ({
      provider: row.provider,
      status: row.status,
      health:
        row.status !== 'connected'
          ? 'disconnected'
          : row.tokenExpiresAt && row.tokenExpiresAt.getTime() <= Date.now()
            ? 'expired'
            : row.tokenExpiresAt && row.tokenExpiresAt.getTime() - Date.now() <= 3 * 24 * 60 * 60 * 1000
              ? 'expiring'
              : 'healthy',
      scopes: row.scopes,
      externalAccountEmail: row.externalAccountEmail,
      tokenExpiresAt: row.tokenExpiresAt,
      /*
       * §V2-11 frame `18:39` — "Google gave us this error: …". Sent verbatim,
       * because the provider's own words are the only part of that card worth
       * reading; a message this service paraphrased would be a constant with a
       * variable's name, which is the facade defect.
       */
      lastError: row.lastError ?? null,
      lastErrorAt: row.lastErrorAt ?? null,
      connectedAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))
  }

  /**
   * §V2-11 frame `18:39` — remember what the provider said, against the
   * integration it said it about.
   *
   * Upserts rather than requiring a row: a connection that has NEVER succeeded
   * is exactly the case the card exists for, and it has no row yet. The token
   * columns are deliberately untouched, so recording a failed refresh does not
   * throw away a credential that may still work.
   *
   * Best-effort by contract — the caller is an error path, and an error path
   * that can itself fail is how a person ends up with a blank screen instead of
   * a message.
   */
  async recordFailure(workspaceId: string, providerRaw: string, message: string): Promise<void> {
    const provider = this.assertProvider(providerRaw)
    // Bounded: this lands in a card and in a response. A provider that returns
    // a page of HTML must not be able to paste it into somebody's UI.
    const lastError = String(message ?? '').trim().slice(0, 500) || 'Unknown error'
    const now = new Date()
    const existing = await this.db
      .select({ id: workspaceIntegrationConnections.id })
      .from(workspaceIntegrationConnections)
      .where(
        and(
          eq(workspaceIntegrationConnections.workspaceId, workspaceId),
          eq(workspaceIntegrationConnections.provider, provider),
        ),
      )
      .limit(1)
    if (existing[0]) {
      await this.db
        .update(workspaceIntegrationConnections)
        .set({ lastError, lastErrorAt: now, updatedAt: now })
        .where(eq(workspaceIntegrationConnections.id, existing[0].id))
      return
    }
    await this.db.insert(workspaceIntegrationConnections).values({
      workspaceId,
      provider,
      // `disconnected`, not `connected`: nothing was ever connected here, and a
      // row that claims otherwise would light up the tile as healthy while
      // carrying the reason it is not.
      status: 'disconnected',
      lastError,
      lastErrorAt: now,
    })
  }

  listSupportedProviders() {
    return [
      'github',
      'gitlab',
      'gcal',
      'google-drive',
      'outlook',
      'onedrive',
      'linear',
      'salesforce',
      'dropbox',
      'zoom',
    ] as const
  }

  listProviderAvailability(): ProviderAvailability[] {
    return this.listSupportedProviders().map((provider) => {
      const missing = this.getMissingProviderEnv(provider)
      if (missing.length === 0) {
        return { provider, available: true }
      }
      return {
        provider,
        available: false,
        reason: `Missing backend configuration: ${missing.join(', ')}`,
      }
    })
  }

  async getOAuthStartUrl(workspaceId: string, userId: string, providerRaw: string) {
    const provider = this.assertProvider(providerRaw)
    const cfg = this.getProviderConfig(provider)
    const state = this.signState({ provider, workspaceId, userId, ts: Date.now() })
    const redirectUri = this.getRedirectUri(provider)
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: cfg.scopes.join(' '),
      state,
      ...cfg.extraAuthParams,
    })
    return { authUrl: `${cfg.authUrl}?${params.toString()}` }
  }

  async handleOAuthCallback(providerRaw: string, code: string, state: string, ipAddress?: string) {
    const provider = this.assertProvider(providerRaw)
    const payload = this.verifyState(state)
    if (payload.provider !== provider) throw new UnauthorizedException('OAuth state provider mismatch')
    if (Date.now() - payload.ts > 10 * 60 * 1000) throw new UnauthorizedException('OAuth state expired')

    const stillMember = await this.db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, payload.workspaceId),
          eq(workspaceMembers.userId, payload.userId),
        ),
      )
      .limit(1)
    if (!stillMember[0]) throw new UnauthorizedException('You are no longer a workspace member')

    const cfg = this.getProviderConfig(provider)
    const redirectUri = this.getRedirectUri(provider)
    const token = await this.exchangeCode(cfg, code, redirectUri)
    const profile = await this.fetchProfile(provider, token.accessToken)

    const existing = await this.db
      .select()
      .from(workspaceIntegrationConnections)
      .where(
        and(
          eq(workspaceIntegrationConnections.workspaceId, payload.workspaceId),
          eq(workspaceIntegrationConnections.provider, provider),
        ),
      )
      .limit(1)

    const patch = {
      status: 'connected',
      scopes: token.scopes,
      externalAccountId: profile.id,
      externalAccountEmail: profile.email,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      tokenExpiresAt: token.expiresAt,
      metadata: profile.metadata,
      connectedById: payload.userId,
      /*
       * §V2-11 — a successful connect CLEARS the last failure. Without this the
       * card would keep showing yesterday's error over a working integration,
       * which is worse than showing nothing: it sends somebody to fix a
       * problem that is already fixed.
       */
      lastError: null,
      lastErrorAt: null,
      updatedAt: new Date(),
    } as const

    if (existing[0]) {
      await this.db
        .update(workspaceIntegrationConnections)
        .set(patch)
        .where(eq(workspaceIntegrationConnections.id, existing[0].id))
    } else {
      await this.db.insert(workspaceIntegrationConnections).values({
        workspaceId: payload.workspaceId,
        provider,
        ...patch,
      })
    }

    /*
     * §V2-14 — a CALENDAR grant is also recorded as the connecting person's own
     * account, and that is where the eviction bug is fixed.
     *
     * The upsert above is keyed on (workspace, provider), so a second Google
     * account never failed — it overwrote the first and orphaned every
     * `task_calendar_links` row pointing at it. `user_calendar_accounts` is
     * keyed on the PROVIDER'S account id instead, so a second account is a
     * second row and re-connecting the same one refreshes it.
     *
     * The workspace row is still written, deliberately: the existing task
     * push/pull resolves its connection from the workspace and runs as a
     * background side-effect with no user in scope. Which person's calendar a
     * task should mirror into is a real product question the video never
     * answers — she shows a person managing their OWN accounts — so it is left
     * alone rather than guessed at.
     */
    if (provider === 'gcal' || provider === 'outlook') {
      await this.calendarAccounts
        .upsertFromOAuth({
          userId: payload.userId,
          workspaceId: payload.workspaceId,
          provider,
          externalAccountId: profile.id ?? '',
          externalAccountEmail: profile.email,
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          tokenExpiresAt: token.expiresAt,
          scopes: token.scopes,
        })
        // Best-effort: a calendar that syncs but is missing from the account
        // list is recoverable by reconnecting; a callback that 500s after the
        // grant leaves the person with no connection and a scary error.
        .catch(() => undefined)
    }

    await this.security.logAuditEvent({
      workspaceId: payload.workspaceId,
      actorId: payload.userId,
      action: 'integration.connected',
      resourceType: 'integration',
      resourceId: provider,
      description: `Connected ${provider}`,
      metadata: { provider, accountEmail: profile.email ?? null },
      ipAddress,
    })

    return {
      workspaceId: payload.workspaceId,
      provider,
    }
  }

  async disconnect(workspaceId: string, providerRaw: string, actorId?: string) {
    const provider = this.assertProvider(providerRaw)
    await this.db
      .delete(workspaceIntegrationConnections)
      .where(
        and(
          eq(workspaceIntegrationConnections.workspaceId, workspaceId),
          eq(workspaceIntegrationConnections.provider, provider),
        ),
      )
    await this.security.logAuditEvent({
      workspaceId,
      actorId,
      action: 'integration.disconnected',
      resourceType: 'integration',
      resourceId: provider,
      description: `Disconnected ${provider}`,
      metadata: { provider },
    })
    return { ok: true }
  }

  async listAccessRequests(workspaceId: string) {
    const rows = await this.db
      .select({
        provider: integrationAccessRequests.provider,
        status: integrationAccessRequests.status,
        note: integrationAccessRequests.note,
        requestedById: integrationAccessRequests.requestedById,
        createdAt: integrationAccessRequests.createdAt,
        updatedAt: integrationAccessRequests.updatedAt,
        requesterName: users.displayName,
        requesterEmail: users.email,
      })
      .from(integrationAccessRequests)
      .leftJoin(users, eq(users.id, integrationAccessRequests.requestedById))
      .where(eq(integrationAccessRequests.workspaceId, workspaceId))
      .orderBy(desc(integrationAccessRequests.updatedAt))
    return rows
  }

  async requestAccess(workspaceId: string, userId: string, provider: string, note?: string) {
    const [existing] = await this.db
      .select()
      .from(integrationAccessRequests)
      .where(
        and(
          eq(integrationAccessRequests.workspaceId, workspaceId),
          eq(integrationAccessRequests.provider, provider),
        ),
      )
      .limit(1)
    if (existing) {
      const [updated] = await this.db
        .update(integrationAccessRequests)
        .set({
          status: 'pending',
          note: note?.trim() || existing.note,
          requestedById: userId,
          updatedAt: new Date(),
        })
        .where(eq(integrationAccessRequests.id, existing.id))
        .returning()
      await this.security.logAuditEvent({
        workspaceId,
        actorId: userId,
        action: 'integration.access_requested',
        resourceType: 'integration',
        resourceId: provider,
        description: `Resubmitted access request for ${provider}`,
        metadata: { provider, note: note ?? null },
      })
      return updated
    }
    const [created] = await this.db
      .insert(integrationAccessRequests)
      .values({
        workspaceId,
        provider,
        requestedById: userId,
        status: 'pending',
        note: note?.trim() || null,
      })
      .returning()
    await this.security.logAuditEvent({
      workspaceId,
      actorId: userId,
      action: 'integration.access_requested',
      resourceType: 'integration',
      resourceId: provider,
      description: `Requested access to ${provider}`,
      metadata: { provider, note: note ?? null },
    })

    // §2.2 — "agar ACCESS REQUEST — agar kisi ne koi access maanga to mujhe
    // show ho." It reached an audit log and an admin screen nobody watches;
    // the person who can grant it now hears about it where they read
    // everything else.
    const admins = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          inArray(workspaceMembers.role, ['workspace_admin', 'super_admin']),
        ),
      )
    for (const admin of admins) {
      if (admin.userId === userId) continue
      await this.notifications
        .create({
          userId: admin.userId,
          workspaceId,
          actorId: userId,
          type: 'access_requested',
          title: provider,
          body: note?.trim() || undefined,
          target: { entityType: 'integration', entityId: provider },
        })
        .catch(() => undefined)
    }
    return created
  }

  async setAccessRequestStatus(
    workspaceId: string,
    provider: string,
    status: 'pending' | 'approved' | 'rejected',
    note?: string,
    actorId?: string,
  ) {
    const [existing] = await this.db
      .select()
      .from(integrationAccessRequests)
      .where(
        and(
          eq(integrationAccessRequests.workspaceId, workspaceId),
          eq(integrationAccessRequests.provider, provider),
        ),
      )
      .limit(1)
    if (!existing) {
      throw new BadRequestException('Access request not found')
    }
    const [updated] = await this.db
      .update(integrationAccessRequests)
      .set({
        status,
        note: note?.trim() || existing.note,
        updatedAt: new Date(),
      })
      .where(eq(integrationAccessRequests.id, existing.id))
      .returning()
    await this.security.logAuditEvent({
      workspaceId,
      actorId,
      action: `integration.access_${status}`,
      resourceType: 'integration',
      resourceId: provider,
      description: `Admin marked access request as ${status} for ${provider}`,
      metadata: { provider, note: note ?? null, previousStatus: existing.status },
    })
    return updated
  }

  private assertProvider(providerRaw: string): Provider {
    if (
      providerRaw === 'github' ||
      providerRaw === 'gitlab' ||
      providerRaw === 'gcal' ||
      providerRaw === 'google-drive' ||
      providerRaw === 'outlook' ||
      providerRaw === 'onedrive' ||
      providerRaw === 'linear' ||
      providerRaw === 'salesforce' ||
      providerRaw === 'dropbox' ||
      providerRaw === 'zoom'
    ) {
      return providerRaw
    }
    throw new BadRequestException(`Unsupported provider: ${providerRaw}`)
  }

  private signState(payload: { provider: Provider; workspaceId: string; userId: string; ts: number }) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signature = createHmac('sha256', this.getStateSecret()).update(body).digest('base64url')
    return `${body}.${signature}`
  }

  private verifyState(state: string): { provider: Provider; workspaceId: string; userId: string; ts: number } {
    const [body, signature] = state.split('.')
    if (!body || !signature) throw new UnauthorizedException('Invalid OAuth state')
    const expected = createHmac('sha256', this.getStateSecret()).update(body).digest()
    const given = Buffer.from(signature, 'base64url')
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new UnauthorizedException('Invalid OAuth signature')
    }
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      provider: Provider
      workspaceId: string
      userId: string
      ts: number
    }
    return parsed
  }

  private getProviderConfig(provider: Provider): ProviderConfig {
    if (provider === 'github') {
      return {
        provider,
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        clientId: process.env.GITHUB_CLIENT_ID ?? '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
        scopes: ['repo', 'read:user', 'user:email'],
      }
    }
    if (provider === 'gitlab') {
      return {
        provider,
        authUrl: process.env.GITLAB_AUTH_URL ?? 'https://gitlab.com/oauth/authorize',
        tokenUrl: process.env.GITLAB_TOKEN_URL ?? 'https://gitlab.com/oauth/token',
        clientId: process.env.GITLAB_CLIENT_ID ?? '',
        clientSecret: process.env.GITLAB_CLIENT_SECRET ?? '',
        scopes: ['read_user', 'api'],
      }
    }
    if (provider === 'outlook' || provider === 'onedrive') {
      return {
        provider,
        authUrl:
          process.env.MICROSOFT_AUTH_URL ??
          'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenUrl:
          process.env.MICROSOFT_TOKEN_URL ??
          'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        clientId: process.env.MICROSOFT_CLIENT_ID ?? '',
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
        scopes:
          provider === 'outlook'
            ? ['openid', 'email', 'profile', 'offline_access', 'Calendars.ReadWrite']
            : ['openid', 'email', 'profile', 'offline_access', 'Files.ReadWrite'],
      }
    }
    if (provider === 'linear') {
      return {
        provider,
        authUrl: process.env.LINEAR_AUTH_URL ?? 'https://linear.app/oauth/authorize',
        tokenUrl: process.env.LINEAR_TOKEN_URL ?? 'https://api.linear.app/oauth/token',
        clientId: process.env.LINEAR_CLIENT_ID ?? '',
        clientSecret: process.env.LINEAR_CLIENT_SECRET ?? '',
        scopes: ['read', 'write'],
      }
    }
    if (provider === 'salesforce') {
      return {
        provider,
        authUrl: process.env.SALESFORCE_AUTH_URL ?? 'https://login.salesforce.com/services/oauth2/authorize',
        tokenUrl: process.env.SALESFORCE_TOKEN_URL ?? 'https://login.salesforce.com/services/oauth2/token',
        clientId: process.env.SALESFORCE_CLIENT_ID ?? '',
        clientSecret: process.env.SALESFORCE_CLIENT_SECRET ?? '',
        scopes: ['api', 'refresh_token'],
      }
    }
    if (provider === 'dropbox') {
      return {
        provider,
        authUrl: process.env.DROPBOX_AUTH_URL ?? 'https://www.dropbox.com/oauth2/authorize',
        tokenUrl: process.env.DROPBOX_TOKEN_URL ?? 'https://api.dropboxapi.com/oauth2/token',
        clientId: process.env.DROPBOX_CLIENT_ID ?? '',
        clientSecret: process.env.DROPBOX_CLIENT_SECRET ?? '',
        scopes: ['files.metadata.read', 'sharing.read'],
        // Dropbox only issues a refresh_token when the authorize call asks for
        // offline access; without it access tokens expire in ~4h with no renewal.
        extraAuthParams: { token_access_type: 'offline' },
      }
    }
    if (provider === 'zoom') {
      return {
        provider,
        authUrl: process.env.ZOOM_AUTH_URL ?? 'https://zoom.us/oauth/authorize',
        tokenUrl: process.env.ZOOM_TOKEN_URL ?? 'https://zoom.us/oauth/token',
        clientId: process.env.ZOOM_CLIENT_ID ?? '',
        clientSecret: process.env.ZOOM_CLIENT_SECRET ?? '',
        scopes: ['meeting:write'],
        // Zoom authenticates the client at the token endpoint via HTTP Basic,
        // not client_id/client_secret in the body.
        tokenAuthStyle: 'basic',
      }
    }

    const scopes =
      provider === 'gcal'
        ? ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar.events']
        : ['openid', 'email', 'profile', DRIVE_SEARCH_SCOPE]

    return {
      provider,
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      scopes,
      extraAuthParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    }
  }

  private getMissingProviderEnv(provider: Provider): string[] {
    if (provider === 'github') {
      return ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'].filter((k) => !process.env[k])
    }
    if (provider === 'gitlab') {
      return ['GITLAB_CLIENT_ID', 'GITLAB_CLIENT_SECRET'].filter((k) => !process.env[k])
    }
    if (provider === 'outlook' || provider === 'onedrive') {
      return ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'].filter((k) => !process.env[k])
    }
    if (provider === 'linear') {
      return ['LINEAR_CLIENT_ID', 'LINEAR_CLIENT_SECRET'].filter((k) => !process.env[k])
    }
    if (provider === 'salesforce') {
      return ['SALESFORCE_CLIENT_ID', 'SALESFORCE_CLIENT_SECRET'].filter((k) => !process.env[k])
    }
    if (provider === 'dropbox') {
      return ['DROPBOX_CLIENT_ID', 'DROPBOX_CLIENT_SECRET'].filter((k) => !process.env[k])
    }
    if (provider === 'zoom') {
      return ['ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET'].filter((k) => !process.env[k])
    }
    return ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'].filter((k) => !process.env[k])
  }

  /**
   * HMAC key for the signed OAuth `state` (the CSRF/binding token round-tripped
   * through the provider). Prefers a dedicated secret when operators set one,
   * otherwise falls back to the always-present `JWT_ACCESS_SECRET` via
   * `getOrThrow` — mirroring the social-login `OAuthService`. The previous code
   * referenced a `JWT_SECRET` that is never defined app-wide and a hardcoded
   * literal, which resolved to a forgeable, predictable key.
   */
  private getStateSecret(): string {
    return (
      this.config.get<string>('INTEGRATIONS_OAUTH_STATE_SECRET') ??
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET')
    )
  }

  private getRedirectUri(provider: Provider) {
    const apiBase = process.env.API_PUBLIC_URL ?? process.env.APP_API_URL ?? 'http://localhost:3001'
    return `${apiBase}/api/v1/integrations/oauth/${provider}/callback`
  }

  private getWebBase() {
    return process.env.APP_URL ?? 'http://localhost:5173'
  }

  getSuccessRedirect(workspaceId: string, provider: string) {
    const webBase = this.getWebBase().replace(/\/$/, '')
    return `${webBase}/app/${workspaceId}/integrations?oauth=success&provider=${encodeURIComponent(provider)}`
  }

  /**
   * §V2-11 — where a failed grant lands.
   *
   * **A defect, found while building the card.** This used to send every
   * failure to `/app?oauth=error&reason=…` — the app root. The banner that
   * reads `?oauth=error` is on `/app/:workspaceId/integrations` and nowhere
   * else, so it rendered on no failure that has ever happened: the one piece
   * of UI whose whole job was to explain a failed connection was unreachable
   * from the failure path. Classic dead control, and invisible because both
   * halves individually look right.
   *
   * With a workspace in hand the redirect now goes where the banner lives; the
   * app root stays as the fallback for a state so broken that not even the
   * workspace could be read out of it.
   */
  getFailureRedirect(reason: string, ctx?: { workspaceId?: string | null; provider?: string | null }) {
    const webBase = this.getWebBase().replace(/\/$/, '')
    const params = new URLSearchParams({ oauth: 'error', reason })
    if (ctx?.provider) params.set('provider', ctx.provider)
    return ctx?.workspaceId
      ? `${webBase}/app/${ctx.workspaceId}/integrations?${params.toString()}`
      : `${webBase}/app?${params.toString()}`
  }

  /**
   * Read a callback's state WITHOUT throwing — for the failure path only.
   *
   * The error card is attached to an integration, so the failure handler needs
   * to know which one even when the thing that failed is what would normally
   * tell it. Signature-checked all the same: an unsigned state must not be
   * able to write an error message onto somebody else's workspace.
   */
  peekState(state: string): { workspaceId: string; provider: Provider } | null {
    try {
      const payload = this.verifyState(state)
      if (!payload?.workspaceId || !payload?.provider) return null
      return { workspaceId: payload.workspaceId, provider: payload.provider }
    } catch {
      return null
    }
  }

  private async exchangeCode(cfg: ProviderConfig, code: string, redirectUri: string) {
    const body = new URLSearchParams({
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    })
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    }
    if (cfg.tokenAuthStyle === 'basic') {
      headers.Authorization = `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`
    } else {
      body.set('client_id', cfg.clientId)
      body.set('client_secret', cfg.clientSecret)
    }
    const res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers,
      body: body.toString(),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      throw new BadRequestException(`OAuth token exchange failed (${res.status})`)
    }
    const raw = (await res.json()) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      scope?: string
    }
    if (!raw.access_token) throw new BadRequestException('OAuth token payload missing access token')
    return {
      accessToken: raw.access_token,
      refreshToken: raw.refresh_token ?? null,
      expiresAt: raw.expires_in ? new Date(Date.now() + raw.expires_in * 1000) : null,
      scopes: raw.scope ? raw.scope.split(/\s+/).filter(Boolean) : cfg.scopes,
    }
  }

  private async fetchProfile(provider: Provider, accessToken: string) {
    if (provider === 'github') {
      const meRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
        },
        signal: AbortSignal.timeout(20_000),
      })
      if (!meRes.ok) throw new BadRequestException('Failed to fetch GitHub user profile')
      const me = (await meRes.json()) as { id: number; login?: string; email?: string | null }
      let email = me.email ?? null
      if (!email) {
        const emailRes = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
          },
          signal: AbortSignal.timeout(20_000),
        })
        if (emailRes.ok) {
          const emails = (await emailRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>
          email = emails.find((e) => e.primary && e.verified)?.email ?? emails.find((e) => e.verified)?.email ?? null
        }
      }
      return {
        id: String(me.id),
        email,
        metadata: { login: me.login ?? null },
      }
    }
    if (provider === 'gitlab') {
      const meRes = await fetch(`${process.env.GITLAB_API_URL ?? 'https://gitlab.com/api/v4'}/user`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(20_000),
      })
      if (!meRes.ok) throw new BadRequestException('Failed to fetch GitLab user profile')
      const me = (await meRes.json()) as { id: number; username?: string; email?: string | null }
      return {
        id: String(me.id),
        email: me.email ?? null,
        metadata: { username: me.username ?? null },
      }
    }
    if (provider === 'outlook' || provider === 'onedrive') {
      const meRes = await fetch(
        `${process.env.MICROSOFT_GRAPH_API_URL ?? 'https://graph.microsoft.com/v1.0'}/me`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          signal: AbortSignal.timeout(20_000),
        },
      )
      if (!meRes.ok) throw new BadRequestException('Failed to fetch Microsoft profile')
      const me = (await meRes.json()) as {
        id: string
        userPrincipalName?: string
        mail?: string
        displayName?: string
      }
      return {
        id: me.id,
        email: me.mail ?? me.userPrincipalName ?? null,
        metadata: { displayName: me.displayName ?? null },
      }
    }
    if (provider === 'linear') {
      const viewerRes = await fetch(process.env.LINEAR_GRAPHQL_URL ?? 'https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'query ViewerProfile { viewer { id email name } }',
        }),
        signal: AbortSignal.timeout(20_000),
      })
      if (!viewerRes.ok) throw new BadRequestException('Failed to fetch Linear profile')
      const viewerBody = (await viewerRes.json()) as {
        data?: { viewer?: { id?: string; email?: string | null; name?: string | null } }
      }
      const viewer = viewerBody.data?.viewer
      if (!viewer?.id) throw new BadRequestException('Linear profile payload missing id')
      return {
        id: viewer.id,
        email: viewer.email ?? null,
        metadata: { name: viewer.name ?? null },
      }
    }
    if (provider === 'salesforce') {
      const userInfoRes = await fetch(
        process.env.SALESFORCE_USERINFO_URL ?? 'https://login.salesforce.com/services/oauth2/userinfo',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          signal: AbortSignal.timeout(20_000),
        },
      )
      if (!userInfoRes.ok) throw new BadRequestException('Failed to fetch Salesforce profile')
      const userInfo = (await userInfoRes.json()) as {
        user_id?: string
        email?: string | null
        preferred_username?: string | null
        name?: string | null
      }
      const userId = userInfo.user_id
      if (!userId) throw new BadRequestException('Salesforce profile payload missing user_id')
      return {
        id: userId,
        email: userInfo.email ?? userInfo.preferred_username ?? null,
        metadata: { name: userInfo.name ?? null },
      }
    }

    if (provider === 'dropbox') {
      // `users/get_current_account` takes no args — Dropbox RPC endpoints want
      // an explicit JSON `null` body (or no Content-Type). Sending `{}` 400s.
      const meRes = await fetch(
        `${process.env.DROPBOX_API_URL ?? 'https://api.dropboxapi.com/2'}/users/get_current_account`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: 'null',
          signal: AbortSignal.timeout(20_000),
        },
      )
      if (!meRes.ok) throw new BadRequestException('Failed to fetch Dropbox profile')
      const me = (await meRes.json()) as {
        account_id?: string
        email?: string | null
        name?: { display_name?: string | null }
      }
      if (!me.account_id) throw new BadRequestException('Dropbox profile payload missing account_id')
      return {
        id: me.account_id,
        email: me.email ?? null,
        metadata: { name: me.name?.display_name ?? null },
      }
    }
    if (provider === 'zoom') {
      const meRes = await fetch(`${process.env.ZOOM_API_URL ?? 'https://api.zoom.us/v2'}/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(20_000),
      })
      if (!meRes.ok) throw new BadRequestException('Failed to fetch Zoom profile')
      const me = (await meRes.json()) as {
        id?: string
        email?: string | null
        first_name?: string | null
        last_name?: string | null
      }
      if (!me.id) throw new BadRequestException('Zoom profile payload missing id')
      return {
        id: me.id,
        email: me.email ?? null,
        metadata: { name: [me.first_name, me.last_name].filter(Boolean).join(' ') || null },
      }
    }

    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(20_000),
    })
    if (!profileRes.ok) throw new BadRequestException('Failed to fetch Google profile')
    const profile = (await profileRes.json()) as { sub: string; email?: string; name?: string }
    return {
      id: profile.sub,
      email: profile.email ?? null,
      metadata: { name: profile.name ?? null },
    }
  }
}
