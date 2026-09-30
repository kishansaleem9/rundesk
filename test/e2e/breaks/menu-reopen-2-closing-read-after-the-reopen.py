# THE GUARD ASKS TOO LATE: "was it closing?" is read after the button has re-opened the menu. (`found-30-sep/menus-drop-a-press-while-closing`)
#
# The guard is there, but reads the menu's state in the bubble phase. By then
# the button's handler has re-opened the menu and React has drawn it, so the
# menu reads `open`, the leaving layer's outside press is let through, and the
# menu shuts again. The fix works only because it reads in the capture phase.
#
# Reddens: menu-reopen:
#   "the task’s ⋯, pressed while its menu is leaving, opens the menu again, and it stays open"
#   "the sidebar’s ⋯ on a list, pressed while its menu is leaving, opens the menu again, and it stays open"
#   "the sidebar’s + on a space, pressed while its menu is leaving, opens the menu again, and it stays open"
#   "the top bar’s user menu, pressed while its menu is leaving, opens the menu again, and it stays open"
import io
p = '/home/user/rundesk/packages/ui/src/components/dropdown-menu.tsx'
s = io.open(p, encoding='utf-8').read()
a = "    doc.addEventListener('pointerdown', read, true)\n"
b = "    doc.addEventListener('pointerdown', read) // BROKEN: read after the button re-opened the menu\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('menu-reopen-2-closing-read-after-the-reopen: the closing state is read in the bubble phase')
