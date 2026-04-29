import * as React from 'react'
import { cn } from '../lib/cn'

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({
  className,
  icon,
  title,
  description,
  action,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 py-12 text-center',
        className,
      )}
      {...props}
    >
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient-soft text-white shadow-glow">
          {icon}
        </div>
      )}
      <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
