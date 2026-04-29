import * as React from 'react'
import { cn } from '../lib/cn'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-md bg-muted/40 animate-shimmer', className)}
      {...props}
    />
  )
}
