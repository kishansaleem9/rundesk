import { HttpException, HttpStatus, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { AiService } from './ai.service'
import { CustomFieldsService } from '../custom-fields/custom-fields.service'
import { aiFieldValue, type AiBaseType, type AiFieldConfig } from '../custom-fields/ai-field'
import { onTaskChange, type TaskChange } from '../../common/events/task-changes'
import type { ReadActor } from '../../common/permissions/read-access'

/**
 * CLICKUP'S AI FIELDS, FILLED (`commit-log/log-c980bee-1`, `ledger-rows/row-719`,
 * `harness/ai-rows-blocked-on-empty-key`).
 *
 * A field's value is written by the model three ways, as ClickUp's are: when
 * somebody asks on a task (`generate`); when a task is made where a field set
 * to "Autofill new tasks" is; and when a task changes whose field is set to
 * "Auto-update", at most once per wait — ClickUp's are refreshed every twenty
 * minutes, so a burst of edits costs one answer, not one per keystroke.
 *
 * The two that fill themselves run as the change's author, for the metering,
 * and with no model answering they ask nothing: there is nobody waiting for a
 * refusal, and a refusal recorded on every edit would be noise. What is held
 * in memory is only the wait; a restart forgets a refresh not yet due, and
 * the next change asks again.
 */
@Injectable()
export class AiFieldsService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly ai: AiService,
    private readonly customFields: CustomFieldsService,
  ) {}

  private stop: (() => void) | null = null
  private readonly waits = new Map<string, NodeJS.Timeout>()

  onModuleInit() {
    this.stop = onTaskChange((change) => this.onChange(change))
  }

  onModuleDestroy() {
    this.stop?.()
    for (const t of this.waits.values()) clearTimeout(t)
    this.waits.clear()
  }

  /** Seconds before a new task's autofill, and between an edit and its refresh. */
  private static seconds(name: string, fallback: number): number {
    const n = Number(process.env[name])
    return Number.isFinite(n) && n >= 0 ? n : fallback
  }

  /**
   * GENERATE, asked on one task: the task's read rule, the field on it, an AI
   * field, and the write rule (`CustomFieldsService.aiFieldOnTask`); then a
   * model, or the refusal that none is configured, recorded as every AI
   * feature's is; then the answer, stored if the field takes it.
   */
  async generate(workspaceId: string, taskId: string, fieldId: string, reader: ReadActor) {
    const { def, ai } = await this.customFields.aiFieldOnTask(workspaceId, taskId, fieldId, reader)
    const ctx = { userId: reader.id, workspaceId }
    await this.ai.assertAvailable(`custom_field.${ai.kind}`, ctx)
    const value = await this.fill(workspaceId, taskId, def, ai, ctx)
    return { fieldId: def.id, value }
  }

  /** The model asked for one field of one task, and its answer written — or refused, in words. */
  private async fill(
    workspaceId: string,
    taskId: string,
    def: { id: string; type: string; options: unknown; config?: unknown },
    ai: AiFieldConfig,
    ctx: { userId?: string; workspaceId: string },
  ): Promise<string> {
    const options = Array.isArray(def.options) ? (def.options as Array<{ label: string; value: string }>) : null
    const task = await this.ai.buildTaskSummaryInput(taskId)
    const answer = await this.ai.fillAiField(
      ai.kind,
      { task, prompt: ai.prompt, language: ai.language, options: options?.map((o) => o.label) },
      ctx,
    )
    const out = aiFieldValue(def.type as AiBaseType, ai.kind, answer, options)
    if ('refused' in out) throw new HttpException(out.refused, HttpStatus.BAD_GATEWAY)
    await this.customFields.writeGenerated(workspaceId, taskId, def, out.value)
    return out.value
  }

  /** A task made or changed: its fields that fill or update themselves, after their wait. */
  private onChange(change: TaskChange) {
    if (!this.ai.isAvailable()) return
    if (change.type === 'task.created') {
      this.after(`fill:${change.taskId}`, AiFieldsService.seconds('AI_FIELD_AUTOFILL_SECONDS', 2), () =>
        this.fillAll(change, 'autofill'),
      )
      return
    }
    if (change.type === 'task.updated' || change.type === 'task.status_changed' || change.type === 'task.comment_added') {
      this.after(`update:${change.taskId}`, AiFieldsService.seconds('AI_FIELD_REFRESH_SECONDS', 20 * 60), () =>
        this.fillAll(change, 'autoUpdate'),
      )
    }
  }

  /** One wait per task and kind: a change during the wait does not start another. */
  private after(key: string, seconds: number, run: () => Promise<void>) {
    if (this.waits.has(key)) return
    this.waits.set(
      key,
      setTimeout(() => {
        this.waits.delete(key)
        void run().catch(() => undefined)
      }, seconds * 1000),
    )
  }

  private async fillAll(change: TaskChange, which: 'autofill' | 'autoUpdate') {
    const fields = await this.customFields.aiFieldsOfTask(change.workspaceId, change.taskId, which)
    for (const { def, ai } of fields) {
      // One field's refusal (an answer no option matches, a provider's error) is that field's.
      await this.fill(change.workspaceId, change.taskId, def, ai, { userId: change.userId, workspaceId: change.workspaceId }).catch(
        () => undefined,
      )
    }
  }
}
