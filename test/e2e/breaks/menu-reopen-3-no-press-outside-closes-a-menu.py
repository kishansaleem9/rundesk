# NO PRESS OUTSIDE CLOSES A MENU: the guard refuses every outside press, open or closing. (`found-30-sep/menus-drop-a-press-while-closing`)
#
# The fix over-applied. A closing menu keeps the press that re-opens it, but
# an open menu is never dismissed by a press outside it either, and pressing
# its button again lands outside it (the open menu turns the rest of the page
# off), so the menu cannot be closed by a press at all. Escape still closes it.
#
# Reddens: menu-reopen:
#   "pressed again, the task’s ⋯ closes its menu, and it stays closed"
#   "a press away from the open menu closes it"
import io
p = '/home/user/rundesk/packages/ui/src/components/dropdown-menu.tsx'
s = io.open(p, encoding='utf-8').read()
a = '        if (closingWhenPressed.current) event.preventDefault()\n'
b = '        event.preventDefault() // BROKEN: every outside press refused, open or closing\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('menu-reopen-3-no-press-outside-closes-a-menu: every outside press is refused')
