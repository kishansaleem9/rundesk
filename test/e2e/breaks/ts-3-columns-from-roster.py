# The grid draws a column per person the SERVER returned rather than per person
# picked. Identical while the two agree — and the fixture seeds a third member
# who is never chosen, so they do not.
# Reddens: team-schedules: "choosing a second adds a second column, in the order they were picked"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '        {order.map((userId) => {\n'
b = '        {columns.map(({ userId }) => {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: columns now come from the payload, not the selection.')
