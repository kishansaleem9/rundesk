# The server stops de-duplicating, so "Sara, Sara" draws two identical columns —
# the one failure a side-by-side grid cannot survive, because two columns of one
# person look exactly like two people who happen to be busy at the same times.
# Reddens: team-schedules: "choosing a second adds a second column, in the order they were picked"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = '    const unique = [...new Set(userIds.filter(Boolean))]\n'
b = '    const unique = userIds.filter(Boolean)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('planner.service.ts: a repeated id is no longer collapsed.')
