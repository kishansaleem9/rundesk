# THE REACH FILTER WITHOUT ITS CONTAINER RULE: every list of the workspace counts as reachable.
# Reddens: report-read-access: "a member’s overview and completion count only the task they may open — the admin’s count all four"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.guard-helper.ts'
a = '    .where(and(eq(spaces.workspaceId, workspaceId), containerVisibilityFilter(db, actorId, false)))\n  return inArray(tasks.listId, reachable)\n'
b = '    .where(eq(spaces.workspaceId, workspaceId))\n  return inArray(tasks.listId, reachable)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rra-2-reach-covers-every-list: applied")
