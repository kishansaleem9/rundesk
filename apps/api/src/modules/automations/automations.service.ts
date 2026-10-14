import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException, Optional } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { Cron, CronExpression } from '@nestjs/schedule'
import { and, eq, desc, lte, sql } from 'drizzle-orm'
import {
  automations,
  automationRuns,
  tasks,
  taskAssignees,
  taskWatchers,
  workspaceMembers,
  notifications,
  lists,
  projects,
  spaces,
  chatChannels,
  chatMessages,
  users,
  customFieldDefinitions,
  labels,
  taskComments,
  taskLabelAssignments,
  taskLists,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { readableTaskIds } from '../../common/permissions/read-access'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { agentTriggers } from '../../common/agents/agent-triggers'
import { evaluateConditions, normaliseConditions, type Condition, type ConditionMatch, type TaskFacts } from './automation-conditions'
import { AiFieldsService } from '../ai/ai-fields.service'

/** A rule's trigger as stored: its type, its filters, and its conditions with how they match. */
type StoredTrigger = { type: string; filters?: Record<string, string | string[] | undefined>; conditions?: Condition[]; match?: ConditionMatch }
type ConditionVerdictLog = ReturnType<typeof evaluateConditions>['verdicts']

type TriggerContext = {
  taskId?: string
  userId?: string          // who triggered the event
  changedField?: string
  oldValue?: string
  newValue?: string
  workspaceId: string
  projectId?: string
  listId?: string
  /** `button.clicked`: the Button pressed (`ledger-rows/row-719`). */
  fieldId?: string
}

/*
 * CLICKUP'S BUTTON (`ledger-rows/row-719`): pressing a Button field on a task
 * runs the automations whose trigger is that button. The trigger names its
 * button, always — a rule for "any button" would run for every button in the
 * workspace, which no Button's maker asked for.
 */
export const BUTTON_TRIGGER = 'button.clicked'
export const BUTTON_TRIGGER_NEEDS_A_BUTTON = 'A “button is pressed” trigger names the Button field it waits for'

/**
 * Replace `{{task.title}}`-style placeholders in an automation message with
 * values from the trigger context. Dotted keys are supported; unknown
 * placeholders are left intact (matches the web i18n interpolator). Pure so the
 * post_to_channel rendering can be unit-tested without a database.
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) =>
    key in vars ? vars[key] : `{{${key}}}`,
  )
}

@Injectable()
export class AutomationsService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    // RealtimeModule is @Global, so the gateway injects without importing chat.
    private realtime: RealtimeGateway,
    // The AI fields' service, asked for when a rule fills one: the AI module answers through Tasks,
    // which imports this one, so it is found at run time rather than imported.
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  // ─── Time-based triggers ───────────────────────────────────────────────────
  // Fires the "Task becomes overdue" / "Task due date passes" automation
  // triggers once a day. These have no event source elsewhere (they're not
  // user actions), so the engine drives them itself.
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async runOverdueTriggers(): Promise<void> {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const rows = await this.db
      .select({
        taskId: tasks.id,
        workspaceId: spaces.workspaceId,
        projectId: projects.id,
        listId: lists.id,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(
        and(
          eq(tasks.isArchived, false),
          lte(tasks.dueDate, today),
          sql`${tasks.statusCategory} <> 'closed'`,
        ),
      )
    for (const r of rows) {
      const ctx = { workspaceId: r.workspaceId, taskId: r.taskId, projectId: r.projectId, listId: r.listId }
      await this.fire('task.overdue', ctx).catch(() => {})
      await this.fire('task.due_passed', ctx).catch(() => {})
    }
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async list(workspaceId: string) {
    return this.db
      .select()
      .from(automations)
      .where(eq(automations.workspaceId, workspaceId))
      .orderBy(desc(automations.createdAt))
  }

  private async assertOwnership(workspaceId: string, automationId: string) {
    const [row] = await this.db
      .select()
      .from(automations)
      .where(and(eq(automations.id, automationId), eq(automations.workspaceId, workspaceId)))
      .limit(1)
    if (!row) throw new NotFoundException('Automation not found')
    return row
  }

  async getOne(workspaceId: string, id: string) {
    return this.assertOwnership(workspaceId, id)
  }

  /**
   * Reject/normalise a trigger + actions payload. Persisting a non-object
   * trigger or a non-array `actions` (both reachable via the untyped controller
   * body) stores data the reader can't render — it crashed the automations page
   * via `actions.map is not a function`. Validate at the write boundary so the
   * column invariant (trigger is an object, actions is an array of typed steps)
   * always holds.
   */
  private normaliseTrigger(trigger: unknown): StoredTrigger {
    if (!trigger || typeof trigger !== 'object' || Array.isArray(trigger)) {
      throw new BadRequestException('Automation trigger must be an object with a "type"')
    }
    const t = trigger as { type?: unknown; filters?: unknown; conditions?: unknown; match?: unknown }
    if (typeof t.type !== 'string' || !t.type.trim()) {
      throw new BadRequestException('Automation trigger requires a string "type"')
    }
    // Its conditions (`found-14-oct/automation-conditions-and-actions-unbuilt`): read as stored, or refused in words.
    const c = normaliseConditions(t.conditions)
    if ('error' in c) throw new BadRequestException(c.error)
    if (t.match !== undefined && t.match !== 'all' && t.match !== 'any') throw new BadRequestException('An automation’s conditions match all of them or any one')
    return {
      type: t.type,
      filters: (t.filters as Record<string, string | string[] | undefined>) ?? undefined,
      ...(c.conditions.length ? { conditions: c.conditions, match: (t.match as ConditionMatch | undefined) ?? 'all' } : {}),
    }
  }

  private normaliseActions(actions: unknown): Array<{ type: string; params: Record<string, string | string[] | undefined> }> {
    if (!Array.isArray(actions)) {
      throw new BadRequestException('Automation "actions" must be an array')
    }
    return actions.map((a, i) => {
      if (!a || typeof a !== 'object' || Array.isArray(a) || typeof (a as { type?: unknown }).type !== 'string') {
        throw new BadRequestException(`Automation action #${i + 1} must be an object with a string "type"`)
      }
      const act = a as { type: string; params?: unknown }
      return { type: act.type, params: (act.params as Record<string, string | string[] | undefined>) ?? {} }
    })
  }

  /** A `button.clicked` trigger names a Button field of this workspace. */
  private async assertButtonTrigger(workspaceId: string, trigger: { type: string; filters?: Record<string, string | string[] | undefined> }) {
    if (trigger.type !== BUTTON_TRIGGER) return
    const fieldId = trigger.filters?.fieldId
    if (typeof fieldId !== 'string' || !fieldId) throw new BadRequestException(BUTTON_TRIGGER_NEEDS_A_BUTTON)
    const [row] = await this.db
      .select({ id: customFieldDefinitions.id })
      .from(customFieldDefinitions)
      .innerJoin(projects, eq(projects.id, customFieldDefinitions.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(customFieldDefinitions.id, fieldId), eq(customFieldDefinitions.type, 'button'), eq(spaces.workspaceId, workspaceId)))
      .limit(1)
    if (!row) throw new BadRequestException(BUTTON_TRIGGER_NEEDS_A_BUTTON)
  }

  async create(
    workspaceId: string,
    userId: string,
    dto: {
      name: string
      trigger: { type: string; filters?: Record<string, string | string[] | undefined> }
      actions: Array<{ type: string; params: Record<string, string | string[] | undefined> }>
    },
  ) {
    const trigger = this.normaliseTrigger(dto.trigger)
    await this.assertButtonTrigger(workspaceId, trigger)
    const actions = this.normaliseActions(dto.actions)
    const [row] = await this.db
      .insert(automations)
      .values({ workspaceId, createdById: userId, name: dto.name, trigger, actions })
      .returning()
    return row
  }

  async update(
    workspaceId: string,
    id: string,
    patch: {
      name?: string
      isEnabled?: boolean
      trigger?: { type: string; filters?: Record<string, string | string[] | undefined> }
      actions?: Array<{ type: string; params: Record<string, string | string[] | undefined> }>
    },
  ) {
    await this.assertOwnership(workspaceId, id)
    // Only touch trigger/actions when the caller sends them, but validate the
    // shape when present so an update can't reintroduce a non-array actions.
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.name !== undefined) set.name = patch.name
    if (patch.isEnabled !== undefined) set.isEnabled = patch.isEnabled
    if (patch.trigger !== undefined) {
      set.trigger = this.normaliseTrigger(patch.trigger)
      await this.assertButtonTrigger(workspaceId, set.trigger as { type: string; filters?: Record<string, string | string[] | undefined> })
    }
    if (patch.actions !== undefined) set.actions = this.normaliseActions(patch.actions)
    const [row] = await this.db
      .update(automations)
      .set(set)
      .where(eq(automations.id, id))
      .returning()
    if (!row) throw new NotFoundException('Automation not found')
    return row
  }

  async remove(workspaceId: string, id: string) {
    await this.assertOwnership(workspaceId, id)
    await this.db.delete(automations).where(eq(automations.id, id))
    return { ok: true }
  }

  async listRuns(workspaceId: string, automationId: string) {
    await this.assertOwnership(workspaceId, automationId)
    return this.db
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.automationId, automationId))
      .orderBy(desc(automationRuns.triggeredAt))
      .limit(100)
  }

  // ─── Trigger evaluation ───────────────────────────────────────────────────
  //
  // Called by other services when domain events occur.
  // Example call: automationsService.fire('task.status_changed', ctx)

  /** How many rules ran: a Button's press says so (`ledger-rows/row-719`). */
  async fire(triggerType: string, ctx: TriggerContext): Promise<number> {
    // Load all enabled automations for this workspace matching trigger type
    const rules = await this.db
      .select()
      .from(automations)
      .where(
        and(
          eq(automations.workspaceId, ctx.workspaceId),
          eq(automations.isEnabled, true),
        ),
      )

    const matching = rules.filter((r) => {
      const t = r.trigger as { type: string; filters?: Record<string, string | undefined> }
      if (t.type !== triggerType) return false
      // Apply filter constraints
      if (t.filters?.projectId && ctx.projectId && t.filters.projectId !== ctx.projectId) return false
      if (t.filters?.listId && ctx.listId && t.filters.listId !== ctx.listId) return false
      if (t.filters?.changedField && ctx.changedField && t.filters.changedField !== ctx.changedField) return false
      if (t.filters?.fromStatus && ctx.oldValue && t.filters.fromStatus !== ctx.oldValue) return false
      if (t.filters?.toStatus && ctx.newValue && t.filters.toStatus !== ctx.newValue) return false
      // A Button's rule runs for its own button and no other.
      if (t.type === BUTTON_TRIGGER && t.filters?.fieldId !== ctx.fieldId) return false
      return true
    })

    // A rule's conditions read the task as it is now; read once for every rule that has some.
    let facts: TaskFacts | null | undefined
    let ran = 0
    for (const rule of matching) {
      const t = rule.trigger as StoredTrigger
      if (t.conditions?.length) {
        facts ??= ctx.taskId ? await this.taskFacts(ctx.taskId) : null
        const verdict = facts ? evaluateConditions(t.conditions, t.match ?? 'all', facts) : { passed: false, verdicts: [] }
        if (!verdict.passed) {
          await this.logRun(rule.id, ctx, 'skipped', facts ? 'Its conditions did not hold' : 'Its conditions read a task, and this event has none', verdict.verdicts)
          continue
        }
        await this.executeRule(rule, ctx, verdict.verdicts)
      } else {
        await this.executeRule(rule, ctx)
      }
      ran++
    }
    return ran
  }

  /** What a rule's conditions read of a task: its status, priority, assignees, Lists, tags, due date and title. */
  async taskFacts(taskId: string): Promise<TaskFacts | null> {
    const [t] = await this.db
      .select({ status: tasks.status, priority: tasks.priority, listId: tasks.listId, dueDate: tasks.dueDate, title: tasks.title })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1)
    if (!t) return null
    const assignees = (await this.db.select({ userId: taskAssignees.userId }).from(taskAssignees).where(eq(taskAssignees.taskId, taskId))).map((r) => r.userId)
    const tags = (
      await this.db
        .select({ name: labels.name })
        .from(taskLabelAssignments)
        .innerJoin(labels, eq(labels.id, taskLabelAssignments.labelId))
        .where(eq(taskLabelAssignments.taskId, taskId))
    ).map((r) => r.name)
    // The List it lives in, and the others it is in (`log-713a611-1`).
    const others = (await this.db.select({ listId: taskLists.listId }).from(taskLists).where(eq(taskLists.taskId, taskId))).map((r) => r.listId)
    return {
      status: t.status ?? null,
      priority: t.priority ?? null,
      assignees,
      lists: [...new Set([t.listId, ...others].filter((x): x is string => !!x))],
      tags,
      dueDate: t.dueDate ?? null,
      title: t.title ?? '',
    }
  }

  /**
   * WHAT A RULE WOULD DO TO A TASK, DONE TO NOTHING (`found-14-oct/automation-conditions-and-actions-unbuilt`):
   * ClickUp's test of an automation. Each condition's verdict on the task as it is now, whether the rule
   * would act, and the actions it would take — none of them taken, and no run logged. For somebody who
   * may manage automations, on a task they may open.
   */
  async test(workspaceId: string, automationId: string, taskId: unknown, reader: { id: string }) {
    const rule = await this.assertOwnership(workspaceId, automationId)
    if (typeof taskId !== 'string' || !taskId) throw new BadRequestException('Choose a task to test the automation on')
    if (!(await this.mayOpenTask(workspaceId, reader.id, taskId))) throw new NotFoundException('Task not found')
    const facts = await this.taskFacts(taskId)
    if (!facts) throw new NotFoundException('Task not found')
    const t = rule.trigger as StoredTrigger
    const verdict = evaluateConditions(t.conditions ?? [], t.match ?? 'all', facts)
    const actions = (rule.actions as Array<{ type: string; params: Record<string, string | string[] | undefined> }>).map((a) => ({ type: a.type, params: a.params }))
    return { trigger: t.type, match: t.match ?? 'all', wouldAct: verdict.passed, conditions: verdict.verdicts, actions: verdict.passed ? actions : [] }
  }

  private async executeRule(rule: typeof automations.$inferSelect, ctx: TriggerContext, verdicts?: ConditionVerdictLog) {
    let outcome: 'success' | 'error' = 'success'
    let errorMsg: string | undefined

    try {
      const actions = rule.actions as Array<{ type: string; params: Record<string, string | undefined> }>
      for (const action of actions) {
        await this.runAction(action, ctx, rule.createdById)
      }
      // Increment run count and update lastRunAt
      await this.db
        .update(automations)
        .set({ runCount: rule.runCount + 1, lastRunAt: new Date(), updatedAt: new Date() })
        .where(eq(automations.id, rule.id))
    } catch (err: any) {
      outcome = 'error'
      errorMsg = err?.message ?? String(err)
    }

    await this.logRun(rule.id, ctx, outcome, errorMsg, verdicts)
  }

  /** A run, as it went: done, failed, or skipped because its conditions did not hold — with each condition's verdict. */
  private async logRun(automationId: string, ctx: TriggerContext, outcome: 'success' | 'error' | 'skipped', errorMsg?: string, verdicts?: ConditionVerdictLog) {
    await this.db.insert(automationRuns).values({
      automationId,
      context: {
        taskId: ctx.taskId ?? '',
        userId: ctx.userId ?? '',
        workspaceId: ctx.workspaceId,
        ...(verdicts?.length ? { conditions: JSON.stringify(verdicts) } : {}),
      },
      outcome,
      errorMsg,
    })
  }

  private async runAction(
    action: { type: string; params: Record<string, string | string[] | undefined> },
    ctx: TriggerContext,
    authorHint?: string | null,
  ) {
    switch (action.type) {
      case 'change_status': {
        if (!ctx.taskId) break
        const { status } = action.params
        if (status && typeof status === 'string') {
          await this.db
            .update(tasks)
            .set({ status: status as any, updatedAt: new Date() })
            .where(eq(tasks.id, ctx.taskId))
        }
        break
      }

      case 'set_priority': {
        if (!ctx.taskId) break
        const { priority } = action.params
        if (priority && typeof priority === 'string') {
          await this.db
            .update(tasks)
            .set({ priority: priority as any, updatedAt: new Date() })
            .where(eq(tasks.id, ctx.taskId))
        }
        break
      }

      case 'send_notification': {
        if (!ctx.taskId) break
        const taskRow = await this.db.select().from(tasks).where(eq(tasks.id, ctx.taskId)).limit(1)
        const task = taskRow[0]
        if (!task) break
        const message = (action.params.message as string | undefined) ?? `Automation triggered on task`

        /*
         * The workspace's members but the one who made the change — and only
         * those who may open the task (`found-7-oct/automation-notifications-reach-every-member`).
         * Every member was written to: a guest with nothing shared, and a member
         * outside a private list, heard of a task the API refuses them, by its
         * id and the rule's message. Whether the team hears or only the task's
         * people (its assignees and creator, as this said before) is the
         * owner's to settle; the rule's suggestions say "the team".
         */
        const members = await this.db
          .select({ userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(eq(workspaceMembers.workspaceId, ctx.workspaceId))

        for (const member of members) {
          if (member.userId === ctx.userId) continue // don't notify the actor
          if (!(await this.mayOpenTask(ctx.workspaceId, member.userId, ctx.taskId))) continue
          await this.db.insert(notifications).values({
            userId: member.userId,
            workspaceId: ctx.workspaceId,
            type: 'task_status_changed',
            title: 'Automation triggered',
            body: message,
            target: ctx.taskId ? { entityType: 'task', entityId: ctx.taskId } : undefined,
          })
        }
        break
      }

      case 'create_subtask': {
        if (!ctx.taskId) break
        const title = (action.params.title as string | undefined) ?? 'Follow-up task'
        const parentTask = await this.db.select().from(tasks).where(eq(tasks.id, ctx.taskId)).limit(1)
        if (!parentTask[0]) break
        await this.db.insert(tasks).values({
          listId: parentTask[0].listId,
          parentTaskId: ctx.taskId,
          title,
          priority: 'normal',
          status: 'todo',
        })
        break
      }

      case 'assign_member': {
        if (!ctx.taskId) break
        const userId = action.params.userId
        if (userId && typeof userId === 'string') {
          await this.db.insert(taskAssignees).values({ taskId: ctx.taskId, userId }).onConflictDoNothing()
          await this.db.insert(taskWatchers).values({ taskId: ctx.taskId, userId }).onConflictDoNothing()
        }
        break
      }

      // Plan §7.7 "post message to channel". Posts a chat message to the given
      // channel; the message body supports `{{task.title}}`-style interpolation
      // from the trigger context.
      case 'post_to_channel': {
        const channelId = typeof action.params.channelId === 'string' ? action.params.channelId : undefined
        const template = typeof action.params.message === 'string' ? action.params.message : ''
        if (!channelId) break
        await this.postToChannel(channelId, template, ctx, authorHint)
        break
      }

      /*
       * RUN A SUPER AGENT (`ledger-rows/row-852`): ClickUp's Automation action
       * that hands the task to an agent with instructions of the action's own.
       * Said on the agents' seam — the agents module answers through Tasks, which
       * imports this one — and run under the rights of whoever set the rule off.
       */
      case 'run_super_agent': {
        const agentId = typeof action.params.agentId === 'string' ? action.params.agentId : ''
        if (!agentId || !ctx.taskId) break
        agentTriggers.automation({
          workspaceId: ctx.workspaceId,
          agentId,
          taskId: ctx.taskId,
          instructions: typeof action.params.instructions === 'string' ? action.params.instructions.slice(0, 2000) : '',
          actorId: ctx.userId ?? authorHint ?? null,
        })
        break
      }

      /*
       * ADD A COMMENT, ADD A WATCHER, SET THE DUE DATE, FILL AN AI FIELD
       * (`found-14-oct/automation-conditions-and-actions-unbuilt`), as ClickUp's automations act.
       * The comment is the rule maker's — there is no system author — with `{{task.title}}`
       * and the like filled in; a watcher is a member who may open the task; the due date is
       * days from the moment the rule runs; an AI field is filled as its Generate button fills
       * it, as the rule's maker.
       */
      case 'add_comment': {
        if (!ctx.taskId) break
        const template = typeof action.params.text === 'string' ? action.params.text : ''
        const body = renderTemplate(template, await this.buildMessageVars(ctx)).trim()
        if (!body) break
        const authorId = await this.resolveChannelAuthor(ctx.workspaceId, authorHint)
        if (!authorId) throw new Error('No eligible author for the automation’s comment')
        await this.db.insert(taskComments).values({ taskId: ctx.taskId, authorId, body: body.slice(0, 10_000) })
        break
      }

      case 'add_follower': {
        if (!ctx.taskId) break
        const userId = typeof action.params.userId === 'string' ? action.params.userId : ''
        if (!userId) break
        if (!(await this.mayOpenTask(ctx.workspaceId, userId, ctx.taskId))) throw new Error('That person cannot open this task, so they cannot watch it')
        await this.db.insert(taskWatchers).values({ taskId: ctx.taskId, userId }).onConflictDoNothing()
        break
      }

      case 'set_due_date': {
        if (!ctx.taskId) break
        const days = Number(action.params.days)
        if (!Number.isInteger(days) || days < 0 || days > 3650) throw new Error('A due date is set a whole number of days ahead, from 0 to 3650')
        const due = new Date()
        due.setUTCHours(0, 0, 0, 0)
        due.setUTCDate(due.getUTCDate() + days)
        await this.db.update(tasks).set({ dueDate: due, dueDateHasTime: false, updatedAt: new Date() }).where(eq(tasks.id, ctx.taskId))
        break
      }

      case 'update_ai_field': {
        if (!ctx.taskId) break
        const fieldId = typeof action.params.fieldId === 'string' ? action.params.fieldId : ''
        const actorId = authorHint ?? ctx.userId
        if (!fieldId || !actorId) break
        const fields = this.moduleRef?.get(AiFieldsService, { strict: false })
        if (!fields) throw new Error('AI fields are not available here')
        await fields.generate(ctx.workspaceId, ctx.taskId, fieldId, { id: actorId })
        break
      }

      default:
        break
    }
  }

  /** Whether this member may open this task (`readableTaskIds`); a seam the action's tests answer. */
  private async mayOpenTask(workspaceId: string, userId: string, taskId: string): Promise<boolean> {
    return (await readableTaskIds(this.db, workspaceId, userId, [taskId])).has(taskId)
  }

  // ─── post_to_channel helpers ───────────────────────────────────────────────

  /**
   * Post an automation message into a chat channel via the lowest-level insert
   * path (avoids a Chat↔Automations DI cycle — TasksModule already imports
   * AutomationsModule, so importing ChatModule here would cycle). The message is
   * authored by the automation's creator (`createdById`); when that user is
   * missing or no longer a member we fall back to a workspace admin/member —
   * there is no dedicated system user, so the creator is the cleanest identity.
   */
  private async postToChannel(
    channelId: string,
    template: string,
    ctx: TriggerContext,
    authorHint?: string | null,
  ): Promise<void> {
    // The channel must exist and belong to the automation's workspace — a rule
    // must never post into another workspace's channel.
    const [channel] = await this.db
      .select({ id: chatChannels.id, workspaceId: chatChannels.workspaceId })
      .from(chatChannels)
      .where(eq(chatChannels.id, channelId))
      .limit(1)
    if (!channel) throw new NotFoundException('Channel not found')
    if (channel.workspaceId !== ctx.workspaceId) {
      throw new ForbiddenException('Channel is not in this workspace')
    }

    const body = renderTemplate(template, await this.buildMessageVars(ctx)).trim()
    if (!body) return // nothing to post (empty template / no vars)

    const authorId = await this.resolveChannelAuthor(ctx.workspaceId, authorHint)
    if (!authorId) throw new Error('No eligible author to post automation message')

    const [row] = await this.db
      .insert(chatMessages)
      .values({ channelId, authorId, body })
      .returning()

    // Broadcast so connected clients render it live, mirroring the shape
    // ChatService.postMessage emits (author name/avatar, empty attachments).
    const [author] = await this.db
      .select({ displayName: users.displayName, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, authorId))
      .limit(1)
    this.realtime.emitToWorkspace(channel.workspaceId, {
      type: 'chat.message.created',
      workspaceId: channel.workspaceId,
      channelId,
      message: {
        ...row,
        authorName: author?.displayName,
        authorAvatarUrl: author?.avatarUrl,
        attachments: [],
        reactions: [],
      },
    })
  }

  /** Interpolation variables derived from the trigger context (the task). */
  private async buildMessageVars(ctx: TriggerContext): Promise<Record<string, string>> {
    const vars: Record<string, string> = {}
    if (ctx.taskId) {
      const [task] = await this.db
        .select({ title: tasks.title, status: tasks.status, priority: tasks.priority })
        .from(tasks)
        .where(eq(tasks.id, ctx.taskId))
        .limit(1)
      if (task) {
        vars['task.title'] = task.title ?? ''
        vars['task.status'] = task.status ?? ''
        vars['task.priority'] = task.priority ?? ''
      }
    }
    if (ctx.oldValue) vars['trigger.oldValue'] = ctx.oldValue
    if (ctx.newValue) vars['trigger.newValue'] = ctx.newValue
    return vars
  }

  /** A valid author for the posted message: the creator if still a member, else an admin/member. */
  private async resolveChannelAuthor(workspaceId: string, hint?: string | null): Promise<string | null> {
    if (hint) {
      const [member] = await this.db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, hint)))
        .limit(1)
      if (member) return member.userId
    }
    const [fallback] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId))
      .orderBy(sql`case when ${workspaceMembers.role} = 'workspace_admin' then 0 else 1 end`)
      .limit(1)
    return fallback?.userId ?? null
  }
}
