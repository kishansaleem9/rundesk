import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../lib/cn'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogPortal = DialogPrimitive.Portal
export const DialogClose = DialogPrimitive.Close

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-brand-950/80 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

/** How long a double-click takes at most: the interval the operating systems default to. */
export const DOUBLE_CLICK_MS = 500

/*
 * A DOUBLE-CLICK IS ONE GESTURE (`found-30-sep/a-double-click-on-a-dialog-row-shuts-the-dialog`).
 *
 * A menu row that opens a dialog takes a double-click's first press and opens
 * it; the second press, 156–218 ms later at a person's pace, lands on the
 * dialog's overlay, which Radix counts as a press outside, and the dialog shut
 * as it opened: 9 rounds of 9 on the task menu's "Merge". ClickUp documents
 * nothing on it, and a double-click is one gesture everywhere. So a dialog
 * refuses a press outside that comes within a double-click's interval of its
 * content being drawn. The caller's `onPointerDownOutside` runs first, and a
 * press after the interval dismisses the dialog as before.
 */
export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    hideClose?: boolean
  }
>(({ className, hideClose, children, onPointerDownOutside, ...props }, ref) => {
  /*
   * When the content was drawn: the wrapper renders while the dialog is shut
   * too, so not its first render. Nor each time the ref is set: a layer inside
   * Radix composes it with an arrow made afresh at every render, so React sets
   * it again — null, then the same element — whenever the dialog renders, and
   * a dialog whose list loaded after it opened took no press outside for half a
   * second more (`found-8-oct/a-dialog-takes-each-render-for-its-opening`).
   * Only an element it did not hold before is the dialog drawn.
   */
  const openedAt = React.useRef(0)
  const drawn = React.useRef<Element | null>(null)
  const setRefs = React.useCallback(
    (el: React.ElementRef<typeof DialogPrimitive.Content> | null) => {
      if (el && el !== drawn.current) openedAt.current = performance.now()
      if (el) drawn.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) ref.current = el
    },
    [ref],
  )
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={setRefs}
        onPointerDownOutside={(event) => {
          onPointerDownOutside?.(event)
          if (performance.now() - openedAt.current < DOUBLE_CLICK_MS) event.preventDefault()
        }}
        className={cn(
          'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-border/60 bg-card p-6 shadow-glow duration-200',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
          'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
          'sm:rounded-2xl',
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-left', className)} {...props} />
)
DialogHeader.displayName = 'DialogHeader'

export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
)
DialogFooter.displayName = 'DialogFooter'

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('font-display text-xl font-semibold leading-tight tracking-tight', className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName
