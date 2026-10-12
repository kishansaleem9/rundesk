import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { TasksService } from './tasks.service'
import { CreateCommentDto } from './dto/comment.dto'
import { SendCommentEmailDto } from './dto/comment-email.dto'
import { CommentEmailService } from './comment-email.service'
import type { CurrentUserPayload } from './types'

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks/:taskId/comments')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class TaskCommentsController {
  constructor(
    private tasks: TasksService,
    private emails: CommentEmailService,
  ) {}

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

  /**
   * THE COMMENT BOX'S EMAIL (`resume-defects/s4-composer-email`): whether this
   * person may send one from this task, and why not, in words; who it goes from.
   */
  @Get('email')
  emailSetup(@Param('taskId') taskId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.emails.setup(taskId, user)
  }

  /** Addresses for To, CC and BCC: the task's Email fields, this person's contacts, the workspace's members. */
  @Get('email/suggestions')
  emailSuggestions(@Param('taskId') taskId: string, @CurrentUser() user: CurrentUserPayload, @Query('q') q?: string) {
    return this.emails.suggestions(taskId, user, typeof q === 'string' ? q.slice(0, 200) : '')
  }

  /** Sends it — or keeps it until its send time — and keeps it in the task as an email comment; its answers land under it. */
  @Post('email')
  sendEmail(@Param('taskId') taskId: string, @CurrentUser() user: CurrentUserPayload, @Body() body: SendCommentEmailDto) {
    return this.emails.send(taskId, user, body)
  }

  /** This person's emails waiting to be sent from this task, and any that could not go (`found-9-oct/task-email-sends-from-the-server`). */
  @Get('email/scheduled')
  scheduledEmails(@Param('taskId') taskId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.emails.scheduled(taskId, user)
  }

  @Post('email/scheduled/:scheduledId/send')
  sendScheduledNow(@Param('taskId') taskId: string, @Param('scheduledId') scheduledId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.emails.sendScheduledNow(taskId, user, scheduledId)
  }

  @Patch('email/scheduled/:scheduledId')
  reschedule(
    @Param('taskId') taskId: string,
    @Param('scheduledId') scheduledId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { sendAt?: unknown },
  ) {
    return this.emails.reschedule(taskId, user, scheduledId, body?.sendAt)
  }

  @Delete('email/scheduled/:scheduledId')
  cancelScheduled(@Param('taskId') taskId: string, @Param('scheduledId') scheduledId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.emails.cancelScheduled(taskId, user, scheduledId)
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
