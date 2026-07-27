import { BadRequestException, Controller, Get, Param, Query, Req, Res } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { AuthService } from './auth.service'
import { OAuthService } from './oauth.service'
import { setAuthCookies } from './auth-cookies'
import { isOAuthProvider } from './oauth.util'

// Short-lived httpOnly cookie holding the signed OAuth `state`. SameSite=Lax so
// it survives the top-level GET redirect back from the provider.
const STATE_COOKIE = 'rd_oauth_state'
const STATE_COOKIE_MAX_AGE = 10 * 60 // seconds

type RequestWithCookies = FastifyRequest & { cookies?: Record<string, string | undefined> }

/**
 * Google / Microsoft social login (Plan §1.1). All three routes use @Res()
 * directly (no passthrough): the two flow routes issue 302 redirects and the
 * providers route returns a plain object the global interceptor envelopes.
 */
@ApiTags('auth-oauth')
@Controller('auth/oauth')
export class OAuthController {
  constructor(
    private readonly oauth: OAuthService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  // Cookies are only marked Secure in production so they still work over
  // http://localhost in development (mirrors AuthController).
  private get secure(): boolean {
    return (this.config.get<string>('NODE_ENV') ?? 'development') === 'production'
  }

  private get webBase(): string {
    return (this.config.get<string>('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')
  }

  private stateCookieOptions() {
    return { path: '/', httpOnly: true, secure: this.secure, sameSite: 'lax' as const }
  }

  @Get('providers')
  @ApiOperation({ summary: 'Which social login providers are configured (env creds present)' })
  providers() {
    return this.oauth.configuredProviders()
  }

  @Get(':provider')
  @ApiOperation({ summary: 'Start Google/Microsoft OAuth login — 302 to the provider authorize endpoint' })
  start(@Param('provider') provider: string, @Res() res: FastifyReply) {
    if (!isOAuthProvider(provider)) {
      res.redirect(`${this.webBase}/login?error=oauth_unsupported_provider`, 302)
      return
    }
    if (!this.oauth.isConfigured(provider)) {
      res.redirect(`${this.webBase}/login?error=oauth_unconfigured`, 302)
      return
    }
    const { url, state } = this.oauth.beginLogin(provider)
    res.setCookie(STATE_COOKIE, state, { ...this.stateCookieOptions(), maxAge: STATE_COOKIE_MAX_AGE })
    res.redirect(url, 302)
  }

  @Get(':provider/callback')
  @ApiOperation({ summary: 'OAuth provider redirect target — mints a session and bounces to /sso-complete' })
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Req() req: RequestWithCookies,
    @Res() res: FastifyReply,
  ) {
    try {
      if (!isOAuthProvider(provider)) throw new BadRequestException('Unsupported provider')
      if (providerError) throw new BadRequestException(`Provider returned an error: ${providerError}`)
      if (!code) throw new BadRequestException('Missing authorization code')

      // Validate + consume the state cookie before doing any network work.
      this.oauth.validateState(provider, state, req.cookies?.[STATE_COOKIE])
      res.clearCookie(STATE_COOKIE, this.stateCookieOptions())

      const meta = {
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
      }

      const { profile, tokens } = await this.oauth.exchangeCodeForProfile(provider, code)
      const { userId } = await this.oauth.upsertUserAndLink(provider, profile, tokens, meta)

      // Reuse the exact session-minting path used by password + SSO logins:
      // mints access+refresh, inserts the sessions row, enforces the session
      // cap, and audit-logs auth.login.
      const bundle = await this.auth.issueSessionForUserId(userId, meta)
      setAuthCookies(res, bundle, { secure: this.secure })

      // Land the browser on the SPA's SSO-complete route, which hydrates the
      // session from the cookies (POST /auth/refresh) — no token in the URL.
      const target = new URL(`${this.webBase}/sso-complete`)
      const primaryWorkspaceId = bundle.workspaces?.[0]?.id
      if (primaryWorkspaceId) target.searchParams.set('workspaceId', primaryWorkspaceId)
      res.redirect(target.toString(), 302)
    } catch (err) {
      res.clearCookie(STATE_COOKIE, this.stateCookieOptions())
      const message = err instanceof Error ? err.message : 'OAuth sign-in failed'
      const target = new URL(`${this.webBase}/login`)
      target.searchParams.set('ssoError', message)
      res.redirect(target.toString(), 302)
    }
  }
}
