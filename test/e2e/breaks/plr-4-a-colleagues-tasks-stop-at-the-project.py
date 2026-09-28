# A COLLEAGUE'S TASKS ASK THE SPACE AND THE PROJECT ONLY: a private list's task is listed as theirs.
# Reddens: private-list-reach: ")]) chk( mTheirs.status === 200 && !names(mTheirs) && ids(mTheirs).includes(OT) && ids(aOwn).includes(PT), 'a colleague’s tasks, read by the member, have none of the private list’s — and the open one; the admin’s own have it',"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '          taskInReachFilter(this.db, workspaceId, actor.id, isManager),\n'
b = '          containerVisibilityFilter(this.db, actor.id, isManager),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("plr-4-a-colleagues-tasks-stop-at-the-project: applied")
