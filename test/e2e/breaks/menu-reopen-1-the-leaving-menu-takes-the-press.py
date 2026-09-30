# THE LEAVING MENU TAKES THE PRESS AGAIN, as it did before. (`found-30-sep/menus-drop-a-press-while-closing`)
#
# The shared dropdown draws Radix's content straight, as it did, so a closed
# menu's layer still listens while it leaves. A press on the menu's button in
# that window re-opens it, and the leaving layer takes the same press as a
# press outside and shuts it again: on all four menus the suite presses.
#
# Reddens: menu-reopen:
#   "the task’s ⋯, pressed while its menu is leaving, opens the menu again, and it stays open"
#   "the sidebar’s ⋯ on a list, pressed while its menu is leaving, opens the menu again, and it stays open"
#   "the sidebar’s + on a space, pressed while its menu is leaving, opens the menu again, and it stays open"
#   "the top bar’s user menu, pressed while its menu is leaving, opens the menu again, and it stays open"
import io
p = '/home/user/rundesk/packages/ui/src/components/dropdown-menu.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    <ReopenableContent\n'
b = '    <DropdownMenuPrimitive.Content\n      // BROKEN: the content drawn without the guard, as it was\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('menu-reopen-1-the-leaving-menu-takes-the-press: the dropdown draws the content without the guard')
