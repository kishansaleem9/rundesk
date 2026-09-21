# A calendar that could not be read draws as an empty day. The confident zero:
# "nothing booked" and "could not ask" become the same picture, on the screen
# where the consequence is a meeting booked over somebody's morning.
# Reddens: team-schedules: "a calendar that could not be read says so, instead of being drawn as a free day"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '              {col?.error ? (\n'
b = '              {false ? (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: an unreadable column now renders as free.')
