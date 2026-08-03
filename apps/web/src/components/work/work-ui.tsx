import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Button, Card, cn } from '@rundesk/ui'
import { ArrowRight, Plus } from 'lucide-react'

/** Full-height page shell (sprints, etc.) */
export function WorkPageShell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('h-full flex flex-col bg-background', className)}>{children}</div>
  )
}

export function WorkPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <header className="shrink-0 px-6 py-4 border-b border-border/80 bg-[#fbfbfc] dark:bg-[#16181d]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1">
              {eyebrow}
            </p>
          )}
          <h1 className="text-[22px] font-semibold text-foreground tracking-tight">{title}</h1>
          {description && (
            <p className="text-[13px] text-muted-foreground mt-1 max-w-2xl leading-relaxed">{description}</p>
          )}
        </div>
        {action}
      </div>
    </header>
  )
}

export function WorkHubBody({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex-1 overflow-auto p-6 space-y-6 bg-white dark:bg-[#0f1114]', className)}>
      {children}
    </div>
  )
}

export function WorkSectionTitle({
  children,
  action,
}: {
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="text-[15px] font-semibold text-foreground">{children}</h2>
      {action}
    </div>
  )
}

export function WorkEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Plus
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <Card className="p-12 text-center border-dashed border-border/80 bg-[#fbfbfc]/50 dark:bg-[#16181d]/30">
      <div className="h-14 w-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
        <Icon className="h-7 w-7 text-violet-600 dark:text-violet-300" />
      </div>
      <h3 className="text-[17px] font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-[14px] text-muted-foreground max-w-md mx-auto leading-relaxed">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  )
}

export function WorkProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className={cn('h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden', className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function WorkEntityCard({
  to,
  params,
  icon,
  iconClassName,
  title,
  subtitle,
  meta,
  progress,
}: {
  to: string
  params?: Record<string, string>
  icon: ReactNode
  iconClassName?: string
  title: string
  subtitle?: string | null
  meta?: ReactNode
  progress?: { done: number; total: number }
}) {
  return (
    <Link to={to as any} params={params as any} className="block group">
      <Card className="p-4 h-full border-border/80 hover:border-violet-500/35 hover:shadow-md transition-all bg-background">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'h-10 w-10 rounded-xl shrink-0 flex items-center justify-center',
              iconClassName ?? 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
            )}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-semibold truncate group-hover:text-violet-600 dark:group-hover:text-violet-300 transition-colors">
              {title}
            </h3>
            {subtitle && (
              <p className="text-[12px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">{subtitle}</p>
            )}
            {progress && progress.total > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <WorkProgressBar value={(progress.done / progress.total) * 100} className="flex-1" />
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                  {progress.done}/{progress.total}
                </span>
              </div>
            )}
            {meta && <div className="mt-2 text-[11px] text-muted-foreground">{meta}</div>}
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
        </div>
      </Card>
    </Link>
  )
}

/** Inline hub page (space / project) */
export function WorkHubPage({
  breadcrumb,
  title,
  description,
  headerAction,
  children,
}: {
  breadcrumb: string
  title: string
  description?: string | null
  headerAction?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-h-full bg-white dark:bg-[#0f1114]">
      <div className="border-b border-border/80 bg-[#fbfbfc] dark:bg-[#16181d]">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1">
            {breadcrumb}
          </p>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[26px] font-semibold text-foreground tracking-tight">{title}</h1>
              {description && (
                <p className="text-[14px] text-muted-foreground mt-1 max-w-2xl">{description}</p>
              )}
            </div>
            {headerAction}
          </div>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-6 py-6">{children}</div>
    </div>
  )
}

export function WorkCreateCard({
  children,
  onCancel,
}: {
  children: ReactNode
  onCancel: () => void
}) {
  return (
    <Card className="p-4 border-violet-500/25 bg-violet-500/[0.03] space-y-3">
      {children}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  )
}

export function WorkFilterSelect({
  value,
  onChange,
  children,
  className,
}: {
  value: string
  onChange: (value: string) => void
  children: ReactNode
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-8 rounded-md border border-border/80 bg-background px-2.5 text-[12px] text-foreground',
        'focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/40',
        className,
      )}
    >
      {children}
    </select>
  )
}

export type WorkViewTab = {
  key: string
  label: string
  active: boolean
  onSelect: () => void
  /** Per-tab affordance (a ⋯ menu) that must not trigger the tab itself. */
  action?: ReactNode
}

/**
 * The view tab strip. Tabs carry their own `active` flag rather than being
 * compared against one id, because a list mixes two kinds of tab: the built-in
 * view types and the user's named saved views (A1.2), and exactly one of the
 * whole set is current.
 */
export function WorkViewTabs({ tabs, trailing }: { tabs: WorkViewTab[]; trailing?: ReactNode }) {
  return (
    <div className="flex items-center gap-0.5 border-b border-border/80 overflow-x-auto">
      {tabs.map((tab) => (
        <div key={tab.key} className="relative flex items-center shrink-0">
          <button
            type="button"
            onClick={tab.onSelect}
            className={cn(
              'px-3 py-2 text-[13px] font-medium transition-colors whitespace-nowrap',
              tab.action && 'pr-1',
              tab.active
                ? 'text-violet-700 dark:text-violet-200'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
          {tab.action}
          {tab.active && (
            <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-violet-600 dark:bg-violet-400" />
          )}
        </div>
      ))}
      {trailing}
    </div>
  )
}

export function TaskListChrome({
  listName,
  taskCount,
  quickAdd,
  viewTabs,
  toolbar,
  headerAction,
  secondaryAction,
}: {
  listName: string
  taskCount: number
  quickAdd: ReactNode
  viewTabs: ReactNode
  toolbar: ReactNode
  /** Sits beside the list title — A1.8 puts Share here. */
  headerAction?: ReactNode
  /** A line under the title, for context rather than commands (A1.10 forms). */
  secondaryAction?: ReactNode
}) {
  return (
    <div className="shrink-0 border-b border-border/80 bg-[#fbfbfc] dark:bg-[#16181d]">
      <div className="px-4 sm:px-6 pt-4 pb-0 flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-0.5">
            List
          </p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <h1 className="text-[20px] font-semibold text-foreground truncate">{listName}</h1>
            <span className="text-[12px] text-muted-foreground tabular-nums">
              {taskCount} task{taskCount !== 1 ? 's' : ''}
            </span>
            {headerAction}
          </div>
          {secondaryAction && <div className="mt-1.5">{secondaryAction}</div>}
        </div>
        <div className="flex items-center gap-2 w-full lg:w-auto shrink-0">{quickAdd}</div>
      </div>
      <div className="px-4 sm:px-6 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2 pb-0">
        {viewTabs}
        <div className="flex flex-wrap items-center gap-1.5 pb-2 xl:pb-2">{toolbar}</div>
      </div>
    </div>
  )
}
