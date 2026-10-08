# A DIALOG TAKES NO PRESS OUTSIDE AT ALL (`found-30-sep/a-double-click-on-a-dialog-row-shuts-the-dialog`).
#
# Only a press within a double-click's interval of a dialog's opening is the
# double-click's own. Let the interval never end, and a dialog ignores every
# press on its overlay: a person who clicks away from it, seconds later, is
# left looking at it.
#
# Reddens: menu-reopen: "and a press outside a dialog, once a double-click’s interval has passed since it opened, still closes it"
import io
p = '/home/user/rundesk/packages/ui/src/components/dialog.tsx'
a = "export const DOUBLE_CLICK_MS = 500\n"
b = "export const DOUBLE_CLICK_MS = Infinity\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('menu-reopen-14-a-dialog-takes-no-press-outside: no press outside a dialog shuts it')
