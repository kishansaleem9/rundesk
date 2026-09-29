# TEAM SCHEDULES STAYS AT THE FOOT OF THE RAIL WHEREVER MEET WITH IS MOVED: the two people pickers are drawn apart.
# Reddens: rail-reorder: "and Team schedules rides directly under Meet with, where the order has moved it"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        {key === 'meetWith' && teamSchedulesSection}\n", "        {key === 'meetWith' && null}\n"),
    ("        {!railShown.includes('meetWith') && teamSchedulesSection}\n", "        {teamSchedulesSection}\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('rro-8-team-schedules-left-behind: Team schedules is always drawn last')
