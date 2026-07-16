import { Body, Controller, Delete, Get, Header, Ip, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { SecurityService } from './security.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

// ─── 2FA / TOTP (per-user, no workspace) ──────────────────────────────────────
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
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/api-keys')
export class ApiKeysController {
  constructor(private readonly svc: SecurityService) {}

  @Get()
  @ApiOperation({ summary: 'List API keys for workspace' })
  list(@Param('workspaceId') workspaceId: string) {
    return this.svc.listApiKeys(workspaceId)
  }

  @Post()
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'Create a new API key (admin only)' })
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: { name: string; scope?: string },
    @Ip() ip: string,
  ) {
    return this.svc.createApiKey(workspaceId, user.id, body.name, body.scope, ip)
  }

  @Post(':keyId/revoke')
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'Revoke an API key (admin only)' })
  revoke(
    @Param('workspaceId') workspaceId: string,
    @Param('keyId') keyId: string,
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.svc.revokeApiKey(workspaceId, keyId, user.id, ip)
  }

  @Delete(':keyId')
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'Delete an API key (admin only)' })
  delete(
    @Param('workspaceId') workspaceId: string,
    @Param('keyId') keyId: string,
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.svc.deleteApiKey(workspaceId, keyId, user.id, ip)
  }
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────
@ApiTags('security')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceAdminGuard)
@Controller('workspaces/:workspaceId/audit-logs')
export class AuditLogsController {
  constructor(private readonly svc: SecurityService) {}

  @Get()
  @ApiOperation({ summary: 'Get audit trail for workspace (admin only)' })
  list(
    @Param('workspaceId') workspaceId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('actionPrefix') actionPrefix?: string,
    @Query('actionPrefixes') actionPrefixes?: string,
    @Query('actorId') actorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.getAuditLogs(workspaceId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      action,
      actionPrefix,
      actionPrefixes: parsePrefixes(actionPrefixes),
      actorId,
      from: parseAuditDate(from),
      to: parseAuditDate(to),
    })
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="audit-log.csv"')
  @ApiOperation({ summary: 'Export the audit trail as CSV (admin only)' })
  export(
    @Param('workspaceId') workspaceId: string,
    @Query('action') action?: string,
    @Query('actionPrefix') actionPrefix?: string,
    @Query('actionPrefixes') actionPrefixes?: string,
    @Query('actorId') actorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.exportAuditLogsCsv(workspaceId, {
      action,
      actionPrefix,
      actionPrefixes: parsePrefixes(actionPrefixes),
      actorId,
      from: parseAuditDate(from),
      to: parseAuditDate(to),
    })
  }
}

function parseAuditDate(s?: string): Date | undefined {
  if (!s) return undefined
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** Split a comma-separated `actionPrefixes` query param into a clean list. */
function parsePrefixes(s?: string): string[] | undefined {
  if (!s) return undefined
  const list = s.split(',').map((p) => p.trim()).filter(Boolean)
  return list.length ? list : undefined
}
