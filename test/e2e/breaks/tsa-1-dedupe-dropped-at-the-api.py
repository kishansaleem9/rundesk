# The server stops de-duplicating the people a team schedule draws, as `ts-9`
# does, measured this time through the route the page calls: "Sara, Omar, Sara"
# answers three columns, and Sara named nine times is nine people, over the
# limit (`commit-log/log-1e7f092-1`).
#
# Reddens: team-schedules-api: "a person named twice is one column, at their first place: Sara, Omar, Sara answers Sara then Omar"
#          team-schedules-api: "and the limit counts people, not names: Sara named nine times is one column, not a refusal"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = '  const unique = [...new Set(userIds.filter(Boolean))]\n'
b = '  const unique = userIds.filter(Boolean)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('planner.service.ts: a repeated id is no longer collapsed.')
