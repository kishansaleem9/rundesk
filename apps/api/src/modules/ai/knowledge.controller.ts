import { Controller, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AiService } from './ai.service'
import { KnowledgeIndexerService } from './knowledge-indexer.service'

/**
 * §15.1 admin backfill for the semantic Knowledge Base (trigger a). Kept on its
 * own controller so the route matches the spec — POST /workspaces/:id/knowledge/reindex
 * — while living entirely inside the AI module. Manager/admin only; the AI
 * question endpoint stays on AiController. The handler asks the caller's role
 * in THIS workspace, which refuses its guests and members alike; a guard that
 * read the account's role sat here and refused nobody who was a guest of it
 * (`guest-guard-reads-the-account-role`).
 */
@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:id/knowledge')
export class KnowledgeController {
  constructor(
    private readonly ai: AiService,
    private readonly indexer: KnowledgeIndexerService,
  ) {}

  @Post('reindex')
  @ApiOperation({ summary: 'Re-embed this workspace into the semantic knowledge store (admin/manager)' })
  async reindex(@CurrentUser() user: any, @Param('id') workspaceId: string) {
    // Reindexing is a privileged, workspace-wide action — managers/admins only.
    await this.ai.assertWorkspaceManager(workspaceId, user.id)
    return this.indexer.indexWorkspaceContent(workspaceId)
  }
}
