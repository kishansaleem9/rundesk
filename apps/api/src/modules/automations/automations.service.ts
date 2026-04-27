import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { and, eq, desc } from 'drizzle-orm'
import {
  automations,
  automationRuns,
  tasks,
  workspaceMembers,
  notifications,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

type TriggerContext = {
  taskId?: string
  userId?: string          // who triggered the event
  changedField?: string
  oldValue?: string
  newValue?: string
  workspaceId: string
  projectId?: string
  listId?: string
}

@Injectable()
export class AutomationsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

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

  async create(
    workspaceId: string,
    userId: string,
    dto: {
      name: string
      trigger: { type: string; filters?: Record<string, string | string[] | undefined> }
      actions: Array<{ type: string; params: Record<string, string | string[] | undefined> }>
    },
  ) {
    const [row] = await this.db
      .insert(automations)
      .values({ workspaceId, createdById: userId, ...dto })
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
    const [row] = await this.db
      .update(automations)
      .set({ ...patch, updatedAt: new Date() })
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

  async fire(triggerType: string, ctx: TriggerContext): Promise<void> {
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
      if (t.filters?.fromStatus && ctx.oldValue && t.filters.fromStatus !== ctx.oldValue) return false
      if (t.filters?.toStatus && ctx.newValue && t.filters.toStatus !== ctx.newValue) return false
      return true
    })

    for (const rule of matching) {
      await this.executeRule(rule, ctx)
    }
  }

  private async executeRule(rule: typeof automations.$inferSelect, ctx: TriggerContext) {
    let outcome: 'success' | 'error' = 'success'
    let errorMsg: string | undefined

    try {
      const actions = rule.actions as Array<{ type: string; params: Record<string, string | undefined> }>
      for (const action of actions) {
        await this.runAction(action, ctx)
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

    // Log the run
    await this.db.insert(automationRuns).values({
      automationId: rule.id,
      context: {
        taskId: ctx.taskId ?? '',
        userId: ctx.userId ?? '',
        workspaceId: ctx.workspaceId,
      },
      outcome,
      errorMsg,
    })
  }

  private async runAction(
    action: { type: string; params: Record<string, string | string[] | undefined> },
    ctx: TriggerContext,
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
        // Notify all assignees and creator of the task
        const taskRow = await this.db.select().from(tasks).where(eq(tasks.id, ctx.taskId)).limit(1)
        const task = taskRow[0]
        if (!task) break
        const message = (action.params.message as string | undefined) ?? `Automation triggered on task`

        // Get workspace members to notify
        const members = await this.db
          .select()
          .from(workspaceMembers)
          .where(eq(workspaceMembers.workspaceId, ctx.workspaceId))

        for (const member of members) {
          if (member.userId === ctx.userId) continue // don't notify the actor
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
        // Handled externally (would need taskAssignees table import)
        break
      }

      default:
        break
    }
  }
}
