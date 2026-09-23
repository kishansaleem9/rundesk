# A PRIVATE VIEW IS FOUND BY ANYBODY WHO HAS ITS ID: the lookup that answers "not found" stops hiding it,
# and the managers' write rule then lets a workspace admin or manager rename somebody's private view.
# Reddens: view-visibility: "while neither may touch a member’s private view — it is not theirs to find"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/views.service.ts'
a = "    if (row.visibility === 'private' && !mine && actor.role !== 'super_admin') {\n"
b = "    if (row.visibility === 'private' && !mine && actor.role === 'nobody') {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("view-visibility-6-managers-reach-private-views: applied")
