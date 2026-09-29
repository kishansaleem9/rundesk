# A LIVE TASK IS OFFERED UNARCHIVE TOO.
# Reddens: unarchive-in-place: "an archived task’s capabilities offer Unarchive to a member at Edit and to the admin, and a live task offers it to nobody"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      row?.isArchived && !row.deletedAt ? taskRestorable(this.db, taskId, actorId) : Promise.resolve(false),\n'
b = '      row?.isArchived && !row.deletedAt ? taskRestorable(this.db, taskId, actorId) : taskRestorable(this.db, taskId, actorId),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('uip-3-live-tasks-offered: a live task is offered restore')
