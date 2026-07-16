import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { TasksService } from './tasks.service'
import { CreateExternalLinkDto } from './dto/external-link.dto'
import type { CurrentUserPayload } from './types'

/**
 * Task ↔ external-service links (Plan §12.8 GitHub/GitLab, §12.2 Google Drive).
 * Access is enforced like other nested task writes (ResourceMemberGuard on the
 * :taskId param + the service's task-write access check).
 */
@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks/:taskId/links')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class TaskExternalLinksController {
  constructor(private tasks: TasksService) {}

  @Get()
  list(@Param('taskId') taskId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.tasks.listExternalLinks(taskId, user.id)
  }

  @Post()
  create(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateExternalLinkDto,
  ) {
    return this.tasks.addExternalLink(taskId, user.id, { url: body.url, provider: body.provider })
  }

  @Post(':linkId/refresh')
  refresh(
    @Param('taskId') taskId: string,
    @Param('linkId') linkId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasks.refreshExternalLink(taskId, linkId, user.id)
  }

  @Delete(':linkId')
  remove(
    @Param('taskId') taskId: string,
    @Param('linkId') linkId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasks.removeExternalLink(taskId, linkId, user.id)
  }
}
