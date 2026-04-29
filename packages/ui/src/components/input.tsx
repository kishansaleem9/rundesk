import * as React from 'react'
import { cn } from '../lib/cn'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: React.ReactNode
  trailingIcon?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, leadingIcon, trailingIcon, ...props }, ref) => {
    if (leadingIcon || trailingIcon) {
      return (
        <div className="relative flex w-full items-center">
          {leadingIcon && (
            <span className="pointer-events-none absolute left-3 flex h-4 w-4 items-center justify-center text-muted-foreground">
              {leadingIcon}
            </span>
          )}
          <input
            type={type}
            ref={ref}
            className={cn(
              'flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm transition-colors',
              'placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              'disabled:cursor-not-allowed disabled:opacity-50',
              leadingIcon && 'pl-9',
              trailingIcon && 'pr-9',
              className,
            )}
            {...props}
          />
          {trailingIcon && (
            <span className="absolute right-3 flex h-4 w-4 items-center justify-center text-muted-foreground">
              {trailingIcon}
            </span>
          )}
        </div>
      )
    }
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'
