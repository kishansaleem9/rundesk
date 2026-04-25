import * as React from 'react'
import { cn } from '../lib/cn'

/**
 * Aura lotus mark — 8-petal stylized lotus, single-color, inherits currentColor.
 * Matches the moodboard motif; pairs with the word-mark "aura / rundesk".
 */
export const LogoMark = React.forwardRef<
  SVGSVGElement,
  React.SVGAttributes<SVGSVGElement>
>(({ className, ...props }, ref) => (
  <svg
    ref={ref}
    viewBox="0 0 64 64"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.25}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn('h-8 w-8', className)}
    {...props}
  >
    {/* Center petal */}
    <path d="M32 12c4 8 4 18 0 30-4-12-4-22 0-30z" />
    {/* Inner side petals */}
    <path d="M32 42c-6-4-10-10-12-20 6 2 11 6 14 12" />
    <path d="M32 42c6-4 10-10 12-20-6 2-11 6-14 12" />
    {/* Outer side petals */}
    <path d="M32 46c-10-2-17-8-22-18 8 0 15 3 20 9" />
    <path d="M32 46c10-2 17-8 22-18-8 0-15 3-20 9" />
    {/* Base line */}
    <path d="M14 50h36" />
  </svg>
))
LogoMark.displayName = 'LogoMark'

export function LogoWordmark({
  className,
  label = 'rundesk',
}: {
  className?: string
  label?: string
}) {
  return (
    <div className={cn('flex items-center gap-2 text-brand-900', className)}>
      <LogoMark className="h-8 w-8" />
      <span className="font-display text-2xl font-semibold tracking-tight lowercase">
        {label}
      </span>
    </div>
  )
}
