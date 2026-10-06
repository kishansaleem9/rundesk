# A PRIVATE VIEW IS FOUND BY ANYBODY WHO HAS ITS ID: the lookup that answers "not found" stops hiding it,
# so a workspace admin or manager who asks to rename somebody's private view is told it is there — refused
# by the write rule (403, "only the person who made it"), where the managers' rule once let them rename it.
# Reddens: view-visibility: "while neither may touch a member’s private view — it is not theirs to find"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/views.service.ts'
a = "    if (row.visibility === 'private' && !mine && actor.role !== 'super_admin') {\n"
b = "    if (row.visibility === 'private' && !mine && actor.role === 'nobody') {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("view-visibility-6-managers-reach-private-views: applied")
