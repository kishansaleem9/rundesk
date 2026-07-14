import { Controller, Post, Body, UseGuards, Req, HttpCode, HttpStatus, Get, Query, Delete, Param } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import { AuthService } from './auth.service'
import { LocalAuthGuard } from './guards/local-auth.guard'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RegisterDto } from './dto/register.dto'
import { SignupDto } from './dto/signup.dto'
import { LoginDto } from './dto/login.dto'

function sessionMeta(req: FastifyRequest) {
  return {
    userAgent: (req.headers['user-agent'] as string | undefined) ?? undefined,
    ip: req.ip,
  }
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @ApiOperation({ summary: 'Atomic organization signup with initial workspace and optional invites' })
  async signup(@Body() dto: SignupDto, @Req() req: FastifyRequest) {
    return this.authService.signUp(dto, sessionMeta(req))
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a new user (creates a personal workspace) - DEPRECATED: use /signup' })
  async register(@Body() dto: RegisterDto, @Req() req: FastifyRequest) {
    return this.authService.register(dto, sessionMeta(req))
  }

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ type: LoginDto })
  async login(@CurrentUser() user: any, @Req() req: FastifyRequest) {
    return this.authService.login(user, sessionMeta(req))
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token (rotates the refresh token)' })
  async refresh(@Body() body: { refreshToken: string }, @Req() req: FastifyRequest) {
    return this.authService.refresh(body.refreshToken, sessionMeta(req))
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset link' })
  async forgotPassword(@Body() body: { email: string }) {
    return this.authService.requestPasswordReset(body.email)
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with a valid reset token' })
  async resetPassword(@Body() body: { token: string; password: string }) {
    return this.authService.resetPassword(body.token, body.password)
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a user email address with a token' })
  async verifyEmail(@Body() body: { token: string }) {
    return this.authService.verifyEmail(body.token)
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend the email-verification link' })
  async resendVerification(@Body() body: { email: string }) {
    return this.authService.resendVerification(body.email)
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  async logout(@Body() body: { refreshToken: string }) {
    await this.authService.logout(body.refreshToken)
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

  @Post('sessions/revoke-others')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke all sessions except current one' })
  revokeOthers(@CurrentUser() user: any, @Body() body: { currentRefreshToken?: string }) {
    return this.authService.revokeOtherSessions(user.id, body.currentRefreshToken)
  }

  @Delete('sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a single user session' })
  revokeSession(@CurrentUser() user: any, @Param('sessionId') sessionId: string) {
    return this.authService.revokeSession(user.id, sessionId)
  }
}
