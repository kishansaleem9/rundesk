# A PRESS ON A MENU'S BUTTON OPENS NOTHING: the single ordinary open, broken. (`found-30-sep/menus-drop-a-press-while-closing`)
#
# The shared button swallows its own press, as a fix aimed at the button
# rather than the leaving layer could: presses during an exit are ignored, and
# so is every other. The keyboard still opens a menu; a press does not. Every
# check starts from a menu a press opened, so all twenty-four redden, each
# saying the menu never opened (or, for the rows and Escapes, that their round
# never began); the run still reaches its totals. Measured on the extended
# suite: 0 of 24.
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
#   "the second click of a double-click on the task menu’s “Add to favorites” lands on the row while its menu is leaving (in the page, data-state=\"closed\")"
#   "a double-click on the task menu’s “Add to favorites” runs it once: the server has the task’s pin changed, and changed once"
#   "the task menu’s “Add to favorites” is pressed, and pressed again while its menu is leaving (in the page, data-state=\"closed\")"
#   "two presses on “Add to favorites”, the second while its menu is leaving, run it once: the server has the pin changed once"
#   "a row of the task menu’s “Add to” submenu is pressed while that submenu is leaving and the menu it opened from is still open"
#   "and that first press still runs the row: the server has the task on your priorities"
#   "the second click of a double-click on the chat header menu’s “Add to favorites” lands on the row while its menu is leaving (in the page, data-state=\"closed\")"
#   "a double-click on the chat header menu’s “Add to favorites” runs it once: the server has the channel’s pin changed, and changed once"
#   "the task’s ⋯ menu is closed with Escape, and a second Escape is pressed while it is still leaving (in the page, data-state=\"closed\")"
#   "that second Escape goes on to the page as though no menu were there: not stopped, and not marked handled"
#   "Escape closes the create modal’s open Templates menu, and the modal under it stays open"
#   "the create modal’s Templates menu is closed with Escape, and a second Escape is pressed while it is still leaving (in the page, data-state=\"closed\")"
#   "that second Escape reaches the create modal under the menu, and closes it"
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
