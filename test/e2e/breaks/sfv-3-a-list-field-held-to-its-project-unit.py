# THE RULE IN SQL FORGETS A FIELD'S LIST (`found-30-sep/search-finds-tasks-by-values-they-no-longer-show`): `taskHasField` asks only the
# field's project, so a task moved out of a field's list into another list of its project is found by the value it no longer shows.
# Reddens: unit: search.service.test.ts "finds a task only where it has the field: in a list of the field’s project, and for a field scoped to a list, in that list"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "      .where(and(eq(lists.projectId, field.projectId), field.listId != null ? eq(lists.id, field.listId) : undefined)),\n"
b = "      .where(and(eq(lists.projectId, field.projectId))), // BROKEN: the field's list is not asked\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sfv-3-a-list-field-held-to-its-project-unit: the rule in SQL forgets a field's list")
