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
  BadRequestException, Res } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { TasksService } from './tasks.service'
import { PlansService } from '../plans/plans.service'
import type { PlanFeature } from '../plans/plans.constants'
import { EmailToTaskService } from '../email-to-task/email-to-task.service'
import { CreateTaskDto, AddAttachmentDto } from './dto/task.dto'
import { unknownUpdateFields } from './task-update-fields'
import type { CurrentUserPayload } from './types'

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(
    private tasks: TasksService,
    private emailToTask: EmailToTaskService,
    private plans: PlansService,
  ) {}

  /**
   * §V2-13, frames `09:26` / `10:42` — REFUSE, don't hide.
   *
   * A paywall the browser draws is not a paywall; it is a `display:none` with a
   * price on it. Both gated surfaces below therefore run this first, and the
   * client's modal is the courtesy, not the control.
   *
   * Fails OPEN on a list whose workspace cannot be resolved, matching
   * `PlanFeatureGuard`: gating must never break a read that used to work, and a
   * list with no workspace is a database problem, not an entitlement one.
   */
  private async assertPlanFeature(listId: string, feature: PlanFeature): Promise<void> {
    const workspaceId = await this.tasks.workspaceIdForList(listId)
    if (!workspaceId) return
    await this.plans.assertFeature(workspaceId, feature)
  }

  /**
   * §V2-13, frame `09:26` — the rows Team View draws, and the 403 it gets
   * instead when the workspace's plan does not include it.
   */
  @Get('list/:listId/team')
  @UseGuards(ResourceMemberGuard)
  async getTeamView(
    @Param('listId') listId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('includeArchived') includeArchived?: string,
    @Query('unassignedLabel') unassignedLabel?: string,
  ) {
    await this.assertPlanFeature(listId, 'teamView')
    return this.tasks.getTeamRollup(
      listId,
      { id: user.id, role: user.role },
      {
        includeArchived: includeArchived === 'true',
        // The caller's own word for "nobody", so the row reads in the language
        // the rest of the page is in. Bounded, because it lands in a response.
        unassignedLabel: unassignedLabel ? unassignedLabel.slice(0, 60) : undefined,
      },
    )
  }

  /**
   * §V2-07 frame `11:30` — "Tasks where I have assigned": Comments · Subtasks ·
   * Checklists, the three switches under the list's assignee picker.
   *
   * A SEPARATE ROUTE RATHER THAN THREE MORE PARAMETERS ON `GET /tasks/list/:id`.
   * The list read is what every other surface in the product uses; widening it
   * with an assignee argument would make every one of them a caller of this
   * filter, and the three switches are a narrowing the LIST TOOLBAR applies on
   * top of a payload it already has. This answers only "which rows would these
   * switches add", per source, and the toolbar unions it with what it already
   * drew.
   *
   * `ResourceMemberGuard`, the same guard as the list read, and the service
   * applies the same per-task visibility filter on top: a task id is still a
   * fact about a task.
   */
  @Get('list/:listId/assigned-via')
  @UseGuards(ResourceMemberGuard)
  async getAssignedVia(
    @Param('listId') listId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('userId') userId?: string,
    @Query('comments') comments?: string,
    @Query('subtasks') subtasks?: string,
    @Query('checklists') checklists?: string,
  ) {
    return this.tasks.assignedViaForList(
      listId,
      {
        /*
         * `me` resolves to the caller and any other value is taken literally.
         * Reading a colleague's indirect assignments in a list you can already
         * read gives away nothing their rows on that list do not already say,
         * and the frame's picker offers every member — so the narrow rule the
         * workspace listing uses would make the control lie about who it can
         * filter by.
         */
        userId: userId === 'me' ? user.id : (userId ?? ''),
        // Absent means off. An omitted switch that defaulted to ON would make
        // a bare call return more rows than any state of the three toggles.
        comments: comments === 'true',
        subtasks: subtasks === 'true',
        checklists: checklists === 'true',
      },
      { id: user.id, role: user.role },
    )
  }

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
    @Query('assigneeId') assigneeId?: string,
    @Query('q') q?: string,
  ) {
    // Pass the caller so the listing is scoped to containers they can access
    // (the guard only checks workspace membership, not private space/project
    // membership).
    return this.tasks.getTasksForWorkspace(workspaceId, limit ? Number(limit) : 500, {
      actorId: user.id,
      actorRole: user.role,
      /*
       * `assigneeId=me` rather than a raw id: this narrows to the caller, and
       * accepting an arbitrary id here would turn a workspace listing into a
       * way to read any colleague's workload without a separate permission
       * check. The member-scoped endpoint below is the one for that.
       */
      assigneeId: assigneeId === 'me' ? user.id : undefined,
      q,
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

  /**
   * §V2-07 — "Customize → Export view → Download".
   *
   * `ResourceMemberGuard`, not `WorkspaceAdminGuard`. The existing export is
   * admin-only and dumps the whole workspace, so the person actually looking at
   * a list — usually not an admin — had no way to download it. Exporting the
   * list you can already read gives away nothing you could not read.
   */
  @Get('list/:listId/export')
  @UseGuards(ResourceMemberGuard)
  async exportList(
    @Param('listId') listId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: any,
    @Query('columns') columns?: string,
    @Query('fields') fields?: string,
    @Query('format') format?: string,
    @Query('dateFormat') dateFormat?: string,
    @Query('timeFormat') timeFormat?: string,
    @Query('includeArchived') includeArchived?: string,
    @Query('includeClosed') includeClosed?: string,
    @Query('view') view?: string,
  ) {
    const mode = columns === 'names' || columns === 'all' ? columns : 'visible'
    /*
     * §V2-13 `[10:42]`–`[10:49]` — ONLY the board download is paid.
     *
     * "agar aap ke paas premium nahi [hai] to aap LIST VIEW download karo" is
     * the requirement, so the assertion is deliberately inside this branch: no
     * `view`, or any value that is not `board`, is the export that has always
     * been free and stays free, and the narrowness of this `if` is the thing
     * that stops the gate spreading.
     */
    const boardShaped = view === 'board'
    if (boardShaped) await this.assertPlanFeature(listId, 'boardExport')
    const out = await this.tasks.exportListView(
      listId,
      { id: user.id, role: user.role },
      {
        columns: mode,
        fields: fields ? fields.split(',').filter(Boolean) : undefined,
        format: format === 'xlsx' ? 'xlsx' : 'csv',
        // Unrecognised values fall back inside the service rather than 400ing:
        // a stale bookmark should still download the list.
        dateFormat: dateFormat as never,
        timeFormat: timeFormat as never,
        includeArchived: includeArchived === 'true',
        includeClosed: includeClosed !== 'false',
        view: boardShaped ? 'board' : 'list',
      },
    )
    // Quoted, and stripped of anything that could end the header early: a list
    // named `"; drop` would otherwise break the Content-Disposition it lands in.
    const safeName = out.name.replace(/[^\w \-.]/g, '').trim() || 'list'
    res.header('Content-Type', out.contentType)
    res.header('Content-Disposition', `attachment; filename="${safeName}.${out.extension}"`)
    res.send(out.body)
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
      // §V2-09 — the cover is a colour OR an image, and an image is either one
      // we hold (a storage key, presigned on read) or one on the web (a URL,
      // used as given). Kept apart on purpose; see the schema.
      coverColor: string | null
      coverStorageKey: string | null
      coverImageUrl: string | null
      coverOffsetY: number
      isArchived: boolean
      isMilestone: boolean
      visibility: 'public' | 'private'
      parentTaskId: string | null
    }>,
  ) {
    /*
     * REFUSED BY NAME, not dropped. The type above is erased at runtime and this
     * body used to be spread straight into the row, so every column was
     * writable — `listId`, `createdById`, `completedAt`. The service now keeps
     * only the fields in TASK_UPDATABLE_FIELDS; this says so to the caller, so
     * a client sending `listId` expecting a move hears where moves go instead
     * of getting a 200 and no move. One list for both; see task-update-fields.ts.
     */
    const unknown = unknownUpdateFields(body)
    if (unknown.length > 0) {
      throw new BadRequestException(
        `These fields cannot be changed here: ${unknown.join(', ')}.` +
          (unknown.includes('listId') ? ' To move a task to another list, use POST /tasks/:taskId/move.' : ''),
      )
    }
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

  /**
   * §V2-08 `[15:27]` — "yahan par aap ko HISTORY wagera sab cheezein show hoti
   * hain". What this task's description used to say.
   */
  /**
   * §V2-08, frame `15:32` — Merge.
   *
   * `:taskId` is the task being merged AWAY and `targetTaskId` the survivor:
   * "merge this into that", which is the direction the menu item reads in.
   * Both ids go through `ResourceMemberGuard` — the param one here, the body
   * one inside the service, which also checks write access to it. Merging is a
   * write to the target as much as to the source.
   */
  @Post(':taskId/merge')
  merge(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { targetTaskId: string },
  ) {
    return this.tasks.mergeTask(taskId, body.targetTaskId, user.id)
  }

  /**
   * §V2-08, frame `15:32` — "Send email to task". The address that turns an
   * email into a comment on this task. It has worked since email-to-task was
   * written; nothing has ever told anybody it exists.
   *
   * Behind the task's own access rule. With sign-in alone, anybody in any
   * workspace who knew a task id read the list's secret inbound address — the
   * `local_part` that lets mail create tasks and comments.
   */
  @Get(':taskId/email-address')
  @UseGuards(ResourceMemberGuard)
  emailAddress(@Param('taskId') taskId: string) {
    return this.emailToTask.taskEmailAddress(taskId)
  }

  @Get(':taskId/description-history')
  descriptionHistory(@Param('taskId') taskId: string) {
    return this.tasks.listDescriptionRevisions(taskId)
  }

  @Post(':taskId/description-history/:revisionId/restore')
  restoreDescription(
    @Param('taskId') taskId: string,
    @Param('revisionId') revisionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasks.restoreDescriptionRevision(taskId, revisionId, user.id)
  }

  /**
   * ARCHIVE. Reversible, kept for good, listed under
   * `GET /workspaces/:id/archived-tasks`. The verb is historical — see
   * `deleteTask` — and the menu row that fires this says "Archive".
   */
  @Delete(':taskId')
  async delete(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.tasks.deleteTask(taskId, user.id, ip)
  }

  /**
   * §V2-08 frame `15:32` — **DELETE**, the row under Archive.
   *
   * POST rather than a second DELETE because `DELETE /tasks/:id` is taken by
   * archiving, and overloading it on a query flag is how a destructive action
   * ends up one typo away from the reversible one.
   *
   * Moves the task into the workspace Trash: restorable from there via
   * `POST /workspaces/:id/trash/task/:taskId/restore`, permanently removed by
   * `DELETE /workspaces/:id/trash/task/:taskId`, and purged automatically after
   * the retention window the response reports.
   */
  @Post(':taskId/trash')
  async moveToTrash(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.tasks.binTask(taskId, user.id, ip)
  }

  /** Un-archive. Refuses a task that is in the Trash — that restore is the trash one. */
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
  // THE GUARD THE TASK'S OWN GET CARRIES. Both routes had none, and neither did
  // the service: an account sharing no workspace with the task could follow it
  // by id and was answered with the whole task. The service now decides who
  // may follow and who may be made to (TasksService.assertMayChangeFollowers,
  // assertPersonCanSeeTask); this keeps the route from reaching it otherwise.
  @Post(':taskId/watchers')
  @UseGuards(ResourceMemberGuard)
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
  @UseGuards(ResourceMemberGuard)
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
