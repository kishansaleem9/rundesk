# A TASK'S SNAPSHOT TAKES EVERY VALUE IT HOLDS (`found-30-sep/template-values-find-fields-by-name-alone`, review), as tvn-11, asked of the unit
# tests: the values of fields the task no longer has reach the copy, by name, and the template.
# Reddens: unit: task-templates.service.test.ts "a duplicate of a task moved out of a field’s list copies none of that field’s value — not into the project’s field of its name — and copies the fields it has"
#   "nor a value of the project the task was moved in from, into this project’s field of its name"
#   "a template saved from such a task holds only the values of the fields it has, not those of its old list or its old project"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = '        .filter((r) => fieldIsOnTask(r, place))\n'
b = '        // BROKEN: every value the task holds, whether or not it has the field\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tvn-14-the-snapshot-takes-every-value-held-unit: the snapshot takes every value held (unit)")
