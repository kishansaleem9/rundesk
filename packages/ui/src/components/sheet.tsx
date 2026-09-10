import * as React from 'react'
import { cn } from '../lib/cn'

type SheetContextValue = {
  open: boolean
  setOpen: (next: boolean) => void
}

const SheetContext = React.createContext<SheetContextValue | null>(null)

function useSheetCtx() {
  const ctx = React.useContext(SheetContext)
  if (!ctx) throw new Error('Sheet components must be used inside <Sheet>')
  return ctx
}

export function Sheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  children: React.ReactNode
}) {
  return <SheetContext.Provider value={{ open, setOpen: onOpenChange }}>{children}</SheetContext.Provider>
}

export function SheetTrigger({
  children,
}: {
  children: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>
}) {
  const { setOpen } = useSheetCtx()
  const child = children as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>
  return React.cloneElement(children, {
    onClick: (e: React.MouseEvent) => {
      child.props.onClick?.(e)
      setOpen(true)
    },
  })
}

export function SheetContent({
  className,
  children,
  side = 'right',
  testId,
}: {
  className?: string
  children: React.ReactNode
  side?: 'left' | 'right'
  /**
   * A handle on the panel itself, for a caller that needs to measure it.
   *
   * §V2-S04 needed one: turning the activity rail on widens the sheet, and
   * "it got wider" cannot be asserted against a panel with nothing to select.
   * The wrapper is `position: fixed; inset: 0` and the panel inside it is the
   * element with the width, so the id goes on the inner div.
   */
  testId?: string
}) {
  const { open, setOpen } = useSheetCtx()
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close sheet overlay"
        className="absolute inset-0 bg-black/30"
        onClick={() => setOpen(false)}
      />
      <div
        data-testid={testId}
        className={cn(
          'absolute top-0 h-full w-[95vw] max-w-2xl bg-card border-l border-border shadow-2xl p-5 overflow-auto',
          side === 'right' ? 'right-0' : 'left-0 border-l-0 border-r',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}

export function SheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-2 mb-4', className)} {...props} />
}

export function SheetTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-xl font-semibold', className)} {...props} />
}

export function SheetDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />
}
