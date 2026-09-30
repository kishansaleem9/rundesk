# THE ONE RULE FORGETS THE PROJECT (`found-30-sep/field-route-takes-another-projects-field`): `fieldIsOnTask` asks only the list, so a field of
# another project with no list is read as the task's, and the route takes a value or a vote for it.
# Reddens: unit: custom-fields.service.test.ts "refuses a value for a field of another project, as a field that is not there, and writes nothing"
#   "refuses a vote on a field of another project before it is cast"
#   "is its project’s fields with no list and those scoped to its own list, and no other"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "  return field.projectId === task.projectId && fieldIsOnList(field, task.listId)\n"
b = "  return fieldIsOnList(field, task.listId) // BROKEN: the project is not asked\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("frt-8-the-rule-forgets-the-project-unit: fieldIsOnTask forgets the project")
