import { Body, Controller, Module, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { DatabaseModule } from '../../../common/database/database.module'
import { StorageModule } from '../../../common/storage/storage.module'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../../auth/guards/workspace-member.guard'
import { ImportFilesService } from './import-files'

/**
 * Where the import page puts a file before importing it (`import-files.ts`):
 * one route for every importer that reads a file — sheets, documents,
 * Confluence and Slack — each of which then asks its own permission of the
 * person importing, as it always did.
 */
@ApiTags('integrations:import-files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/import/files')
export class ImportFilesController {
  constructor(private readonly files: ImportFilesService) {}

  @Post()
  @ApiOperation({ summary: 'A signed address to upload a file to import, and the key its import names it by' })
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string },
    @Body() body: { fileName?: string; contentType?: string; sizeBytes?: number; purpose?: string },
  ) {
    return this.files.createUpload(workspaceId, user.id, body ?? {})
  }
}

@Module({
  imports: [DatabaseModule, StorageModule],
  controllers: [ImportFilesController],
  providers: [ImportFilesService, WorkspaceMemberGuard],
  exports: [ImportFilesService],
})
export class ImportFilesModule {}
