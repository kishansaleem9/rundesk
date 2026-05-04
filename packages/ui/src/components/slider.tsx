import * as React from 'react'
import { cn } from '../lib/cn'

export interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onValueChange?: (value: number[]) => void
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, onValueChange, ...props }, ref) => {
    return (
      <div className={cn('relative flex w-full touch-none select-none items-center', className)}>
        <input
          type="range"
          ref={ref}
          className={cn(
            'h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted transition-all focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 slider-thumb',
          )}
          onChange={(e) => {
            const val = parseFloat(e.target.value)
            onValueChange?.([val])
            props.onChange?.(e)
          }}
          {...props}
        />
      </div>
    )
  }
)
Slider.displayName = 'Slider'

export { Slider }
