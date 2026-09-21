# The bar spans the whole surface and swallows clicks over the rail, where
# "+ Add priority" and the backlog rows sit at the same height.
# Reddens: planner-command-bar: "its left edge is clear of the rail"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '            className="pointer-events-auto flex w-full max-w-xl items-center gap-2'
b = '            className="pointer-events-auto flex w-full items-center gap-2'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the command bar now spans the full width.')
