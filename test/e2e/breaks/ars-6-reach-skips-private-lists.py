# REACH STOPS AT THE SPACE AND THE PROJECT, as it did: a private list's tasks are counted and named.
# Reddens: ai-read-access: "a member’s overview counts none of a private list’s tasks and their activity feed names none — the admin’s count and name them"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.guard-helper.ts'
a = '    .where(and(eq(spaces.workspaceId, workspaceId), containerVisibilityFilter(db, actorId, false), listVisibilityFilter(actorId, false)))\n'
b = '    .where(and(eq(spaces.workspaceId, workspaceId), containerVisibilityFilter(db, actorId, false)))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ars-6-reach-skips-private-lists: applied")
