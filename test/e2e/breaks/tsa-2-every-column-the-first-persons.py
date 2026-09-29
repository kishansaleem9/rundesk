# Every column is read as the first person's calendar: the commonest bug in a
# side-by-side grid, which the browser suite can only catch in its stubbed
# answers. Omar's column holds Sara's day, and a stranger's column holds it too,
# with no refusal (`commit-log/log-1e7f092-1`).
#
# Reddens: team-schedules-api: "and each column is its own person’s day: Sara’s three tasks in hers, Omar’s one in his"
#          team-schedules-api: "someone outside the workspace is refused in their own column, with a reason, while Sara’s column still draws"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = '          const calendar = await this.people.getCalendar(workspaceId, requesterId, userId, opts)\n'
b = '          const calendar = await this.people.getCalendar(workspaceId, requesterId, unique[0], opts)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('planner.service.ts: every column reads the first person.')
