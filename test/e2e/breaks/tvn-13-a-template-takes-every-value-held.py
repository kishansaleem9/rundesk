# A TEMPLATE TAKES EVERY VALUE THE TASK HOLDS (`found-30-sep/template-values-find-fields-by-name-alone`, review): Save as template takes the
# values of fields the task no longer has, and a task made from it gets them in a field of that name; a duplicate does not.
# Reddens: create-modal-templates:
#   "and saved as a template, it holds no value for that field — only the Note — and applied in the list writes none into the project’s Stage (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = '        .filter((r) => fieldIsOnTask(r, place))\n'
b = '        .filter((r) => forTemplate || fieldIsOnTask(r, place)) // BROKEN: a template takes every value\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tvn-13-a-template-takes-every-value-held: a template takes every value held")
