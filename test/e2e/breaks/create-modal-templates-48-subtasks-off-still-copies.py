# SUBTASKS OFF STILL COPIES THE SUBTASKS.
# (`found-30-sep/duplicate-copies-no-attachments`, batch 19)
# Reddens: create-modal-templates: "with Subtasks unticked, the copy takes the linked file and no subtask (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = '    if (take.subtasks) await this.materialiseSubtasks(ctx.listId, task.id, payload.subtasks, actor.id, now)\n'
b = '    if (take.subtasks || true) await this.materialiseSubtasks(ctx.listId, task.id, payload.subtasks, actor.id, now) // BROKEN: subtasks off still copies\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-48-subtasks-off-still-copies: the Subtasks box decides nothing')
