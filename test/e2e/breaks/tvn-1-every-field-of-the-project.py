# A TEMPLATE'S AND A DUPLICATE'S VALUES FIND FIELDS AMONG EVERY FIELD OF THE PROJECT, as they did (`found-30-sep/template-values-find-fields-by-name-alone`):
# a value goes into a field scoped to another list, which the new task does not have.
# Reddens: create-modal-templates:
#   "a template’s value is not written into a field of its name scoped to another list, which the task made here does not have — and where such a field shares its name with the project’s own, the value goes into the project’s (read by SQL)"
#   "and applied in the other list, where only the project’s Stage is the task’s, it makes the task and writes that field once, with the value taken from it"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "  const onTask = fields.filter((f) => fieldIsOnList(f, listId))\n"
b = "  const onTask = fields // BROKEN: every field of the project\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tvn-1-every-field-of-the-project: template values find fields among every field of the project")
