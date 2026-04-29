import * as React from 'react'
import { cn } from '../lib/cn'

/**
 * Aura lotus mark — 8-petal stylized lotus.
 *
 * Default version uses currentColor stroke; the `gradient` variant fills the
 * mark with the brand violet→pink gradient via an inline `<defs>` block so it
 * works without external CSS context.
 */
export const LogoMark = React.forwardRef<
  SVGSVGElement,
  React.SVGAttributes<SVGSVGElement> & { gradient?: boolean }
>(({ className, gradient = false, ...props }, ref) => {
  const id = React.useId()
  const stroke = gradient ? `url(#${id}-stroke)` : 'currentColor'

  return (
    <svg
      ref={ref}
      viewBox="0 0 64 64"
      fill="none"
      stroke={stroke}
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-8 w-8', className)}
      {...props}
    >
      {gradient && (
        <defs>
          <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="hsl(217 60% 67%)" />
            <stop offset="55%" stopColor="hsl(268 88% 70%)" />
            <stop offset="100%" stopColor="hsl(330 88% 70%)" />
          </linearGradient>
        </defs>
      )}
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
  )
})
LogoMark.displayName = 'LogoMark'

export function LogoWordmark({
  className,
  label = 'rundesk',
  gradient = false,
}: {
  className?: string
  label?: string
  gradient?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <LogoMark className="h-8 w-8" gradient={gradient} />
      <span
        className={cn(
          'font-display text-2xl font-semibold tracking-tight lowercase',
          gradient ? 'text-brand-gradient' : 'text-foreground',
        )}
      >
        {label}
      </span>
    </div>
  )
}
