import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Ip,
  UseGuards,
  BadRequestException,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { TasksService } from './tasks.service'
import { CreateTaskDto, AddAttachmentDto } from './dto/task.dto'
import type { CurrentUserPayload } from './types'

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private tasks: TasksService) {}

  @Get('workspace/:workspaceId/timeline')
  @UseGuards(WorkspaceMemberGuard)
  async getTimeline(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('projectId') projectId?: string,
  ) {
    return this.tasks.getTimelineForWorkspace(workspaceId, {
      ...(projectId ? { projectId } : {}),
      actor: { id: user.id, role: user.role },
    })
  }

  @Get('workspace/:workspaceId')
  @UseGuards(WorkspaceMemberGuard)
  async getWorkspaceTasks(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('limit') limit?: string,
  ) {
    // Pass the caller so the listing is scoped to containers they can access
    // (the guard only checks workspace membership, not private space/project
    // membership).
    return this.tasks.getTasksForWorkspace(workspaceId, limit ? Number(limit) : 500, {
      actorId: user.id,
      actorRole: user.role,
    })
  }

  @Get('workspace/:workspaceId/members/:userId')
  @UseGuards(WorkspaceMemberGuard)
  async getMemberTasks(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
  ) {
    return this.tasks.getTasksForMember(workspaceId, userId)
  }

  @Get('list/:listId')
  @UseGuards(ResourceMemberGuard)
  async getByList(
    @Param('listId') listId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('includeSubtasks') includeSubtasks?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.tasks.getTasksByList(
      listId,
      {
        includeSubtasks: includeSubtasks === 'true',
        includeArchived: includeArchived === 'true',
      },
      { id: user.id, role: user.role },
    )
  }

  @Get(':taskId')
  @UseGuards(ResourceMemberGuard)
  async getOne(@Param('taskId') taskId: string) {
    return this.tasks.getTask(taskId)
  }

  @Get(':taskId/subtasks')
  @UseGuards(ResourceMemberGuard)
  async getSubtasks(@Param('taskId') taskId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.tasks.listSubtasks(taskId, { id: user.id, role: user.role })
  }

  @Get(':taskId/navigation')
  @UseGuards(ResourceMemberGuard)
  async getTaskNavigation(@Param('taskId') taskId: string) {
    return this.tasks.getTaskNavigation(taskId)
  }

  @Post()
  @UseGuards(ResourceMemberGuard)
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateTaskDto,
  ) {
    return this.tasks.createTask({
      listId: body.listId,
      title: body.title,
      description: body.description,
      priority: body.priority,
      status: body.status,
      position: body.position,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      timeEstimate: body.timeEstimate,
      parentTaskId: body.parentTaskId,
      assigneeIds: body.assigneeIds,
      labelIds: body.labelIds,
      // §1.1 — this handler builds the argument field by field, so a field
      // added to the DTO and honoured by the service still goes nowhere unless
      // it is named here. taskTypeId was accepted by the DTO, validated and
      // used by createTask, and dropped in between: choosing a type on create
      // has never once applied.
      taskTypeId: body.taskTypeId,
      createdById: user.id,
    })
  }

  @Patch(':taskId')
  async update(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: Partial<{
      title: string
      description: string | null
      priority: 'urgent' | 'high' | 'normal' | 'low'
      status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled'
      startDate: string | null
      dueDate: string | null
      position: number
      timeEstimate: number | null
      coverColor: string | null
      isArchived: boolean
      isMilestone: boolean
      visibility: 'public' | 'private'
      parentTaskId: string | null
    }>,
  ) {
    const toDate = (label: string, value: string | null | undefined) => {
      if (!value) return null
      const d = new Date(value)
      if (Number.isNaN(d.getTime())) throw new BadRequestException(`${label} is not a valid date`)
      return d
    }
    // Type-check the non-string fields before they reach the DB. The body is an
    // untyped inline shape (no DTO), so e.g. `position: true` would otherwise hit
    // the integer column and 500 with a Postgres type error instead of a 400.
    if (body.position !== undefined && (typeof body.position !== 'number' || !Number.isInteger(body.position))) {
      throw new BadRequestException('position must be an integer')
    }
    if (body.timeEstimate !== undefined && body.timeEstimate !== null && typeof body.timeEstimate !== 'number') {
      throw new BadRequestException('timeEstimate must be a number or null')
    }
    for (const flag of ['isArchived', 'isMilestone'] as const) {
      if (body[flag] !== undefined && typeof body[flag] !== 'boolean') {
        throw new BadRequestException(`${flag} must be a boolean`)
      }
    }
    if (body.visibility !== undefined && body.visibility !== 'public' && body.visibility !== 'private') {
      throw new BadRequestException('visibility must be public or private')
    }
    const patch: Record<string, unknown> = { ...body }
    if ('startDate' in body) patch.startDate = toDate('startDate', body.startDate)
    if ('dueDate'   in body) patch.dueDate   = toDate('dueDate', body.dueDate)
    return this.tasks.updateTask(taskId, user.id, patch)
  }

  @Patch('bulk/update')
  async bulkUpdate(
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      taskIds: string[]
      patch: Partial<{
        priority: 'urgent' | 'high' | 'normal' | 'low'
        status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled'
        startDate: string | null
        dueDate: string | null
        timeEstimate: number | null
        isArchived: boolean
        // Cross-list move target (Plan §5.1 bulk "Move to list").
        listId: string
        assigneeIdsAdd: string[]
        assigneeIdsRemove: string[]
        labelIdsAdd: string[]
        labelIdsRemove: string[]
        dependenciesAdd: Array<{
          relatedTaskId: string
          type: 'blocks' | 'blocked_by' | 'related_to'
        }>
        dependenciesRemove: Array<{
          relatedTaskId: string
          type: 'blocks' | 'blocked_by' | 'related_to'
        }>
      }>
    },
  ) {
    if (!Array.isArray(body?.taskIds) || body.taskIds.length === 0) {
      throw new BadRequestException('taskIds must be a non-empty array')
    }
    if (!body.patch || typeof body.patch !== 'object') {
      throw new BadRequestException('patch object is required')
    }
    const patch: Record<string, unknown> = { ...body.patch }
    if ('startDate' in body.patch) patch.startDate = body.patch.startDate ? new Date(body.patch.startDate) : null
    if ('dueDate' in body.patch) patch.dueDate = body.patch.dueDate ? new Date(body.patch.dueDate) : null
    return this.tasks.bulkUpdateTasks(body.taskIds, user.id, patch)
  }

  @Post(':taskId/recurring/next')
  async createNextRecurring(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      cadenceDays?: number
      recurrenceRule?: {
        mode: 'daily' | 'weekly' | 'monthly'
        interval?: number
        weekdays?: number[]
        dayOfMonth?: number
        skipWeekends?: boolean
      }
      preserveAssignees?: boolean
    },
  ) {
    return this.tasks.createNextRecurringOccurrence(
      taskId,
      user.id,
      body.cadenceDays ?? null,
      body.recurrenceRule ?? null,
      body.preserveAssignees ?? true,
    )
  }

  // Persist (or clear) a task's recurrence so completing it auto-creates the
  // next occurrence. Body: { cadenceDays } | { rule } | null (to clear).
  @Put(':taskId/recurrence')
  async setRecurrence(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      cadenceDays?: number | null
      rule?: {
        mode: 'daily' | 'weekly' | 'monthly'
        interval?: number
        weekdays?: number[]
        dayOfMonth?: number
        skipWeekends?: boolean
      } | null
    } | null,
  ) {
    const config =
      body && (body.cadenceDays != null || body.rule != null)
        ? { cadenceDays: body.cadenceDays ?? null, rule: body.rule ?? null }
        : null
    return this.tasks.setRecurrence(taskId, user.id, config)
  }

  @Post(':taskId/move')
  async move(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { listId: string; position: number },
  ) {
    return this.tasks.moveTask(taskId, user.id, body.listId, body.position)
  }

  @Delete(':taskId')
  async delete(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.tasks.deleteTask(taskId, user.id, ip)
  }

  @Post(':taskId/restore')
  async restore(@Param('taskId') taskId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.tasks.restoreTask(taskId, user.id)
  }

  // --- Assignees ----------------------------------------------------------
  @Post(':taskId/assignees')
  async addAssignee(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { userId: string },
  ) {
    return this.tasks.addAssignee(taskId, body.userId, user.id)
  }

  @Delete(':taskId/assignees/:userId')
  async removeAssignee(
    @Param('taskId') taskId: string,
    @Param('userId') userId: string,
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    return this.tasks.removeAssignee(taskId, userId, actor.id)
  }

  // --- Labels -------------------------------------------------------------
  @Post(':taskId/labels/:labelId')
  async addLabel(
    @Param('taskId') taskId: string,
    @Param('labelId') labelId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasks.addLabel(taskId, labelId, user.id)
  }

  @Delete(':taskId/labels/:labelId')
  async removeLabel(
    @Param('taskId') taskId: string,
    @Param('labelId') labelId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasks.removeLabel(taskId, labelId, user.id)
  }

  // --- Linked docs --------------------------------------------------------
  @Get(':taskId/linked-docs')
  async listLinkedDocs(@Param('taskId') taskId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.tasks.listLinkedDocs(taskId, user.id)
  }

  @Post(':taskId/linked-docs')
  async linkDoc(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { docId: string },
  ) {
    return this.tasks.linkDoc(taskId, body.docId, user.id)
  }

  @Delete(':taskId/linked-docs/:docId')
  async unlinkDoc(
    @Param('taskId') taskId: string,
    @Param('docId') docId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasks.unlinkDoc(taskId, docId, user.id)
  }

  // --- Watchers -----------------------------------------------------------
  @Post(':taskId/watchers')
  async addWatcher(
    @Param('taskId') taskId: string,
    @Body() body: { userId: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    // §2.2 — the actor has to reach the service or the follower-changed
    // notification cannot leave them out, and they would be told about their
    // own click.
    return this.tasks.addWatcher(taskId, body.userId, user.id)
  }

  @Delete(':taskId/watchers/:userId')
  async removeWatcher(
    @Param('taskId') taskId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasks.removeWatcher(taskId, userId, user.id)
  }

  // --- Attachments ---------------------------------------------------------
  // Listing returns working signed R2 download URLs, so it needs the same
  // membership + private-container gate as viewing the task (ResourceMemberGuard,
  // mirroring the GET read routes). The service re-asserts read access as
  // defense-in-depth.
  @Get(':taskId/attachments')
  @UseGuards(ResourceMemberGuard)
  async listAttachments(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasks.listAttachments(taskId, user.id)
  }

  @Post(':taskId/attachments')
  async addAttachment(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: AddAttachmentDto,
  ) {
    return this.tasks.addAttachment(taskId, user.id, body)
  }

  @Post(':taskId/attachments/presign')
  async presignAttachmentUpload(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { fileName: string; contentType?: string; sizeBytes?: number },
  ) {
    return this.tasks.createAttachmentUploadUrl(taskId, user.id, {
      fileName: body.fileName,
      contentType: body.contentType ?? 'application/octet-stream',
      sizeBytes: body.sizeBytes,
    })
  }

  @Delete(':taskId/attachments/:attachmentId')
  async removeAttachment(
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasks.removeAttachment(taskId, attachmentId, user.id)
  }
}
