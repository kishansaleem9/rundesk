import type { TranslationKey, Vars } from './i18n'

type Translate = (key: TranslationKey, vars?: Vars) => string

/**
 * One sentence per task-activity action, for every place that reads the log.
 *
 * The task sheet's Activity panel was the only reader, so the map lived in it.
 * The list's Activity view (`commit-log/log-68bc188-1`, `ledger-rows/row-777`)
 * reads the same entries; a second copy here would be a second chance for one
 * of them to call an action something the other does not.
 *
 * Known task-activity actions: see apps/api tasks.service.ts logActivity calls.
 */
export const ACTIVITY_ACTION_LABEL_KEYS: Record<string, TranslationKey> = {
  created: 'taskDetail.activity.created',
  updated: 'taskDetail.activity.updated',
  archived: 'taskDetail.activity.archived',
  // §V2-08 frame `15:32` — Delete is its own action, so the feed has to be able
  // to say so. `deleted` has been in the activity enum since the beginning and
  // nothing ever wrote it, because nothing ever deleted a task.
  deleted: 'taskDetail.activity.deleted',
  restored: 'taskDetail.activity.restored',
  moved: 'taskDetail.activity.moved',
  assigned: 'taskDetail.activity.assigned',
  unassigned: 'taskDetail.activity.unassigned',
  commented: 'taskDetail.activity.commented',
  subtask_added: 'taskDetail.activity.subtaskAdded',
  attachment_added: 'taskDetail.activity.attachmentAdded',
  attachment_removed: 'taskDetail.activity.attachmentRemoved',
  status_changed: 'taskDetail.activity.statusChanged',
  priority_changed: 'taskDetail.activity.priorityChanged',
  due_date_changed: 'taskDetail.activity.dueDateChanged',
  label_added: 'taskDetail.activity.labelAdded',
  label_removed: 'taskDetail.activity.labelRemoved',
  checklist_item_toggled: 'taskDetail.activity.checklistItemToggled',
  checklist_item_added: 'taskDetail.activity.checklistItemAdded',
  dependency_added: 'taskDetail.activity.dependencyAdded',
  dependency_removed: 'taskDetail.activity.dependencyRemoved',
  // §V2-08 — merging leaves an entry on both tasks.
  merged_in: 'taskDetail.activity.mergedIn',
  merged_away: 'taskDetail.activity.mergedAway',
  // `commit-log/log-713a611-1` — Tasks in Multiple Lists.
  list_added: 'taskDetail.activity.listAdded',
  list_removed: 'taskDetail.activity.listRemoved',
}

/** The action's name where no sentence is known: `due_date_changed` → "Due Date Changed". */
function humanized(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** What a filter offering this action calls it. */
export function activityActionName(t: Translate, action: string): string {
  const key = ACTIVITY_ACTION_LABEL_KEYS[action]
  return key ? t(key) : humanized(action)
}

/**
 * The sentence for one entry.
 *
 * Frame `02:47` — "You added item task required to checklist Checklist". The
 * checklist entries carry the item and the list in their meta, and a task
 * with three checklists cannot use "toggled a checklist item" for any of
 * them. When the meta is there the named phrasing wins; older rows written
 * before the meta existed still fall back to the plain label.
 */
export function activitySentence(
  t: Translate,
  entry: { action: string; meta?: Record<string, unknown> | null },
): string {
  const meta = entry.meta as { content?: unknown; checklist?: unknown; isDone?: unknown } | null | undefined
  const item = typeof meta?.content === 'string' ? meta.content : null
  const checklist = typeof meta?.checklist === 'string' ? meta.checklist : null
  if (item && checklist) {
    if (entry.action === 'checklist_item_added') {
      return t('taskDetail.activity.checklistItemAddedDetail', { item, checklist })
    }
    if (entry.action === 'checklist_item_toggled') {
      return t(
        meta?.isDone
          ? 'taskDetail.activity.checklistItemCheckedDetail'
          : 'taskDetail.activity.checklistItemUncheckedDetail',
        { item, checklist },
      )
    }
  }
  return activityActionName(t, entry.action)
}
