import { useState } from 'react'
import { Button, cn } from '@rundesk/ui'
import { RefreshCw } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { useTranslation } from '../lib/i18n'

/**
 * §G01-8 — how old is what I am looking at, and when will it change.
 *
 * The Dashboard had this and nothing else did. Every other polled surface —
 * a list, a space, a project — refreshed on a schedule nobody could see, set
 * to a value nobody could change, with no way to tell a screen that is current
 * from one that has been sitting there since you made coffee. On a board two
 * people are moving cards around, "is this stale?" is the first question and
 * there was nowhere to look for the answer.
 *
 * Lifted out of the dashboard rather than copied into the next place, because
 * two implementations of "last updated" drift in exactly the way that makes
 * one of them wrong and neither of them obviously so.
 */

/** Off, one minute, five, fifteen. The dashboard's set, now shared. */
export const REFRESH_INTERVALS = [0, 60_000, 300_000, 900_000] as const
export type RefreshInterval = (typeof REFRESH_INTERVALS)[number]

/**
 * Hold the chosen interval.
 *
 * Returned as `refetchInterval` in the shape TanStack Query wants (`false`
 * rather than `0`), so a caller cannot get that translation wrong — passing 0
 * means "refetch as fast as possible", which is the opposite of "off" and the
 * kind of mistake that only shows up as a load-shaped graph.
 */
export function useRefreshInterval(initial: RefreshInterval = 0) {
  const [refreshMs, setRefreshMs] = useState<number>(initial)
  return {
    refreshMs,
    setRefreshMs,
    refetchInterval: refreshMs === 0 ? (false as const) : refreshMs,
  }
}

export function FreshnessControls({
  refreshMs,
  onRefreshMsChange,
  /** When the data on screen last arrived. 0 while nothing has loaded yet. */
  dataUpdatedAt,
  onRefreshNow,
  busy,
  className,
}: {
  refreshMs: number
  onRefreshMsChange: (ms: number) => void
  dataUpdatedAt: number
  onRefreshNow: () => void
  busy?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <div className={cn('flex items-center gap-2', className)} data-testid="freshness-controls">
      {/*
        Said before the controls, because it is the question people actually
        have. A picker with no age beside it tells you what WILL happen and
        never what is true now.
      */}
      {dataUpdatedAt > 0 && (
        <span className="text-xs text-muted-foreground" data-testid="freshness-updated">
          {t('dashboard.lastUpdated', {
            when: formatDistanceToNowStrict(new Date(dataUpdatedAt), { addSuffix: true }),
          })}
        </span>
      )}
      <select
        className="h-8 rounded-md border border-border/70 bg-card px-2 text-xs"
        value={refreshMs}
        onChange={(e) => onRefreshMsChange(Number(e.target.value))}
        title={t('dashboard.refreshHint')}
        data-testid="freshness-interval"
      >
        {REFRESH_INTERVALS.map((ms) => (
          <option key={ms} value={ms}>
            {ms === 0 ? t('dashboard.refreshOff') : t('dashboard.refreshEvery', { minutes: ms / 60_000 })}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="outline"
        onClick={onRefreshNow}
        title={t('dashboard.refreshNow')}
        data-testid="freshness-refresh-now"
      >
        <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
      </Button>
    </div>
  )
}
