# THE TASKS HELD FOR SOMEBODY ARE THEIRS ON JOINING, WHETHER OR NOT THE ASSIGNEE RULE WOULD PUT THEM ON THEM.
# (`found-14-oct/clickup-workspace-import-and-people-unbuilt`)
# Reddens: clickup-workspace-import: "Gil joins as a guest and is not put on the task held for him — nothing is shared with him, so the assignee route would refuse it — and it is held no longer"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (!(await IMPORT_ACCESS.mayBeAssigned(this.db, { workspaceId, taskId: h.taskId, userId }))) continue\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-10-held-tasks-for-anyone: THE TASKS HELD FOR SOMEBODY ARE THEIRS ON JOINING, WHETHER OR NOT THE ASSIGNEE RULE WOULD PUT THEM ON THEM.')
