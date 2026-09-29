# THE COUNT IS DRAWN BEFORE THE LIST HAS ANSWERED: the tab says 0 people while the members are on their way.
# Reddens: teams-people-count: "while the member list is still on its way, the People tab draws no number — not a 0"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
a = "            {x.id === 'people' && membersQuery.isSuccess && (\n"
b = "            {x.id === 'people' && (\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tpc-2-zero-while-loading: the count is drawn from an empty list while it loads')
