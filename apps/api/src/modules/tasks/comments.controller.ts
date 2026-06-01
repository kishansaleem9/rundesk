import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { TasksService } from './tasks.service'
import { CreateCommentDto } from './dto/comment.dto'
import type { CurrentUserPayload } from './types'

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks/:taskId/comments')
@UseGuards(JwtAuthGuard)
export class TaskCommentsController {
  constructor(private tasks: TasksService) {}

  @Get()
  list(@Param('taskId') taskId: string) {
    return this.tasks.listComments(taskId)
  }

  @Post()
  create(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateCommentDto,
  ) {
    return this.tasks.createComment(taskId, user.id, body.body, body.parentCommentId, body.mentions)
  }

  @Patch(':commentId')
  update(
    @Param('commentId') commentId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { body: string },
  ) {
    return this.tasks.updateComment(commentId, user.id, body.body)
  }

  @Delete(':commentId')
  delete(@Param('commentId') commentId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.tasks.deleteComment(commentId, user.id)
  }

  @Post(':commentId/reactions')
  toggleReaction(
    @Param('commentId') commentId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { emoji: string },
  ) {
    return this.tasks.toggleReaction(commentId, user.id, body.emoji)
  }

  @Post(':commentId/assign')
  assign(
    @Param('commentId') commentId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { userId: string | null },
  ) {
    return this.tasks.assignComment(commentId, user.id, body.userId)
  }

  @Post(':commentId/resolve')
  resolve(
    @Param('commentId') commentId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { resolved: boolean },
  ) {
    return this.tasks.resolveComment(commentId, user.id, body.resolved)
  }
}
