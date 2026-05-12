import { Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { SampleDataService } from './sample-data.service'

/**
 * One-shot endpoint that loads a realistic demo workspace.
 * Admin-only and idempotent-by-refusal: see SampleDataService.seed.
 */
@ApiTags('sample-data')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceAdminGuard)
@Controller('workspaces/:workspaceId/sample-data')
export class SampleDataController {
  constructor(private readonly sampleData: SampleDataService) {}

  @Post('seed')
  @ApiOperation({
    summary: 'Seed a demo workspace (only if empty)',
    description:
      'Creates 3 spaces, 6 projects, 24 lists with default custom statuses, a curated set of tasks with subtasks, checklists, labels and assignees, plus a handful of docs and goals. Rejects with 409 if the workspace already has any spaces.',
  })
  async seed(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @CurrentUser() user: any,
  ) {
    const summary = await this.sampleData.seed(workspaceId, { id: user.id, email: user.email })
    return { ok: true, summary }
  }
}
