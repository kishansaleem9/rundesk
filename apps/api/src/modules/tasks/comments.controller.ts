import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { TasksService } from './tasks.service'
import { CreateCommentDto } from './dto/comment.dto'
import type { CurrentUserPayload } from './types'

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks/:taskId/comments')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class TaskCommentsController {
  constructor(private tasks: TasksService) {}

  @Get()
  list(@Param('taskId') taskId: string, @CurrentUser() user: CurrentUserPayload) {
    // The viewer is threaded in for §V2-S06's `savedByMe` — a bookmark is per
    // person, so the list cannot be the same for everybody.
    return this.tasks.listComments(taskId, user.id)
  }

  /**
   * §V2-05, frame `04:00` — the @ picker's people, each flagged with whether
   * they can actually open this task.
   *
   * It hangs off the comments controller because that is the guard it needs:
   * `ResourceMemberGuard` resolves `:taskId` and refuses anyone who cannot
   * reach the task themselves, so a person cannot use this to learn the
   * membership of a task they have no business seeing.
   */
  @Get('mention-candidates')
  mentionCandidates(@Param('taskId') taskId: string) {
    return this.tasks.listMentionCandidates(taskId)
  }

  @Post()
  create(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateCommentDto,
  ) {
    return this.tasks.createComment(taskId, user.id, body.body, body.parentCommentId, body.mentions, body.attachmentIds)
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
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { emoji: string },
  ) {
    return this.tasks.toggleReaction(taskId, commentId, user.id, body.emoji)
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

  /**
   * §V2-S06 frame `05:55` — save a comment for later. Mirrors chat's
   * `POST /chat/messages/:messageId/save` down to the shape of the response, so
   * the two saves in the product are the same thing twice and not two things.
   */
  @Post(':commentId/save')
  save(
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasks.setCommentSaved(taskId, commentId, user.id, true)
  }

  @Delete(':commentId/save')
  unsave(
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasks.setCommentSaved(taskId, commentId, user.id, false)
  }
}

/**
 * The workspace-wide read of §V2-S06's saves, for the Inbox's Later tab.
 *
 * A separate controller because it needs a different guard: `ResourceMemberGuard`
 * above resolves `:taskId`, and this route has no task — it is "everything I
 * saved in this workspace". Membership of the workspace is the gate; the
 * service re-checks per-task visibility on top, because being able to open a
 * workspace is not being able to read every private Space in it.
 */
@ApiTags('tasks')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class SavedCommentsController {
  constructor(private tasks: TasksService) {}

  @Get('workspaces/:workspaceId/comments/saved')
  listSaved(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.tasks.listSavedComments(workspaceId, user.id)
  }
}
