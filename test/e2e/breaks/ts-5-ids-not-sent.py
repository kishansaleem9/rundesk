# The request stops carrying the ids. The page still renders whatever comes back,
# so this is invisible in the DOM and only the captured request shows it.
# Reddens: team-schedules: "the server was asked for both people in one request"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = "          `?userIds=${encodeURIComponent(teamUserIds.join(','))}` +\n"
b = '          `?userIds=` +\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the team request no longer names anybody.')
