# A dialog takes each time its ref is set for its opening, again
# (`found-8-oct/a-dialog-takes-each-render-for-its-opening`).
#
# A layer inside Radix composes the content's ref with an arrow made afresh at
# every render, so React sets it again whenever the dialog renders: the
# interval in which a press outside is the rest of a double-click starts over
# at each render, and a dialog that changed after it opened — its list loaded,
# a letter typed — takes no press outside for half a second more.
#
# Reddens: menu-reopen: "and a dialog that has changed since it opened — typed into 0.6 s after — still closes at a press outside: the interval runs from its opening, not from its last render"
import io
p = '/home/user/rundesk/packages/ui/src/components/dialog.tsx'
a = "      if (el && el !== drawn.current) openedAt.current = performance.now()\n"
b = "      if (el) openedAt.current = performance.now()\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('menu-reopen-15-a-dialog-takes-each-render-for-its-opening: every time the ref is set restarts the interval')
