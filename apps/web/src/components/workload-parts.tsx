import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Popover, PopoverContent, PopoverTrigger, toast } from '@rundesk/ui'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { useAuthStore } from '../store/auth'
import { useWorkspaceRole } from '../hooks/use-workspace-role'
import { usePermissions } from '../hooks/use-permissions'

/**
 * What the workspace Workload page and a list's Workload view
 * (`commit-log/log-68bc188-1`, `ledger-rows/row-777`) draw alike: the heat a
 * load gives a cell against its capacity, and the capacity beside a name. One
 * copy, so the two cannot come to colour the same day differently.
 */

/** A cell's colour by load ÷ capacity: green, then amber, then red past capacity. */
export function loadColor(ratio: number): string {
  if (ratio === 0) return 'bg-muted/30 text-muted-foreground/50'
  if (ratio < 0.4) return 'bg-mint/30 text-mint'
  if (ratio < 0.7) return 'bg-mint/60 text-white'
  if (ratio <= 1) return 'bg-warning/70 text-warning-foreground'
  if (ratio <= 1.3) return 'bg-destructive/70 text-destructive-foreground'
  return 'bg-destructive text-destructive-foreground shadow-[0_0_12px_hsl(var(--destructive)/0.5)]'
}

/**
 * WHOSE CAPACITY THIS READER SETS: their own, unless they are a guest, and
 * anybody's where they hold `members.profile.manage` (the route's rule;
 * `found-28-sep/own-capacity-not-self-service`). The server keeps the rank rule.
 */
export function useSetsCapacityOf(workspaceId: string) {
  const me = useAuthStore((s) => s.user)
  const myRole = useWorkspaceRole(workspaceId).role
  const mayManageProfiles = usePermissions(workspaceId).can('members.profile.manage') === true
  return (userId?: string) => Boolean(userId) && ((userId === me?.id && myRole !== 'guest') || mayManageProfiles)
}

/**
 * A person's capacity on their row: the figure, or — on the reader's own row,
 * and on others' where they may set it — a button that sets the weekly hours.
 * ClickUp sets capacity from the capacity beside the name in Workload view.
 */
export function CapacityBadge({
  workspaceId,
  person,
  editable,
  onSaved,
}: {
  workspaceId: string
  person: { userId?: string; name: string; capacity: number; weeklyCapacityHours: number }
  editable: boolean
  /** Called once a new figure is saved — a list's Workload view refetches its own read. */
  onSaved?: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [hours, setHours] = useState(String(person.weeklyCapacityHours))
  const save = useMutation({
    mutationFn: (weeklyCapacityHours: number) =>
      api(`/workspaces/${workspaceId}/members/${person.userId}/capacity`, {
        method: 'PATCH',
        body: { weeklyCapacityHours },
      }),
    onSuccess: () => {
      toast.success(t('workload.capacitySaved'))
      setOpen(false)
      qc.invalidateQueries({ queryKey: ['workload-report', workspaceId] })
      onSaved?.()
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('workload.capacityNotSaved')),
  })
  const badge = (
    <Badge variant="soft" className="text-[10px] tabular-nums">
      {person.capacity}h
    </Badge>
  )
  if (!editable || !person.userId) return badge
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setHours(String(person.weeklyCapacityHours))
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={`workload-capacity-${person.userId}`}
          aria-label={t('workload.setCapacityOf', { name: person.name })}
          title={t('workload.setCapacityOf', { name: person.name })}
          className="rounded-full hover:ring-1 hover:ring-accent/50"
        >
          {badge}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-3" align="end">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const n = Number(hours)
            if (hours.trim() !== '' && Number.isFinite(n)) save.mutate(n)
          }}
        >
          <label className="text-xs font-medium" htmlFor={`capacity-${person.userId}`}>
            {t('workload.weeklyCapacity')}
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              id={`capacity-${person.userId}`}
              data-testid="workload-capacity-input"
              type="number"
              min={0}
              max={168}
              step={1}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="h-8 w-20 rounded-md border border-border bg-background px-2 text-sm tabular-nums"
            />
            <span className="text-xs text-muted-foreground">{t('workload.hoursPerWeek')}</span>
          </div>
          <Button type="submit" size="sm" className="mt-2 w-full" disabled={save.isPending}>
            {t('common.save')}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
