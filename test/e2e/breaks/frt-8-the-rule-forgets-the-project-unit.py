# THE ONE RULE FORGETS THE PROJECT (`found-30-sep/field-route-takes-another-projects-field`): `fieldIsOnTask` asks only the list, so a field of
# another project with no list is read as the task's, and the route takes a value or a vote for it.
# Re-aimed 5 October (not the anchor): `moveFieldValues` asks this rule of both tasks of a merge now
# (`found-30-sep/merge-moves-values-onto-fields-the-target-lacks` and its review), so the patch also reddens two tests of
# tasks-merge-fields.test.ts — “moves a value of the survivor’s project’s field, and leaves on the merged task one of a field scoped to
# another list and one of another project” and “leaves on the merged task its own project’s field’s value when the survivor is in
# another project” — measured with both files: 5 failures, the three named below and those two.
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
