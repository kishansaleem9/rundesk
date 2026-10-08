import { useEffect, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@rundesk/ui'
import { useTranslation, type TranslationKey } from '../lib/i18n'

/** What a duplicate may take, as the API names them (`DUPLICATE_ITEMS`). */
export const DUPLICATE_ITEMS = ['description', 'assignees', 'watchers', 'tags', 'dates', 'checklists', 'subtasks', 'customFields', 'attachments'] as const
export type DuplicateItem = (typeof DUPLICATE_ITEMS)[number]

const LABEL_KEYS: Record<DuplicateItem, TranslationKey> = {
  description: 'duplicateTask.item.description',
  assignees: 'duplicateTask.item.assignees',
  watchers: 'duplicateTask.item.watchers',
  tags: 'duplicateTask.item.tags',
  dates: 'duplicateTask.item.dates',
  checklists: 'duplicateTask.item.checklists',
  subtasks: 'duplicateTask.item.subtasks',
  customFields: 'duplicateTask.item.customFields',
  attachments: 'duplicateTask.item.attachments',
}

const ALL = Object.fromEntries(DUPLICATE_ITEMS.map((item) => [item, true])) as Record<DuplicateItem, boolean>

/**
 * DUPLICATE ASKS WHAT THE COPY TAKES, as ClickUp's does: "choose what you want
 * to include in the new task", "with pre-selected boxes of what to keep" (help
 * centre "Duplicate a task", and its feedback board, through search excerpts;
 * `found-30-sep/duplicate-copies-no-attachments`). It was one button that
 * copied a fixed set, and no files. Every box starts ticked; Keep checked
 * items, which ClickUp pairs with Checklists, starts off.
 */
export function DuplicateTaskDialog({
  open,
  pending,
  onOpenChange,
  onDuplicate,
}: {
  open: boolean
  pending: boolean
  onOpenChange: (open: boolean) => void
  onDuplicate: (include: Record<DuplicateItem, boolean>, keepCheckedItems: boolean) => void
}) {
  const { t } = useTranslation()
  const [take, setTake] = useState(ALL)
  const [keepChecked, setKeepChecked] = useState(false)
  useEffect(() => {
    if (open) {
      setTake(ALL)
      setKeepChecked(false)
    }
  }, [open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="duplicate-dialog">
        <DialogHeader>
          <DialogTitle>{t('duplicateTask.title')}</DialogTitle>
          <DialogDescription>{t('duplicateTask.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-1.5">
          {DUPLICATE_ITEMS.map((item) => (
            <label key={item} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={take[item]}
                onChange={(e) => setTake((now) => ({ ...now, [item]: e.target.checked }))}
                data-testid={`duplicate-item-${item}`}
              />
              {t(LABEL_KEYS[item])}
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={keepChecked}
            disabled={!take.checklists}
            onChange={(e) => setKeepChecked(e.target.checked)}
            data-testid="duplicate-keep-checked"
          />
          {t('taskTemplates.keepCheckedItems')}
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => onDuplicate(take, keepChecked && take.checklists)} disabled={pending} data-testid="duplicate-confirm">
            {t('duplicateTask.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
