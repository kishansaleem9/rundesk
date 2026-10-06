# A FIELD IS STORED WITH THE LIST IT WAS SENT (`found-30-sep/field-definition-takes-a-foreign-list`): an admin defines a field in one project
# scoped to another project's list (201), a field no task can have.
# Reddens: field-writes-by-level: "a field scoped to a list of another project is refused, the admin’s included, as a list that is not there (404 “List not found in this project”, none made, read by SQL) — while one scoped to the project’s own list is made, stored with that list"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "    if (dto.listId != null && !(await listOfProject(this.db, projectId, dto.listId))) {\n"
b = "    if (dto.listId != null && !(await listOfProject(this.db, projectId, dto.listId)) && false) { // BROKEN: the list is stored as sent\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fdl-2-a-field-takes-another-projects-list: a field is stored scoped to a list of another project")
