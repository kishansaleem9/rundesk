import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Db } from '@rundesk/db'
import {
  workspaceIntegrationConnections,
  workspaceMembers,
} from '@rundesk/db'
import { DB_TOKEN } from '../../../common/database/database.module'

type Provider = 'github' | 'gitlab' | 'gcal' | 'google-drive' | 'outlook' | 'onedrive'
type ProviderConfig = {
  provider: Provider
  authUrl: string
  tokenUrl: string
  clientId: string
  clientSecret: string
  scopes: string[]
  extraAuthParams?: Record<string, string>
}

@Injectable()
export class IntegrationConnectionsService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async list(workspaceId: string) {
    const rows = await this.db
      .select()
      .from(workspaceIntegrationConnections)
      .where(eq(workspaceIntegrationConnections.workspaceId, workspaceId))
    return rows.map((row) => ({
      provider: row.provider,
      status: row.status,
      scopes: row.scopes,
      externalAccountEmail: row.externalAccountEmail,
      connectedAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))
  }

  listSupportedProviders() {
    return [
      'github',
      'gitlab',
      'gcal',
      'google-drive',
      'outlook',
      'onedrive',
    ] as const
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

  async handleOAuthCallback(providerRaw: string, code: string, state: string) {
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

    return {
      workspaceId: payload.workspaceId,
      provider,
    }
  }

  async disconnect(workspaceId: string, providerRaw: string) {
    const provider = this.assertProvider(providerRaw)
    await this.db
      .delete(workspaceIntegrationConnections)
      .where(
        and(
          eq(workspaceIntegrationConnections.workspaceId, workspaceId),
          eq(workspaceIntegrationConnections.provider, provider),
        ),
      )
    return { ok: true }
  }

  private assertProvider(providerRaw: string): Provider {
    if (
      providerRaw === 'github' ||
      providerRaw === 'gitlab' ||
      providerRaw === 'gcal' ||
      providerRaw === 'google-drive' ||
      providerRaw === 'outlook' ||
      providerRaw === 'onedrive'
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

    const scopes =
      provider === 'gcal'
        ? ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar.events']
        : ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.file']

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

  private getStateSecret() {
    return process.env.INTEGRATIONS_OAUTH_STATE_SECRET ?? process.env.JWT_SECRET ?? 'rundesk-oauth-state'
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

  getFailureRedirect(reason: string) {
    const webBase = this.getWebBase().replace(/\/$/, '')
    return `${webBase}/app?oauth=error&reason=${encodeURIComponent(reason)}`
  }

  private async exchangeCode(cfg: ProviderConfig, code: string, redirectUri: string) {
    const body = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    })
    const res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
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
