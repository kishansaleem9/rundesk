# THE LEAVING MENU TAKES THE PRESS AGAIN, as it did before. (`found-30-sep/menus-drop-a-press-while-closing`)
#
# The shared dropdown draws Radix's content straight, as it did, so a closed
# menu's layer still listens while it leaves. A press on the menu's button in
# that window re-opens it, and the leaving layer takes the same press as a
# press outside and shuts it again: on all four menus the suite presses.
#
# The wrapper this removes also carries the Escape rule
# (`found-30-sep/leaving-menu-takes-the-next-escape`, `useEscapeEndsTheExit`),
# so the leaving layer keeps the next Escape as well, as it did: the two checks
# that an Escape during the exit gets past the menu redden with the four
# (measured on the extended suite, 18 of 24).
#
# Reddens: menu-reopen:
#   "the task’s ⋯, pressed while its menu is leaving, opens the menu again, and it stays open"
#   "the sidebar’s ⋯ on a list, pressed while its menu is leaving, opens the menu again, and it stays open"
#   "the sidebar’s + on a space, pressed while its menu is leaving, opens the menu again, and it stays open"
#   "the top bar’s user menu, pressed while its menu is leaving, opens the menu again, and it stays open"
#   "that second Escape goes on to the page as though no menu were there: not stopped, and not marked handled"
#   "that second Escape reaches the create modal under the menu, and closes it"
import io
p = '/home/user/rundesk/packages/ui/src/components/dropdown-menu.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    <ReopenableContent\n'
b = '    <DropdownMenuPrimitive.Content\n      // BROKEN: the content drawn without the guard, as it was\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('menu-reopen-1-the-leaving-menu-takes-the-press: the dropdown draws the content without the guard')
