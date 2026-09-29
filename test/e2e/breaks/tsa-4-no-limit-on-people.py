# The limit of eight people is gone: nine are drawn, each a column the grid has
# no room for (`commit-log/log-1e7f092-1`).
#
# Reddens: team-schedules-api: "nine people are refused as a 400 that names the limit of eight"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = '  if (unique.length > MAX_TEAM_SCHEDULE_PEOPLE) {\n'
b = '  if (unique.length > MAX_TEAM_SCHEDULE_PEOPLE * 100) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('planner.service.ts: nine people are drawn.')
