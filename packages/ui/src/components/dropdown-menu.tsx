import * as React from 'react'
import { flushSync } from 'react-dom'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { Check, ChevronRight, Circle } from 'lucide-react'
import { cn } from '../lib/cn'

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuGroup = DropdownMenuPrimitive.Group
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal
export const DropdownMenuSub = DropdownMenuPrimitive.Sub
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

export const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & { inset?: boolean }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      'flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[state=open]:bg-accent/30 focus:bg-accent/30',
      inset && 'pl-8',
      className,
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto h-4 w-4" />
  </DropdownMenuPrimitive.SubTrigger>
))
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName

export const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, collisionPadding = 8, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    // Kept off the window's edge as a menu is, and for the same rounding (`DropdownMenuContent`).
    collisionPadding={collisionPadding}
    className={cn(
      'z-50 min-w-[8rem] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overflow-x-hidden rounded-lg border border-border/60 bg-popover p-1 text-popover-foreground shadow-glow',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
      className,
    )}
    {...props}
  />
))
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName

/*
 * AN ESCAPE PRESSED WHILE A MENU IS LEAVING IS NOT THE MENU'S
 * (`found-30-sep/leaving-menu-takes-the-next-escape`).
 *
 * Radix keeps a closed menu's layer in its stack until the exit animation
 * ends, and the layer's Escape listener (on the document, capture phase) still
 * answers for the top of that stack. So an Escape pressed while the menu
 * leaves is the leaving menu's: Radix marks it `defaultPrevented` and spends it
 * closing a menu that is already closed, and the caller's `onEscapeKeyDown`
 * runs on it. The create modal's menus stop there the Escape that closes them,
 * so that it does not close the modal too; the second Escape, meant for the
 * modal, stopped there as well, and the modal stayed. A Radix layer under the
 * menu would not hear it either: only the top of the stack answers Escape.
 *
 * Radix has no prop to let a layer pass an Escape by untouched: calling
 * `preventDefault` is the only way to skip its dismissal, and that marks the
 * Escape. So an Escape during the exit ends the exit. The content is handed the
 * `animationend` its Presence is waiting for, and the unmount is committed at
 * once (`flushSync`): the layer's cleanup takes it out of the stack and removes
 * its listener. This listener is on the window, in the capture phase, so it
 * runs before the layer's. The Escape then goes on to what is under the menu,
 * as it would once the menu had gone, which it now has.
 *
 * Only a menu that reads `closed` is ended. An open menu takes its Escape as
 * before, and the caller's `onEscapeKeyDown` still decides what it does.
 */
function useEscapeEndsTheExit(node: HTMLElement | null) {
  React.useEffect(() => {
    if (!node) return
    const win = node.ownerDocument.defaultView
    if (!win) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || node.getAttribute('data-state') !== 'closed') return
      const exit = win.getComputedStyle(node).animationName.split(',')[0].trim()
      if (!exit || exit === 'none') return
      flushSync(() => {
        node.dispatchEvent(new AnimationEvent('animationend', { animationName: exit }))
      })
    }
    win.addEventListener('keydown', onKeyDown, true)
    return () => win.removeEventListener('keydown', onKeyDown, true)
  }, [node])
}

/*
 * A MENU THAT IS CLOSING DISMISSES NOTHING
 * (`found-30-sep/menus-drop-a-press-while-closing`).
 *
 * Radix keeps a closed menu in the page through its exit animation (Presence
 * waits for `animationend`), and with it the DismissableLayer's `pointerdown`
 * listener on the document. A press on the menu's button in that window
 * re-opens it from React's root listener; the same press then reaches the
 * document, where the leaving layer counts it as a press outside and closes
 * the menu it has just become. Measured on four menus, three runs: open again
 * 4–16 ms after the press, and shut 3–8 ms later by the leaving layer's
 * pointerDownOutside.
 *
 * A layer that was already closing when the press began has nothing to
 * dismiss — on any other press, dismissing a closed menu changes nothing — so
 * its outside press is refused and the button's own toggle decides. "Was
 * closing" is read in the capture phase, before the button's handler re-opens
 * the menu: by the time the layer asks, it says `open` again. The caller's
 * `onPointerDownOutside` runs first, an open menu is dismissed as before, and
 * the exit animation is unchanged. Every menu drawn with `DropdownMenuContent`
 * below gets it, and the Escape rule under it (`useEscapeEndsTheExit`).
 */
const ReopenableContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ onPointerDownOutside, ...props }, ref) => {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null)
  const closingWhenPressed = React.useRef(false)
  React.useEffect(() => {
    if (!node) return
    const doc = node.ownerDocument
    const read = () => {
      closingWhenPressed.current = node.getAttribute('data-state') === 'closed'
    }
    doc.addEventListener('pointerdown', read, true)
    return () => doc.removeEventListener('pointerdown', read, true)
  }, [node])
  useEscapeEndsTheExit(node)
  const setRefs = React.useCallback(
    (el: HTMLDivElement | null) => {
      setNode(el)
      if (typeof ref === 'function') ref(el)
      else if (ref) ref.current = el
    },
    [ref],
  )
  return (
    <DropdownMenuPrimitive.Content
      ref={setRefs}
      onPointerDownOutside={(event) => {
        onPointerDownOutside?.(event)
        if (closingWhenPressed.current) event.preventDefault()
      }}
      {...props}
    />
  )
})
ReopenableContent.displayName = 'ReopenableContent'

