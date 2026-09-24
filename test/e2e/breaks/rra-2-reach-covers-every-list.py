# THE REACH FILTER WITHOUT ITS CONTAINER RULE: every list of the workspace counts as reachable.
# Reddens: report-read-access: "a member’s overview and completion count only the task they may open — the admin’s count all four"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.guard-helper.ts'
# Re-anchored when reach took the list's own privacy too
# (found-24-sep/reach-skipped-private-lists); the edit is the same: nothing
# but the workspace is asked.
# RE-AIMED 24 September: anchored on the reach's own query alone, the line the
# mistake is in.
a = '    .where(and(eq(spaces.workspaceId, workspaceId), containerVisibilityFilter(db, actorId, false), listVisibilityFilter(actorId, false)))\n'
b = '    .where(eq(spaces.workspaceId, workspaceId))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rra-2-reach-covers-every-list: applied")
