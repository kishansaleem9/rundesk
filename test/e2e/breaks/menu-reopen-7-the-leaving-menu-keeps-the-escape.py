# THE LEAVING MENU KEEPS THE ESCAPE, as it did. (`found-30-sep/leaving-menu-takes-the-next-escape`)
#
# Nothing ends a menu's exit when an Escape arrives, so the closed menu's
# layer is still the top of Radix's stack and answers it: it marks the Escape
# `defaultPrevented`, and runs the caller's `onEscapeKeyDown` on it. The create
# modal's menus stop there the Escape that closes them, so the second Escape,
# meant for the modal, stops there too and the modal stays open.
#
# Reddens: menu-reopen:
#   "that second Escape goes on to the page as though no menu were there: not stopped, and not marked handled"
#   "that second Escape reaches the create modal under the menu, and closes it"
import io
p = '/home/user/rundesk/packages/ui/src/components/dropdown-menu.tsx'
s = io.open(p, encoding='utf-8').read()
a = "    win.addEventListener('keydown', onKeyDown, true)\n"
b = "    // BROKEN: no listener, so the leaving layer keeps the Escape, as it did\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('menu-reopen-7-the-leaving-menu-keeps-the-escape: an Escape during the exit no longer ends it')
