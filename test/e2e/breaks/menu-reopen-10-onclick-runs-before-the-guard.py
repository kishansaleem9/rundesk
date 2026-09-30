# A ROW'S OWN onClick RUNS BEFORE THE GUARD: only Radix's selection is refused on a leaving menu. (`found-30-sep/menu-items-take-a-press-while-closing`)
#
# The guard is there, but the caller's `onClick` is called before it asks
# whether the menu is leaving. A row whose action is its `onSelect` (the task
# menu's "Add to favorites") runs once; a row whose action is its `onClick`
# (the chat header menu's) runs on the second press as well, so the channel is
# pinned and unpinned. The guard works only because it decides first.
#
# Reddens: menu-reopen:
#   "a double-click on the chat header menu’s “Add to favorites” runs it once: the server has the channel’s pin changed, and changed once"
import io
p = '/home/user/rundesk/packages/ui/src/components/dropdown-menu.tsx'
s = io.open(p, encoding='utf-8').read()
a = (
    '  (event) => {\n'
    '    if (inLeavingMenu(event.currentTarget)) {\n'
    '      event.preventDefault()\n'
    '      return\n'
    '    }\n'
    '    onClick?.(event)\n'
    '  }\n'
)
b = (
    '  (event) => {\n'
    '    onClick?.(event) // BROKEN: the row\'s own onClick runs before the guard asks\n'
    '    if (inLeavingMenu(event.currentTarget)) {\n'
    '      event.preventDefault()\n'
    '      return\n'
    '    }\n'
    '  }\n'
)
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("menu-reopen-10-onclick-runs-before-the-guard: the row's onClick runs before the leaving check")
