import { Controller, Get, Put, Post, Delete, Body, Param, UseGuards, ForbiddenException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { TenantDatabasesService } from './tenant-databases.service'
import type { TenantDatabaseStatus } from './tenant-databases.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { CurrentUserPayload } from '../tasks/types'

/**
 * §14.2 — super-admin operations surface for the dedicated-database registry.
 * Every handler is gated to `super_admin` (mirrors the org super-admin routes);
 * the raw connection string is only ever accepted on input, never returned.
 */
@ApiTags('tenant-databases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ops/tenant-databases')
export class TenantDatabasesController {
  constructor(private readonly tenantDatabases: TenantDatabasesService) {}

  @Get()
  @ApiOperation({ summary: 'List all tenant databases (masked) — super admin' })
  async list(@CurrentUser() user: CurrentUserPayload) {
    if (user.role !== 'super_admin') throw new ForbiddenException('Super admin access required')
    return this.tenantDatabases.listAll()
  }

  @Put(':organizationId')
  @ApiOperation({ summary: 'Create or update an org dedicated-database mapping — super admin' })
  async upsert(
    @Param('organizationId') organizationId: string,
    @Body() body: { connectionUrl: string; label?: string | null; status?: TenantDatabaseStatus },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (user.role !== 'super_admin') throw new ForbiddenException('Super admin access required')
    return this.tenantDatabases.upsertForOrg(organizationId, body)
  }

  @Post(':organizationId/test')
  @ApiOperation({ summary: 'Test the dedicated database connection (select 1) — super admin' })
  async test(@Param('organizationId') organizationId: string, @CurrentUser() user: CurrentUserPayload) {
    if (user.role !== 'super_admin') throw new ForbiddenException('Super admin access required')
    return this.tenantDatabases.testConnection(organizationId)
  }

  @Post(':organizationId/provision')
  @ApiOperation({ summary: 'Provision the dedicated DB schema (run Drizzle migrations) — super admin' })
  async provision(@Param('organizationId') organizationId: string, @CurrentUser() user: CurrentUserPayload) {
    if (user.role !== 'super_admin') throw new ForbiddenException('Super admin access required')
    return this.tenantDatabases.provisionSchema(organizationId)
  }

  @Get(':organizationId/schema-status')
  @ApiOperation({ summary: 'Report dedicated DB schema presence + reachability — super admin' })
  async schemaStatus(@Param('organizationId') organizationId: string, @CurrentUser() user: CurrentUserPayload) {
    if (user.role !== 'super_admin') throw new ForbiddenException('Super admin access required')
    return this.tenantDatabases.getSchemaStatus(organizationId)
  }

  @Post(':organizationId/migrate-data')
  @ApiOperation({ summary: 'Copy the org\'s core data shared → dedicated (supports dryRun) — super admin' })
  async migrateData(
    @Param('organizationId') organizationId: string,
    @Body() body: { dryRun?: boolean },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (user.role !== 'super_admin') throw new ForbiddenException('Super admin access required')
    return this.tenantDatabases.migrateOrgData(organizationId, { dryRun: body?.dryRun ?? false })
  }

  @Post(':organizationId/disable')
  @ApiOperation({ summary: 'Disable routing to the dedicated database — super admin' })
  async disable(@Param('organizationId') organizationId: string, @CurrentUser() user: CurrentUserPayload) {
    if (user.role !== 'super_admin') throw new ForbiddenException('Super admin access required')
    return this.tenantDatabases.disable(organizationId)
  }

  @Delete(':organizationId')
  @ApiOperation({ summary: 'Remove the org dedicated-database mapping — super admin' })
  async remove(@Param('organizationId') organizationId: string, @CurrentUser() user: CurrentUserPayload) {
    if (user.role !== 'super_admin') throw new ForbiddenException('Super admin access required')
    return this.tenantDatabases.remove(organizationId)
  }
}
