# THE GUARD ASKS THE SUBMENU, not the menu the button opened. (`found-30-sep/menu-items-take-a-press-while-closing`)
#
# A row is refused whenever its nearest menu reads `closed`. Radix closes a
# submenu on its own when the pointer or focus leaves it, with the menu it
# opened from still open and nothing chosen, so a first press on that
# submenu's row is refused too. This was the guard's first version, and on
# that build `assign-to-priorities` failed "and choosing a colleague there
# puts the task on their priorities, as added by you" twice: nothing reached
# their list. Here the submenu is closed by the keyboard and held, and the
# press on "Add to" › you does nothing.
#
# Reddens: menu-reopen:
#   "and that first press still runs the row: the server has the task on your priorities"
import io
p = '/home/user/rundesk/packages/ui/src/components/dropdown-menu.tsx'
s = io.open(p, encoding='utf-8').read()
a = "const inLeavingMenu = (row: Element) => topMenuOf(row)?.getAttribute('data-state') === 'closed'\n"
b = "const inLeavingMenu = (row: Element) => row.closest('[data-radix-menu-content]')?.getAttribute('data-state') === 'closed' // BROKEN: asks the submenu\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('menu-reopen-11-the-guard-asks-the-submenu: a row is refused whenever its nearest menu reads closed')
