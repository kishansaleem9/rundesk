# The pill made inert. Frame `16:10` draws a hover fill and a pointer cursor on
# it, so it is a control; a button wired to nothing is the dead-control defect,
# and it is invisible until somebody clicks.
# Reddens: focus-pill: "clicking it opens the planner"
import io
p = '/home/user/rundesk/apps/web/src/components/app-topbar.tsx'
a = """          onClick={() => navigate({ to: '/app/$workspaceId/calendar', params: { workspaceId } })}
"""
b = """          onClick={() => {}}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('app-topbar.tsx: clicking the focus pill now does nothing.')
