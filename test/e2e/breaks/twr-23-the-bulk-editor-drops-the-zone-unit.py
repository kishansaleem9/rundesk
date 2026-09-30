# THE BULK EDITOR ASKS EACH TASK IN NO ZONE: its own two-date check names the writer's zone, and each
# task it changes is asked without it.
#
# Reddens: unit: task-writes.test.ts "refuses it on create, patch and the bulk editor in the writer’s zone, writing nothing, and hands the bulk editor’s zone to each task"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('          next = await this.updateTask(taskId, actorId, fieldPatch, { writerZone })\n',
     '          next = await this.updateTask(taskId, actorId, fieldPatch)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-23-the-bulk-editor-drops-the-zone-unit: the bulk editor hands each task no zone')
