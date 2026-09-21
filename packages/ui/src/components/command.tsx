import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { Search } from 'lucide-react'
import { cn } from '../lib/cn'
import { Dialog, DialogContent, DialogTitle } from './dialog'

export const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      'flex h-full w-full flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground',
      className,
    )}
    {...props}
  />
))
Command.displayName = CommandPrimitive.displayName

export interface CommandDialogProps extends React.ComponentProps<typeof Dialog> {
  /**
   * Props forwarded to the inner Command root. Callers that run their own
   * filtering (e.g. a `/` command mode, where the leading slash would score
   * every item to zero) need `shouldFilter={false}`.
   */
  commandProps?: Omit<React.ComponentPropsWithoutRef<typeof CommandPrimitive>, 'className'>
  /**
   * Accessible name for the dialog. Rendered for screen readers only — the
   * palette is identified visually by its search input, so a visible heading
   * would be noise. Radix requires a title on every dialog regardless.
   */
  title?: string
  /**
   * Forwarded to Radix's `DialogContent`, and the only way to get at Escape
   * before the dialog acts on it.
   *
   * WHY THIS EXISTS. The palette's ⋯ menu wanted Escape to dismiss the menu
   * and leave the palette — and the query — alone. A `document` keydown
   * listener cannot do it: Radix registers its own on `document` when the
   * dialog MOUNTS, so it is always earlier than one registered when a menu
   * OPENS, and listeners on the same node in the same phase run in
   * registration order. `stopPropagation` from the later one cannot un-run the
   * earlier one; the menu closed and the whole palette went with it.
   *
   * `onEscapeKeyDown` fires before the close, and `preventDefault()` on it
   * cancels the close. That is Radix's own seam for this, and it is the one
   * that works.
   */
  onEscapeKeyDown?: React.ComponentPropsWithoutRef<typeof DialogContent>['onEscapeKeyDown']
}

export function CommandDialog({
  children,
  commandProps,
  title = 'Search',
  onEscapeKeyDown,
  ...props
}: CommandDialogProps) {
  return (
    <Dialog {...props}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-2xl" hideClose onEscapeKeyDown={onEscapeKeyDown}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <Command
          {...commandProps}
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4"
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

export const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div
    className="flex items-center gap-2 border-b border-border/60 px-3"
    cmdk-input-wrapper=""
  >
    <Search className="h-4 w-4 shrink-0 opacity-50" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  </div>
))
CommandInput.displayName = CommandPrimitive.Input.displayName

export const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn('max-h-[400px] overflow-y-auto overflow-x-hidden p-1', className)}
    {...props}
  />
))
CommandList.displayName = CommandPrimitive.List.displayName

export const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="py-8 text-center text-sm text-muted-foreground"
    {...props}
  />
))
CommandEmpty.displayName = CommandPrimitive.Empty.displayName

export const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn('overflow-hidden p-1 text-foreground', className)}
    {...props}
  />
))
CommandGroup.displayName = CommandPrimitive.Group.displayName

export const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 h-px bg-border/60', className)}
    {...props}
  />
))
CommandSeparator.displayName = CommandPrimitive.Separator.displayName

export const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-sm outline-none transition-colors',
      'data-[selected=true]:bg-accent/15 data-[selected=true]:text-foreground',
      'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
      className,
    )}
    {...props}
  />
))
CommandItem.displayName = CommandPrimitive.Item.displayName

export const CommandShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn(
      'ml-auto rounded border border-border/40 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] tracking-widest text-muted-foreground',
      className,
    )}
    {...props}
  />
)
CommandShortcut.displayName = 'CommandShortcut'
