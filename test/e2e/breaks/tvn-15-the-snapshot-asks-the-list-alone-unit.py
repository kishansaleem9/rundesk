# THE SNAPSHOT ASKS THE LIST ALONE (`found-30-sep/template-values-find-fields-by-name-alone`, review), as tvn-12, asked of the unit tests: a
# value of the project the task was moved in from is taken.
# Reddens: unit: task-templates.service.test.ts "nor a value of the project the task was moved in from, into this project’s field of its name"
#   "a template saved from such a task holds only the values of the fields it has, not those of its old list or its old project"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = '        .filter((r) => fieldIsOnTask(r, place))\n'
b = '        .filter((r) => fieldIsOnList(r, place.listId)) // BROKEN: the project is not asked\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tvn-15-the-snapshot-asks-the-list-alone-unit: the snapshot asks the list alone (unit)")
