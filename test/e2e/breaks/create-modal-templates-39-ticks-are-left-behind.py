# KEEP CHECKED ITEMS KEEPS NONE: every checklist item is saved unticked.
# (`found-30-sep/load-template-takes-every-attribute`, batch 19)
# Reddens: create-modal-templates:
#   "customized, subtasks and custom fields off and Keep checked items on, the template holds no subtask and no field value, and keeps the description, the priority and the checklist with its ticked item ticked"
#   "and a task made from it carries the ticked item ticked and the other not, and no subtask (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = '        items: (itemsByChecklist.get(c.id) ?? []).map((i) => ({ content: i.content, ...(keepChecked && i.isDone ? { done: true } : {}) })),\n'
b = '        items: (itemsByChecklist.get(c.id) ?? []).map((i) => ({ content: i.content, ...(false && keepChecked && i.isDone ? { done: true } : {}) })), // BROKEN: ticks are left behind\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-39-ticks-are-left-behind: a template keeps no tick')
