import { Controller, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AiFieldsService } from './ai-fields.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { PlanFeatureGuard } from '../plans/plan-feature.guard'
import { RequirePlan } from '../plans/require-plan.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

/**
 * An AI field's Generate (`commit-log/log-c980bee-1`, `ledger-rows/row-719`):
 * beside the field's other routes, under the workspace's plan `ai` feature as
 * the rest of the AI surface is.
 */
@ApiTags('custom-fields')
@ApiBearerAuth()
@RequirePlan('ai')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard, PlanFeatureGuard)
@Controller('workspaces/:workspaceId')
export class AiFieldsController {
  constructor(private readonly svc: AiFieldsService) {}

  @Post('tasks/:taskId/custom-fields/:fieldId/generate')
  @ApiOperation({ summary: 'Fill an AI field on a task from the model' })
  generate(
    @CurrentUser() user: { id: string; role?: string },
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Param('fieldId') fieldId: string,
  ) {
    return this.svc.generate(workspaceId, taskId, fieldId, { id: user.id, role: user.role })
  }
}
