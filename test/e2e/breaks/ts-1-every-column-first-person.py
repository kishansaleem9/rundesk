# THE ONE THIS FIXTURE EXISTS FOR. Every column looks up the FIRST person
# instead of its own, which is the commonest way a per-person grid goes wrong:
# it renders perfectly, and every column is the same calendar.
# Reddens: team-schedules: "all N busy windows sit in the column of the person they belong to"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '          const col = byUser.get(userId)\n'
b = '          const col = columns[0]\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: every schedule column now draws the first person.')
