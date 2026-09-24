# THE REACH FORGETS THE GUEST: a read that asks only whether a task's list is
# reachable — search among them — counts every list a guest passes through,
# so the task beside theirs is found.
# Reddens: guest-read-scope: "across the workspace, a guest’s task listing and search hold what is shared with them and nothing else — a member’s search finds the open space’s task"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.guard-helper.ts'
a = "  return and(inArray(tasks.listId, reachable), guestTaskFilter(db, actorId))\n"
b = "  return and(inArray(tasks.listId, reachable))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('grs-5-reach-forgets-guests: the reach counts every list a guest passes through')
