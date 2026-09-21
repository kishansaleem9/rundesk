# The columns stack instead of sitting beside each other — one grid column, N rows.
# The data is all correct; only the geometry is wrong, which is precisely the
# difference between this row and the overlay it replaces.
# Reddens: team-schedules: "the two columns are side by side"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '        style={{ gridTemplateColumns: `48px repeat(${order.length}, minmax(0, 1fr))` }}\n'
b = '        style={{ gridTemplateColumns: `48px minmax(0, 1fr)` }}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the team columns now stack.')
