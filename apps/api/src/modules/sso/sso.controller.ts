import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { SsoService, type SsoConnectionUpdate } from './sso.service'
import { AuthService } from '../auth/auth.service'
import { setAuthCookies } from '../auth/auth-cookies'
import type { SsoProvider } from '@rundesk/db'

type CurrentUserPayload = { id: string; email: string }

@ApiTags('sso-admin')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/sso')
// The permission alone decides. An admin-or-manager guard in front of it
// meant a custom role granting `sso.manage` to anybody else was never usable.
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('sso.manage')
export class SsoAdminController {
  constructor(private sso: SsoService) {}

  @Get()
  list(@Param('workspaceId') workspaceId: string) {
    return this.sso.listConnections(workspaceId)
  }

  @Put(':provider')
  upsert(
    @Param('workspaceId') workspaceId: string,
    @Param('provider') provider: string,
    @Body() body: SsoConnectionUpdate,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const normalized = provider.toLowerCase() as SsoProvider
    if (normalized !== 'oidc' && normalized !== 'saml') {
      return { error: 'provider must be oidc or saml' }
    }
    return this.sso.upsertConnection(workspaceId, normalized, user.id, body)
  }

  @Delete(':connectionId')
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('connectionId') connectionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.sso.deleteConnection(workspaceId, connectionId, user.id)
  }
}

@ApiTags('sso-auth')
@Controller('auth/sso')
export class SsoAuthController {
  constructor(
    private sso: SsoService,
    private auth: AuthService,
  ) {}

  /**
   * GET /auth/sso/lookup?email=user@example.com — does this domain have SSO?
   * Public endpoint used by the sign-in page to decide whether to surface
   * "Sign in with SSO". Returns null when no enforced connection exists.
   */
  @Get('lookup')
  async lookup(@Query('email') email?: string) {
    if (!email) return { connection: null }
    const conn = await this.sso.findConnectionForEmail(email)
    if (!conn) return { connection: null }
    return {
      connection: {
        workspaceId: conn.workspaceId,
        provider: conn.provider,
        displayName: conn.displayName,
      },
    }
  }

  @Get(':provider/start')
  async start(
    @Param('provider') provider: string,
    @Query('workspaceId') workspaceId: string,
    @Query('redirectTo') redirectTo: string | undefined,
    @Res() res: any,
  ) {
    const normalized = provider.toLowerCase() as SsoProvider
    if (!workspaceId) {
      res.code(400).send({ error: 'workspaceId query parameter is required' })
      return
    }
    if (normalized === 'oidc') {
      const { url } = await this.sso.beginOidcLogin(workspaceId, redirectTo)
      res.redirect(url, 302)
      return
    }
    if (normalized === 'saml') {
      const { url } = await this.sso.beginSamlLogin(workspaceId, redirectTo)
      res.redirect(url, 302)
      return
    }
    res.code(400).send({ error: 'provider must be oidc or saml' })
  }

  @Get('oidc/callback')
  async oidcCallback(@Query() query: Record<string, string>, @Res() res: any) {
    try {
      // Reconstruct the URL with all query params so openid-client can verify
      // signatures/nonces against the exact value the IdP returned.
      const callbackUrl = new URL(res.request?.url ?? '/', 'https://placeholder.invalid')
      Object.entries(query).forEach(([k, v]) => callbackUrl.searchParams.set(k, v))
      const result = await this.sso.handleOidcCallback(callbackUrl)
      const tokenBundle = await this.auth.issueSessionForUserId(result.userId, {
        ip: res.request?.ip,
        userAgent: res.request?.headers?.['user-agent'],
      })
      return this.redirectToApp(res, tokenBundle, result.workspaceId)
    } catch (err: any) {
      return this.redirectWithError(res, err?.message ?? 'SSO sign-in failed')
    }
  }

  @Post('saml/callback')
  @HttpCode(302)
  async samlCallback(@Body() body: { SAMLResponse: string; RelayState?: string }, @Res() res: any) {
    try {
      const result = await this.sso.handleSamlCallback(body)
      const tokenBundle = await this.auth.issueSessionForUserId(result.userId, {
        ip: res.request?.ip,
        userAgent: res.request?.headers?.['user-agent'],
      })
      return this.redirectToApp(res, tokenBundle, result.workspaceId)
    } catch (err: any) {
      return this.redirectWithError(res, err?.message ?? 'SAML sign-in failed')
    }
  }

  /**
   * Finish SSO by setting the session as httpOnly cookies (access + refresh)
   * plus the readable CSRF cookie, then redirecting to the SPA. Tokens are NO
   * LONGER placed in the URL hash (Plan §1.1) — the /sso-complete route hydrates
   * from the cookie session via POST /auth/refresh, so the token never becomes a
   * durable client-side store and never appears in browser history / referrers.
   */
  private redirectToApp(res: any, bundle: { accessToken: string; refreshToken: string }, workspaceId: string) {
    const secure = (process.env.NODE_ENV ?? 'development') === 'production'
    setAuthCookies(res, bundle, { secure })
    const appUrl = process.env.APP_URL ?? 'http://localhost:5173'
    const target = new URL(`${appUrl}/sso-complete`)
    if (workspaceId) target.searchParams.set('workspaceId', workspaceId)
    res.redirect(target.toString(), 302)
  }

  private redirectWithError(res: any, message: string) {
    const appUrl = process.env.APP_URL ?? 'http://localhost:5173'
    const target = new URL(`${appUrl}/login`)
    target.searchParams.set('ssoError', message)
    res.redirect(target.toString(), 302)
  }
}
