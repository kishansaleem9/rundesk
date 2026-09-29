# HIDING MEET WITH TAKES TEAM SCHEDULES OFF THE RAIL TOO: the section that rides under it has nowhere else to go.
# Reddens: rail-reorder: "with Meet with hidden, Team schedules is still drawn, at the foot of the rail"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = "        {!railShown.includes('meetWith') && teamSchedulesSection}\n"
b = "        {railShown.length < 0 && teamSchedulesSection}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rro-7-team-schedules-goes-with-meet-with: no foot for Team schedules')
