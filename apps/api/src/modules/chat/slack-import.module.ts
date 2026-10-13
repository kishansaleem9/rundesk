import { Body, Controller, Module, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { DatabaseModule } from '../../common/database/database.module'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { ImportFilesModule } from '../integrations/clickup-import/import-files.module'
import { SlackImportService } from './slack-import.service'

/**
 * Imports › **Slack** (`commit-log/log-601eacc-2`): an export uploaded first
 * (`POST …/import/files`), previewed, then imported as a job the page follows
 * on the spreadsheet import's job route. Asked as every import is:
 * `workspace.import`, an admin's by default, and never a guest's.
 */
@ApiTags('integrations:slack-import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/import/slack')
export class SlackImportController {
  constructor(private readonly svc: SlackImportService) {}

  @Post('preview')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('workspace.import')
  @ApiOperation({ summary: 'What a Slack export holds — its public channels and how many messages each, and its people found here' })
  preview(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any, @Body() body: { fileKey?: string }) {
    return this.svc.preview(workspaceId, { id: user.id, role: user.role }, body ?? {})
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('workspace.import')
  @ApiOperation({ summary: 'Import the chosen channels of a Slack export into Chat — returns a job id to poll' })
  run(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: { fileKey?: string; channels?: string[]; spaceId?: string | null },
  ) {
    return this.svc.start(workspaceId, { id: user.id, role: user.role }, body ?? {})
  }
}

@Module({
  imports: [DatabaseModule, CustomRolesModule, ImportFilesModule],
  controllers: [SlackImportController],
  providers: [SlackImportService, WorkspaceMemberGuard],
})
export class SlackImportModule {}
