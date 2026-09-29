# ALL PEOPLE CARRIES NO NUMBER AGAIN: the tab draws its label and icon and nothing else.
# Reddens: teams-people-count: "the People tab carries the workspace’s head count, 3, the number of members the API lists"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
a = "            {x.id === 'people' && membersQuery.isSuccess && (\n"
b = "            {x.id === 'nobody' && membersQuery.isSuccess && (\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tpc-1-no-count: the People tab draws no count')
