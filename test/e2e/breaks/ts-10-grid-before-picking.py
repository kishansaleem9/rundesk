# The band renders with nobody selected, so every later measurement would be
# describing something that was on screen anyway.
# Reddens: team-schedules: "no team grid is drawn until somebody is chosen"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '        {teamUserIds.length > 0 && (\n          <TeamSchedules\n'
b = '        {true && (\n          <TeamSchedules\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the team band renders with nobody picked.')
