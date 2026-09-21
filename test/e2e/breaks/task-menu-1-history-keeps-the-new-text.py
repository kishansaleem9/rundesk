# History stores the text that REPLACED the old one instead of the text that
# was lost. The feature still looks complete from the outside — entries appear,
# they are timestamped, they name an editor — and every description written
# before an edit is gone for good, which is the one thing it exists to prevent.
#
# Reddens: task-menu:
#   "and the entry holds the text that was REPLACED, not the text that replaced it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '      await this.recordDescriptionRevision(taskId, actorId, before.description ?? null)\n'
b = '      await this.recordDescriptionRevision(taskId, actorId, patch.description ?? null)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: description history keeps the new text, so the replaced text is unrecoverable.')
