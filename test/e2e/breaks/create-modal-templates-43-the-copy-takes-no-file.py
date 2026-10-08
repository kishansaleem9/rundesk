# A DUPLICATE TAKES NO FILE, the Attachments box ticked or not, and names none it left.
# (`found-30-sep/duplicate-copies-no-attachments`, batch 19)
# Reddens: create-modal-templates:
#   "with Subtasks unticked, the copy takes the linked file and no subtask (read by SQL)"
#   "and a stored file whose object is gone is left out of the copy and named in a warning, the copy made all the same"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = ('    const files = take.attachments\n'
     '      ? await this.tasksService.copyAttachmentsTo(taskId, task.id, actor.id)\n')
b = ('    const files = !take.attachments && take.attachments // BROKEN: the copy takes no file\n'
     '      ? await this.tasksService.copyAttachmentsTo(taskId, task.id, actor.id)\n')
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-43-the-copy-takes-no-file: a duplicate copies no attachment')
