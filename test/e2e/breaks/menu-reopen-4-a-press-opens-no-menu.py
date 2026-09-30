# A PRESS ON A MENU'S BUTTON OPENS NOTHING: the single ordinary open, broken. (`found-30-sep/menus-drop-a-press-while-closing`)
#
# The shared button swallows its own press, as a fix aimed at the button
# rather than the leaving layer could: presses during an exit are ignored, and
# so is every other. The keyboard still opens a menu; a press does not. Every
# check starts from a menu a press opened, so all eleven redden, each saying
# the menu never opened; the run still reaches its totals.
#
# Reddens: menu-reopen:
#   "one press on the task’s ⋯ opens its menu, and it stays open"
#   "pressed again, the task’s ⋯ closes its menu, and it stays closed"
#   "a press away from the open menu closes it"
#   "the task’s ⋯ is pressed again while the menu it closed is still leaving (in the page, data-state=\"closed\")"
#   "the task’s ⋯, pressed while its menu is leaving, opens the menu again, and it stays open"
#   "the sidebar’s ⋯ on a list is pressed again while the menu it closed is still leaving (in the page, data-state=\"closed\")"
#   "the sidebar’s ⋯ on a list, pressed while its menu is leaving, opens the menu again, and it stays open"
#   "the sidebar’s + on a space is pressed again while the menu it closed is still leaving (in the page, data-state=\"closed\")"
#   "the sidebar’s + on a space, pressed while its menu is leaving, opens the menu again, and it stays open"
#   "the top bar’s user menu is pressed again while the menu it closed is still leaving (in the page, data-state=\"closed\")"
#   "the top bar’s user menu, pressed while its menu is leaving, opens the menu again, and it stays open"
import io
p = '/home/user/rundesk/packages/ui/src/components/dropdown-menu.tsx'
s = io.open(p, encoding='utf-8').read()
a = 'export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger\n'
b = (
    '// BROKEN: a press on the button opens nothing\n'
    'export const DropdownMenuTrigger = React.forwardRef<\n'
    '  React.ElementRef<typeof DropdownMenuPrimitive.Trigger>,\n'
    '  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger>\n'
    '>((props, ref) => <DropdownMenuPrimitive.Trigger ref={ref} {...props} onPointerDown={(e) => e.preventDefault()} />)\n'
)
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('menu-reopen-4-a-press-opens-no-menu: the shared trigger ignores a press')
