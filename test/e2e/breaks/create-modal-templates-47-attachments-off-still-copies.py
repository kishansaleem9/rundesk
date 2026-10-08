# ATTACHMENTS OFF STILL COPIES THE FILES.
# (`found-30-sep/duplicate-copies-no-attachments`, batch 19)
# Reddens: create-modal-templates: "and with Attachments off the copy takes no file and keeps its subtask, while an item a copy cannot take is refused in words, 400 “Unknown duplicate item: comments”, and no copy is made"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = ('    const files = take.attachments\n'
     '      ? await this.tasksService.copyAttachmentsTo(taskId, task.id, actor.id)\n')
b = ('    const files = true // BROKEN: attachments off still copies\n'
     '      ? await this.tasksService.copyAttachmentsTo(taskId, task.id, actor.id)\n')
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-47-attachments-off-still-copies: the Attachments box decides nothing')
