# THE PERSON LOOKING IS LEFT OUT OF THE COUNT: it says how many OTHER people there are, one fewer than the tab lists.
# Reddens: teams-people-count: "the People tab carries the workspace’s head count, 3, the number of members the API lists"
#   and "and it is the number of people the tab draws, one card each"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
a = "                {members.length}\n"
b = "                {members.filter((m) => m.userId !== me?.id).length}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tpc-5-the-viewer-not-counted: the viewer is not counted')
