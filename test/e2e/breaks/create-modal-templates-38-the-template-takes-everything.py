# A TEMPLATE SAVED FROM A TASK TAKES EVERYTHING, whatever import items were chosen.
# (`found-30-sep/load-template-takes-every-attribute`, batch 19)
# Reddens: create-modal-templates:
#   "customized, subtasks and custom fields off and Keep checked items on, the template holds no subtask and no field value, and keeps the description, the priority and the checklist with its ticked item ticked"
#   "and a task made from it carries the ticked item ticked and the other not, and no subtask (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = ('      await this.snapshotTask(taskId, ctx, { forTemplate: true, keepChecked: dto.keepCheckedItems === true }),\n'
     '      include,\n'
     '    )\n')
b = ('      await this.snapshotTask(taskId, ctx, { forTemplate: true, keepChecked: dto.keepCheckedItems === true }),\n'
     '      null, // BROKEN: the template takes everything\n'
     '    )\n')
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-38-the-template-takes-everything: saveFromTask ignores the import items')
