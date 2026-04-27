import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { SecurityService } from './security.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

// ─── 2FA / TOTP ───────────────────────────────────────────────────────────────
@ApiTags('security')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('security/totp')
export class TotpController {
  constructor(private readonly svc: SecurityService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get 2FA status for current user' })
  status(@CurrentUser() user: any) {
    return this.svc.getTotpStatus(user.id)
  }

  @Post('setup')
  @ApiOperation({ summary: 'Begin 2FA setup — returns QR code URL and secret' })
  setup(@CurrentUser() user: any) {
    return this.svc.setupTotp(user.id)
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify TOTP code to activate 2FA' })
  verify(@CurrentUser() user: any, @Body() body: { code: string }) {
    return this.svc.verifyAndActivateTotp(user.id, body.code)
  }

  @Delete('disable')
  @ApiOperation({ summary: 'Disable 2FA for current user' })
  async disable(@CurrentUser() user: any) {
    await this.svc.disableTotp(user.id)
    return { ok: true }
  }
}

// ─── API Keys ─────────────────────────────────────────────────────────────────
@ApiTags('security')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/api-keys')
export class ApiKeysController {
  constructor(private readonly svc: SecurityService) {}

  @Get()
  @ApiOperation({ summary: 'List API keys for workspace' })
  list(@Param('workspaceId') workspaceId: string) {
    return this.svc.listApiKeys(workspaceId)
  }

  @Post()
  @ApiOperation({ summary: 'Create a new API key' })
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: { name: string; scope?: string },
  ) {
    return this.svc.createApiKey(workspaceId, user.id, body.name, body.scope)
  }

  @Post(':keyId/revoke')
  @ApiOperation({ summary: 'Revoke an API key' })
  revoke(@Param('keyId') keyId: string) {
    return this.svc.revokeApiKey(keyId)
  }

  @Delete(':keyId')
  @ApiOperation({ summary: 'Delete an API key' })
  delete(@Param('keyId') keyId: string) {
    return this.svc.deleteApiKey(keyId)
  }
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────
@ApiTags('security')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/audit-logs')
export class AuditLogsController {
  constructor(private readonly svc: SecurityService) {}

  @Get()
  @ApiOperation({ summary: 'Get audit trail for workspace' })
  list(
    @Param('workspaceId') workspaceId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
  ) {
    return this.svc.getAuditLogs(workspaceId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      action,
    })
  }
}
