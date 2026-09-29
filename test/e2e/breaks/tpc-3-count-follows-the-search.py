# THE COUNT FOLLOWS THE SEARCH BOX: it says how many cards a search left, not how many people the workspace has.
# Reddens: teams-people-count: "a search narrows the cards to one and leaves the count at 3"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
a = "                {members.length}\n"
b = "                {shownMembers.length}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tpc-3-count-follows-the-search: the count reads the searched list')
