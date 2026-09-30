import { Controller, Post, Body, UseGuards, Req, Res, HttpCode, HttpStatus, Get, Query, Delete, Param, GoneException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { AuthService } from './auth.service'
import { LocalAuthGuard } from './guards/local-auth.guard'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard'
import { AUTH_ROUTE_LIMITS } from '../../common/guards/auth-route-limits'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { SignupDto } from './dto/signup.dto'
import { LoginDto } from './dto/login.dto'
import { REFRESH_TOKEN_COOKIE, clearAuthCookies, setAuthCookies } from './auth-cookies'

function sessionMeta(req: FastifyRequest) {
  return {
    userAgent: (req.headers['user-agent'] as string | undefined) ?? undefined,
    ip: req.ip,
  }
}

// Fastify request with cookies populated by @fastify/cookie.
type RequestWithCookies = FastifyRequest & { cookies?: Record<string, string | undefined> }

@ApiTags('auth')
@Controller('auth')
// Controller-level so it runs BEFORE route guards (e.g. LocalAuthGuard): brute
// -force attempts with wrong passwords must still count toward the limit. Only
// routes carrying @RateLimit are actually throttled; everything else is a no-op.
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  // Secure only in production so cookies still work over http://localhost in dev.
  private get cookiesSecure(): boolean {
    return (this.config.get<string>('NODE_ENV') ?? 'development') === 'production'
  }

  /** Attach the httpOnly access/refresh + readable CSRF cookies to a response. */
  private issueCookies(reply: FastifyReply, bundle: { accessToken: string; refreshToken: string }) {
    setAuthCookies(reply, bundle, { secure: this.cookiesSecure })
  }

  @Post('signup')
  @RateLimit(AUTH_ROUTE_LIMITS.signUp)
  @ApiOperation({ summary: 'Atomic organization signup with initial workspace and optional invites' })
  async signup(@Body() dto: SignupDto, @Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const bundle = await this.authService.signUp(dto, sessionMeta(req))
    this.issueCookies(res, bundle)
    return bundle
  }

  /*
   * RETIRED: ONE WAY TO MAKE AN ACCOUNT, AND ONE COUNTER FOR IT
   * (`found-30-sep/register-counted-apart-from-signup`).
   *
   * The old route made an account and a personal workspace, as `signup` does,
   * with sign-up's ten a minute on a counter of its own: one address made ten
   * accounts a minute through each. It was also the odd path out: it kept the
   * email as typed where sign-up lowercases it, so `Ada@…` could be made
   * beside `ada@…`. Its two callers were an unlinked `/register` page, which
   * now sends to `/sign-up`, and eleven suites making their people, which make
   * them through sign-up as a hundred-odd others already did (`signUpApi`).
   *
   * 410, not 404: the route was here and is gone on purpose, and an old client
   * is told where the one that replaced it is. Nothing is read, hashed or
   * made, so nothing needs a limit.
   */
  @Post('register')
  @ApiOperation({ summary: 'Retired: answers 410. Make an account with POST /auth/signup' })
  register(): never {
    throw new GoneException('POST /auth/register has been retired. Make an account with POST /auth/signup.')
  }

  @Post('login')
  @RateLimit({ limit: 10, windowMs: 60_000 })
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ type: LoginDto })
  async login(
    @CurrentUser() user: any,
    @Body() dto: LoginDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    // Password already validated by LocalAuthGuard. Enforce the second factor
    // for accounts with a verified TOTP secret BEFORE issuing any token; this is
    // a no-op (and the flow is unchanged) for password-only accounts.
    await this.authService.assertTotpSatisfied(user.id, dto.totpCode)
    const bundle = await this.authService.login(user, sessionMeta(req))
    this.issueCookies(res, bundle)
    return bundle
  }

  @Post('refresh')
  @RateLimit({ limit: 30, windowMs: 60_000 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token (rotates the refresh token)' })
  async refresh(
    @Body() body: { refreshToken?: string },
    @Req() req: RequestWithCookies,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    // Accept the refresh token from the JSON body (Bearer/API clients) or, for
    // browser sessions, from the httpOnly refresh_token cookie.
    const token = body?.refreshToken ?? req.cookies?.[REFRESH_TOKEN_COOKIE]
    const bundle = await this.authService.refresh(token as string, sessionMeta(req))
    this.issueCookies(res, bundle)
    return bundle
  }

  @Post('forgot-password')
  @RateLimit({ limit: 5, windowMs: 60_000 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset link' })
  async forgotPassword(@Body() body: { email: string }) {
    return this.authService.requestPasswordReset(body.email)
  }

  @Post('reset-password')
  @RateLimit({ limit: 10, windowMs: 60_000 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with a valid reset token' })
  async resetPassword(@Body() body: { token: string; password: string }) {
    return this.authService.resetPassword(body.token, body.password)
  }

  @Post('verify-email')
  @RateLimit({ limit: 10, windowMs: 60_000 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a user email address with a token' })
  async verifyEmail(@Body() body: { token: string }) {
    return this.authService.verifyEmail(body.token)
  }

  @Post('resend-verification')
  @RateLimit({ limit: 5, windowMs: 60_000 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend the email-verification link' })
  async resendVerification(@Body() body: { email: string }) {
    return this.authService.resendVerification(body.email)
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout: clear auth cookies and revoke the refresh session' })
  async logout(
    @Body() body: { refreshToken?: string },
    @Req() req: RequestWithCookies,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    // Revoke the session identified by the presented refresh token (body for
    // Bearer clients, cookie for browsers). Always clear the cookies so the
    // browser session ends even if no refresh token is present.
    const token = body?.refreshToken ?? req.cookies?.[REFRESH_TOKEN_COOKIE]
    if (token) await this.authService.logout(token)
    clearAuthCookies(res, { secure: this.cookiesSecure })
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current authenticated user payload' })
  async me(@CurrentUser() user: any) {
    return user
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List current user sessions' })
  sessions(@CurrentUser() user: any, @Query('currentRefreshToken') currentRefreshToken?: string) {
    return this.authService.listSessions(user.id, currentRefreshToken)
  }

  /*
   * THE CALLER'S SESSION IS THE ONE ITS REFRESH TOKEN NAMES: in the body, or a
   * browser's refresh cookie, as the password change reads it. The body alone
   * was read, and the web keeps its refresh token in memory only, so after a
   * reload "Sign out other sessions" revoked the browser's own session too;
   * now that a revoked session's access token is refused at once
   * (`found-30-sep/revoked-sessions-keep-their-access-tokens`), that signed
   * the person out where it had let them read for fifteen minutes more.
   */
  @Post('sessions/revoke-others')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke all sessions except current one' })
  revokeOthers(@CurrentUser() user: any, @Body() body: { currentRefreshToken?: string }, @Req() req: RequestWithCookies) {
    const named = typeof body?.currentRefreshToken === 'string' && body.currentRefreshToken ? body.currentRefreshToken : null
    return this.authService.revokeOtherSessions(user.id, named ?? req.cookies?.[REFRESH_TOKEN_COOKIE] ?? null)
  }

  @Delete('sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a single user session' })
  revokeSession(@CurrentUser() user: any, @Param('sessionId') sessionId: string) {
    return this.authService.revokeSession(user.id, sessionId)
  }
}
