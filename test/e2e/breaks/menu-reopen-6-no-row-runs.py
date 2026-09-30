# NO ROW RUNS AT ALL: the guard refuses a press on an open menu's row too. (`found-30-sep/menu-items-take-a-press-while-closing`)
#
# The guard over-applied. It asks whether the row is in a menu at all rather
# than whether that menu is leaving, and every row is in one, so every press
# is refused: the first press of a double-click as well as the second. The
# menu stays open and nothing is pinned, with no toggle sent. So the second
# press never lands on a leaving menu either, and each round's check that it
# did reddens with its outcome. The first press on the closing submenu's row
# is refused too, so the task never reaches your priorities: seven of the new
# checks, the run reaching its totals.
#
# Reddens: menu-reopen:
#   "the second click of a double-click on the task menu’s “Add to favorites” lands on the row while its menu is leaving (in the page, data-state=\"closed\")"
#   "a double-click on the task menu’s “Add to favorites” runs it once: the server has the task’s pin changed, and changed once"
#   "the task menu’s “Add to favorites” is pressed, and pressed again while its menu is leaving (in the page, data-state=\"closed\")"
#   "two presses on “Add to favorites”, the second while its menu is leaving, run it once: the server has the pin changed once"
#   "and that first press still runs the row: the server has the task on your priorities"
#   "the second click of a double-click on the chat header menu’s “Add to favorites” lands on the row while its menu is leaving (in the page, data-state=\"closed\")"
#   "a double-click on the chat header menu’s “Add to favorites” runs it once: the server has the channel’s pin changed, and changed once"
import io
p = '/home/user/rundesk/packages/ui/src/components/dropdown-menu.tsx'
s = io.open(p, encoding='utf-8').read()
a = "const inLeavingMenu = (row: Element) => topMenuOf(row)?.getAttribute('data-state') === 'closed'\n"
b = "const inLeavingMenu = (row: Element) => topMenuOf(row) !== null // BROKEN: every row press refused, open menu or leaving\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('menu-reopen-6-no-row-runs: a press on any menu row is refused')
