# THE SHEET SENDS NO IMPORT CHOICE: Customize import items is drawn and not sent.
# (`found-30-sep/load-template-takes-every-attribute`, batch 19)
# Reddens: create-modal-templates:
#   "customized, subtasks and custom fields off and Keep checked items on, the template holds no subtask and no field value, and keeps the description, the priority and the checklist with its ticked item ticked"
#   "and a task made from it carries the ticked item ticked and the other not, and no subtask (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/components/task-templates-section.tsx'
a = '            ...(customize ? { include: items } : {}),\n'
b = '            ...({}), // BROKEN: the sheet sends no choice\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-40-the-sheet-sends-no-choice: the sheet saves everything whatever is ticked')
