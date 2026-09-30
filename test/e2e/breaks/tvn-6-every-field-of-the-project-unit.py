# TEMPLATE VALUES FIND FIELDS AMONG EVERY FIELD OF THE PROJECT, as `tvn-1`, for the unit tests (`found-30-sep/template-values-find-fields-by-name-alone`).
# Reddens: unit: task-templates.service.test.ts "writes a value only into a field the new task has: none into a field scoped to another list, and a name shared with such a field into the project’s own"
#   "writes a value taken from a field back into that field where the new task has it, and each field once"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "  const onTask = fields.filter((f) => fieldIsOnList(f, listId))\n"
b = "  const onTask = fields // BROKEN: every field of the project\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tvn-6-every-field-of-the-project-unit: template values find fields among every field of the project")
