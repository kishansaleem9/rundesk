import { Controller, Post, Param, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { TasksService } from './tasks.service'
import { CreateMeetingDto, AttachRecordingDto } from './dto/meeting.dto'
import type { CurrentUserPayload } from './types'

/**
 * Task → meeting creation (Plan §12.9 Zoom / Google Meet).
 *
 * `POST /tasks/:taskId/meeting {provider}` creates a real meeting when the
 * provider is connected (Zoom via its own OAuth connection, Google Meet by
 * reusing the Google Calendar connection) and stores the join URL as a
 * `task_external_links` row with `kind:'meeting'`. When the provider isn't
 * connected the service returns a clean "connect {provider} first" 400.
 *
 * `POST /tasks/:taskId/meeting/:linkId/recording {url}` attaches a recording
 * link to a meeting after the fact. Access is enforced like the other nested
 * task writes (ResourceMemberGuard on :taskId + the service's write check).
 */
@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks/:taskId/meeting')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class TaskMeetingsController {
  constructor(private tasks: TasksService) {}

  @Post()
  create(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateMeetingDto,
  ) {
    return this.tasks.createTaskMeeting(taskId, user.id, body.provider)
  }

  @Post(':linkId/recording')
  attachRecording(
    @Param('taskId') taskId: string,
    @Param('linkId') linkId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: AttachRecordingDto,
  ) {
    return this.tasks.attachMeetingRecording(taskId, linkId, user.id, body.url)
  }
}
