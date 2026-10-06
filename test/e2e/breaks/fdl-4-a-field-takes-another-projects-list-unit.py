# A FIELD IS STORED WITH THE LIST IT WAS SENT, as `fdl-2`, for the unit tests of `createDefinition`
# (`found-30-sep/field-definition-takes-a-foreign-list`).
# Reddens: unit: custom-fields.service.test.ts "refuses a field scoped to a list of another project, as a list that is not there, and stores nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "    if (dto.listId != null && !(await listOfProject(this.db, projectId, dto.listId))) {\n"
b = "    if (dto.listId != null && !(await listOfProject(this.db, projectId, dto.listId)) && false) { // BROKEN: the list is stored as sent\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fdl-4-a-field-takes-another-projects-list-unit: a field is stored scoped to a list of another project")
