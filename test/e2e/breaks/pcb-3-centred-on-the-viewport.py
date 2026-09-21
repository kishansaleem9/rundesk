# The bar is positioned against the viewport rather than the calendar column, so
# it drifts left by half the rail. Looks fine in a screenshot of a wide window.
# Reddens: planner-command-bar: "it is centred over the grid"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">\n'
b = '        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the command bar is centred on the window.')
