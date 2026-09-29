# UNARCHIVE IS OFFERED TO EVERY READER OF AN ARCHIVED TASK, whatever the rule says.
# Reddens: unarchive-in-place: "they offer it to no member of a view-only space, nor to a manager outside the task’s space — the restore route’s own refusals"
#   or "in a view-only space the sheet says the task is archived and offers no Unarchive"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      row?.isArchived && !row.deletedAt ? taskRestorable(this.db, taskId, actorId) : Promise.resolve(false),\n'
b = '      row?.isArchived && !row.deletedAt ? Promise.resolve(true) : Promise.resolve(false),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('uip-2-restore-for-every-reader: restore is offered to every reader')
