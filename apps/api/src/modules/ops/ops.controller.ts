import { Controller, Get, UseGuards, ForbiddenException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { OpsService } from './ops.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { CurrentUserPayload } from '../tasks/types'

/**
 * §14.5 SaaS Ops Dashboard (Internal). Both routes are super-admin only — they
 * expose cross-tenant platform metrics. The gate mirrors OrganizationsController.
 */
@ApiTags('ops')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ops')
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Platform-wide SaaS ops metrics (super admin)' })
  async metrics(@CurrentUser() user: CurrentUserPayload) {
    if (user.role !== 'super_admin') throw new ForbiddenException('Super admin access required')
    return this.ops.getMetrics()
  }

  @Get('organizations')
  @ApiOperation({ summary: 'Per-organization ops rows (super admin)' })
  async organizations(@CurrentUser() user: CurrentUserPayload) {
    if (user.role !== 'super_admin') throw new ForbiddenException('Super admin access required')
    return this.ops.getOrganizations()
  }
}
