import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
  toast,
} from '@rundesk/ui'
import { api, ApiError } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { SPACE_VIEW_KEYS, SPACE_VIEW_LABEL, type SpaceViewKey } from '../lib/space-views'

/*
 * §5 (ClickUp "required views") — the task views a space's lists can show.
 *
 * THIS LIST USED TO LIVE HERE, AND IT HAD DRIFTED. It held five and was missing
 * `team`, while `ALL_IDS` below is the default for a space whose `viewConfig`
 * is null — i.e. every space created before the wizard existed. So opening such
 * a space's Views dialog and pressing Save PUT an `enabledViews` with no
 * `team`, Team View disappeared, and the dialog offered no way to bring it
 * back. Nobody chose that; a list two files apart from its twin simply fell
 * behind.
 *
 * `SPACE_VIEW_LABEL` is `Record<SpaceViewKey, TranslationKey>`, so a view that
 * exists without a label here is now a compile error rather than a row that
 * silently vanishes on save.
 */
const VIEWS: Array<{ id: SpaceViewKey; labelKey: TranslationKey }> = SPACE_VIEW_KEYS.map((id) => ({
  id,
  labelKey: SPACE_VIEW_LABEL[id],
}))
const ALL_IDS: string[] = [...SPACE_VIEW_KEYS]

export function SpaceViewsDialog({
  open,
  onOpenChange,
  spaceId,
  workspaceId,
  initial,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  spaceId: string
  workspaceId: string
  initial?: { defaultView?: string; enabledViews?: string[] } | null
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [enabled, setEnabled] = useState<string[]>(
    initial?.enabledViews?.length ? initial.enabledViews : ALL_IDS,
  )
  const [def, setDef] = useState<string>(initial?.defaultView || 'list')

  useEffect(() => {
    if (!open) return
    setEnabled(initial?.enabledViews?.length ? initial.enabledViews : ALL_IDS)
    setDef(initial?.defaultView || 'list')
  }, [open, initial])

  // A space must always keep at least one view; the default must be enabled.
  const toggle = (id: string) =>
    setEnabled((cur) =>
      cur.includes(id) ? (cur.length > 1 ? cur.filter((x) => x !== id) : cur) : [...cur, id],
    )
  const effectiveDefault = enabled.includes(def) ? def : enabled[0]

  const save = useMutation({
    mutationFn: () =>
      api(`/spaces/${spaceId}`, {
        method: 'PUT',
        body: { viewConfig: { enabledViews: enabled, defaultView: effectiveDefault } },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spaces', workspaceId] })
      onOpenChange(false)
      toast.success(t('spaceViews.saved'))
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('spaceViews.saveError')),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('spaceViews.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t('spaceViews.enabledLabel')}</p>
            <p className="text-[11px] text-muted-foreground">{t('spaceViews.enabledHint')}</p>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {VIEWS.map((v) => {
                const on = enabled.includes(v.id)
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => toggle(v.id)}
                    aria-pressed={on}
                    className={cn(
                      'rounded-md border px-2.5 py-1.5 text-sm transition-colors',
                      on
                        ? 'border-brand-500 bg-brand-500/10 text-foreground'
                        : 'border-border/70 text-muted-foreground hover:bg-accent/10',
                    )}
                  >
                    {t(v.labelKey)}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t('spaceViews.defaultLabel')}</p>
            <select
              value={effectiveDefault}
              onChange={(e) => setDef(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              {VIEWS.filter((v) => enabled.includes(v.id)).map((v) => (
                <option key={v.id} value={v.id}>
                  {t(v.labelKey)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