/*
 * EIGHT PIXELS FROM THE WINDOW'S EDGE (`found-30-sep/sw-api-cache-reads-the-menu-box-once`).
 * Radix works the room out from where the menu would sit — 51.5 px down, under
 * the topbar's avatar — and then draws it at a whole pixel, 52, so the user
 * menu, as tall as that room, ended at 900.5 in a 900 px window, every time.
 * Kept this far from every edge, a menu has the room less the padding, and its
 * foot stays inside the window whatever the rounding.
 */
export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 6, collisionPadding = 8, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <ReopenableContent
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        // Never taller than the room the trigger leaves: the user menu ran to
        // 951px in a 900px window, with "Sign out" at 914px — out of reach.
        // Radix sets the variable to the space on the chosen side.
        'z-50 min-w-[10rem] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overflow-x-hidden rounded-lg border border-border/60 bg-popover p-1 text-popover-foreground shadow-glow',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
        'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

/*
 * A ROW OF A MENU THAT IS LEAVING RUNS NOTHING
 * (`found-30-sep/menu-items-take-a-press-while-closing`).
 *
 * The first press of a double-click chooses the row and the menu closes. The
 * second lands on the same row, which is still in the page for the exit
 * animation and still takes presses. Radix's `Item` selects on any click,
 * without asking whether its menu is open, so the row ran twice: the task
 * menu's "Add to favorites" pinned the task and unpinned it, and two presses
 * 127–179 ms apart, as a person double-clicks, did the same.
 *
 * So a press on a row whose menu reads `closed` does nothing. The caller's
 * `onClick` is not called, and the click is prevented, which is how Radix's
 * own handler (the selection, and with it `onSelect`) is told to stand aside.
 * The keyboard goes the same way: Enter on a row is a click. The press is not
 * let through to what is under the menu: the person aimed at the row they could
 * see, not at the page beneath it. An open menu's rows run as before, and so
 * does a row that keeps its menu open, however quickly it is pressed again.
 *
 * THE MENU THAT DECIDES IS THE ONE THE BUTTON OPENED, not a submenu. Choosing
 * any row closes the whole menu (Radix closes it from the top), so that is
 * the state that says a choice has been made. A submenu also closes on its own
 * while its menu stays open, when the pointer or focus leaves it. The task
 * menu's "Add to" › a person, pressed as `assign-to-priorities` presses it,
 * found its submenu `closed` and the menu `open` at the press, and the row ran
 * on HEAD. That press is a first one, and it still runs. A submenu names the
 * row that opened it (`aria-labelledby`), and that row sits in its parent menu,
 * so the walk goes up through those to the top.
 */
const topMenuOf = (row: Element): Element | null => {
  let menu = row.closest('[data-radix-menu-content]')
  while (menu) {
    const opener = row.ownerDocument.getElementById(menu.getAttribute('aria-labelledby') ?? '')
    const parent = opener?.matches('[role="menuitem"][aria-haspopup="menu"]')
      ? opener.closest('[data-radix-menu-content]')
      : null
    if (!parent || parent === menu) return menu
    menu = parent
  }
  return null
}
const inLeavingMenu = (row: Element) => topMenuOf(row)?.getAttribute('data-state') === 'closed'
const onlyWhileOpen =
  (onClick: React.MouseEventHandler<HTMLDivElement> | undefined): React.MouseEventHandler<HTMLDivElement> =>
  (event) => {
    if (inLeavingMenu(event.currentTarget)) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean
    destructive?: boolean
  }
>(({ className, inset, destructive, onClick, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors',
      'focus:bg-accent/20 focus:text-foreground',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      inset && 'pl-8',
      destructive && 'text-destructive focus:bg-destructive/15 focus:text-destructive',
      className,
    )}
    {...props}
    onClick={onlyWhileOpen(onClick)}
  />
))
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

export const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, onClick, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent/20 focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    checked={checked}
    {...props}
    onClick={onlyWhileOpen(onClick)}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
))
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName

export const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, onClick, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent/20 focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
    onClick={onlyWhileOpen(onClick)}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Circle className="h-2 w-2 fill-current" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
))
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName

export const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      'px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
      inset && 'pl-8',
      className,
    )}
    {...props}
  />
))
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName

export const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-border/60', className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

export const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn('ml-auto text-xs tracking-widest text-muted-foreground/70', className)}
    {...props}
  />
)
DropdownMenuShortcut.displayName = 'DropdownMenuShortcut'
