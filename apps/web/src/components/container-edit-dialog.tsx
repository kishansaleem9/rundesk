import { useEffect, useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
  cn,
} from '@rundesk/ui'
import { useTranslation } from '../lib/i18n'

export type ContainerEditValues = {
  name: string
  description?: string
  color?: string
  icon?: string
}

// Which optional fields a given container type exposes in the edit dialog.
// Every container has a name; spaces additionally carry a color + icon, and
// projects carry a description (Plan §2 / §13.4).
export type ContainerEditFields = {
  description?: boolean
  color?: boolean
  icon?: boolean
}

// A compact preset palette for space colors. Values are stored verbatim (hex)
// and rendered as the container swatch elsewhere in the tree.
const CONTAINER_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#64748b',
]

/**
 * Shared rename / edit dialog for the container CRUD affordances (spaces,
 * folders, projects, lists). The parent owns the open state and the mutation;
 * this component only collects the edited values and hands them back.
 */
export function ContainerEditDialog({
  open,
  onOpenChange,
  title,
  initial,
  fields = {},
  submitting = false,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initial: ContainerEditValues
  fields?: ContainerEditFields
  submitting?: boolean
  onSubmit: (values: ContainerEditValues) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description ?? '')
  const [color, setColor] = useState(initial.color ?? '')
  const [icon, setIcon] = useState(initial.icon ?? '')

  // Re-seed the form whenever the dialog (re)opens for a different entity.
  useEffect(() => {
    if (!open) return
    setName(initial.name)
    setDescription(initial.description ?? '')
    setColor(initial.color ?? '')
    setIcon(initial.icon ?? '')
  }, [open, initial.name, initial.description, initial.color, initial.icon])

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed || submitting) return
    // Send each exposed field exactly as edited (including an empty string, which
    // clears it) so the dialog is predictable; unexposed fields are omitted so the
    // partial update leaves them untouched. Name is always required.
    const values: ContainerEditValues = { name: trimmed }
    if (fields.description) values.description = description.trim()
    if (fields.color) values.color = color
    if (fields.icon) values.icon = icon.trim()
    onSubmit(values)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="container-edit-name">{t('container.nameLabel')}</Label>
            <Input
              id="container-edit-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('container.namePlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submit()
                }
              }}
            />
          </div>

          {fields.description && (
            <div className="space-y-1.5">
              <Label htmlFor="container-edit-description">{t('container.descriptionLabel')}</Label>
              <Textarea
                id="container-edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('container.descriptionPlaceholder')}
                rows={3}
              />
            </div>
          )}

          {fields.icon && (
            <div className="space-y-1.5">
              <Label htmlFor="container-edit-icon">{t('space.iconLabel')}</Label>
              <Input
                id="container-edit-icon"
                value={icon}
                maxLength={8}
                onChange={(e) => setIcon(e.target.value)}
                placeholder={t('space.iconPlaceholder')}
                className="w-24"
              />
              <p className="text-[11px] text-muted-foreground">{t('space.iconHint')}</p>
            </div>
          )}

          {fields.color && (
            <div className="space-y-1.5">
              <Label>{t('space.colorLabel')}</Label>
              <div className="flex flex-wrap items-center gap-2">
                {CONTAINER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={c}
                    aria-pressed={color === c}
                    className={cn(
                      'h-7 w-7 rounded-full border-2 transition-transform',
                      color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105',
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
                {color && (
                  <button
                    type="button"
                    onClick={() => setColor('')}
                    className="h-7 rounded-full border border-border px-2 text-[11px] text-muted-foreground hover:bg-accent/10"
                  >
                    {t('space.colorClear')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={!name.trim() || submitting}>
            {submitting ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
