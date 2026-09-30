# A TEMPLATE TAKES EVERY VALUE THE TASK HOLDS (`found-30-sep/template-values-find-fields-by-name-alone`, review), as tvn-13, asked of the unit
# tests: a duplicate still copies only the fields the task has.
# Reddens: unit: task-templates.service.test.ts "a template saved from such a task holds only the values of the fields it has, not those of its old list or its old project"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = '        .filter((r) => fieldIsOnTask(r, place))\n'
b = '        .filter((r) => forTemplate || fieldIsOnTask(r, place)) // BROKEN: a template takes every value\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tvn-16-a-template-takes-every-value-held-unit: a template takes every value held (unit)")
