# THE REACH STOPS AT THE SPACE AND THE PROJECT AGAIN: a private list's tasks are let through Meili's hits.
# Reddens: unit: search.service.test.ts "holds a task hit to its reach — space, project and list — as well as the private-item rule"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.guard-helper.ts'
a = '    .where(and(eq(spaces.workspaceId, workspaceId), containerVisibilityFilter(db, actorId, false), listVisibilityFilter(actorId, false)))\n'
b = '    .where(and(eq(spaces.workspaceId, workspaceId), containerVisibilityFilter(db, actorId, false)))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sst-3-meili-reach-skips-the-list: applied")
