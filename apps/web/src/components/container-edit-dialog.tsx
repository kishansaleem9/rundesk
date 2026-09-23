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
// projects and FOLDERS carry a description (Plan §2 / §13.4, and §V2-S09
// frame `08:25` for folders — this flag is the reader that makes the Create
// Folder dialog's description a round trip rather than a stored value nothing
// honours).
export type ContainerEditFields = {
  description?: boolean
  color?: boolean
  icon?: boolean
}

// A compact preset palette for space colors. Values are stored verbatim (hex)
// and rendered as the container swatch elsewhere in the tree.
export const CONTAINER_COLORS = [
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

// A curated set of space/project icons — clickable so users don't have to know
// how to type an emoji (the free-text box below still accepts any single emoji
// or letter). Kept in-app so it works offline with no external picker/CDN.
export const CONTAINER_ICONS = [
  '🚀', '🏠', '💼', '📁', '🗂️', '🎯', '⭐', '🔥',
  '💡', '📊', '📈', '🛠️', '⚙️', '🎨', '🧩', '📌',
  '✅', '🧠', '💬', '📅', '🏆', '🌐', '🧪', '🐛',
  '🔒', '💰', '👥', '🏢', '🎓', '🩺', '✈️', '📣',
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
              data-testid="container-edit-name"
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
                data-testid="container-edit-description"
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
              <div className="flex flex-wrap gap-1">
                {CONTAINER_ICONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setIcon(emoji)}
                    aria-label={emoji}
                    aria-pressed={icon === emoji}
                    className={cn(
                      'h-8 w-8 rounded-md border text-lg leading-none transition-colors',
                      icon === emoji
                        ? 'border-brand-500 bg-brand-500/10'
                        : 'border-border/70 hover:bg-accent/10',
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                <Input
                  id="container-edit-icon"
                  value={icon}
                  maxLength={8}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder={t('space.iconPlaceholder')}
                  className="w-24"
                />
                {icon && (
                  <button
                    type="button"
                    onClick={() => setIcon('')}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {t('space.colorClear')}
                  </button>
                )}
              </div>
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
          <Button data-testid="container-edit-save" onClick={submit} disabled={!name.trim() || submitting}>
            {submitting ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
