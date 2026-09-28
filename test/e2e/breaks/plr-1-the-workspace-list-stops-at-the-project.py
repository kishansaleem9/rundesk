# THE WORKSPACE LIST ASKS THE SPACE AND THE PROJECT ONLY, as its copy of the rule did: a private list's tasks are listed and found.
# Reddens: private-list-reach: "), ]) chk( mAll.status === 200 && !names(mAll) && ids(mAll).includes(OT) && ids(mAll).includes(PA) && ids(aAll).includes(PT) && mFind.status === 200 && ids(mFind).length === 0 && ids(aFind).includes(PT), 'the member’s workspace list has no task of the private list, even searched for, and has the private task assigned to them — the admin’s has it',"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '        readable = and(taskInReachFilter(this.db, workspaceId, actorId, false), taskVisibilityFilter(this.db, actorId, false))\n'
b = '        readable = and(containerVisibilityFilter(this.db, actorId, false), taskVisibilityFilter(this.db, actorId, false))\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("plr-1-the-workspace-list-stops-at-the-project: applied")
