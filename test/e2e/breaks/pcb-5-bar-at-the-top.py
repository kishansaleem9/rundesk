# The bar moves to the top of the calendar. Every other check still passes — it is
# the same control, in the wrong place.
# Reddens: planner-command-bar: "it sits near the bottom"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = 'absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">\n'
b = 'absolute inset-x-0 top-4 z-30 flex justify-center px-4">\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the command bar sits at the top.')
