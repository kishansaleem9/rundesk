# A ROW PRESSED AGAIN WHILE ITS MENU LEAVES RUNS AGAIN, as it did. (`found-30-sep/menu-items-take-a-press-while-closing`)
#
# The rows no longer ask whether their menu is leaving: the guard never
# refuses. The second press of a double-click lands on the row of the menu it
# has just closed, and Radix selects it again, so a toggle undoes itself: the
# task and the channel end the rounds as they began, with two toggles sent.
#
# Reddens: menu-reopen:
#   "a double-click on the task menu’s “Add to favorites” runs it once: the server has the task’s pin changed, and changed once"
#   "two presses on “Add to favorites”, the second while its menu is leaving, run it once: the server has the pin changed once"
#   "a double-click on the chat header menu’s “Add to favorites” runs it once: the server has the channel’s pin changed, and changed once"
import io
p = '/home/user/rundesk/packages/ui/src/components/dropdown-menu.tsx'
s = io.open(p, encoding='utf-8').read()
a = "const inLeavingMenu = (row: Element) => topMenuOf(row)?.getAttribute('data-state') === 'closed'\n"
b = "const inLeavingMenu = (_row: Element) => false // BROKEN: a row runs whether its menu is open or leaving\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('menu-reopen-5-a-leaving-row-runs-again: the rows run whether their menu is open or leaving')
