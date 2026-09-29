# EVERY TAB CARRIES THE HEAD COUNT: All teams and Org chart say how many people there are too.
# Reddens: teams-people-count: "and it is the only tab that carries a number, as in the frame"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
a = "            {x.id === 'people' && membersQuery.isSuccess && (\n"
b = "            {membersQuery.isSuccess && (\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tpc-4-count-on-every-tab: the count is drawn on all three tabs')
