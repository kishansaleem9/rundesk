# THE TASK'S CAPABILITIES OFFER NO UNARCHIVE AGAIN.
# Reddens: unarchive-in-place: "an archived task’s capabilities offer Unarchive to a member at Edit and to the admin, and a live task offers it to nobody"
#   or "the task sheet says the task is archived and offers Unarchive, which restores it there, and the notice goes"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      row?.isArchived && !row.deletedAt ? taskRestorable(this.db, taskId, actorId) : Promise.resolve(false),\n'
b = '      Promise.resolve(false),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('uip-1-no-restore-capability: restore is never offered')
