# A PROJECT'S FIELD LIST NAMES EVERY FIELD OF THE PROJECT, as it did (`found-6-oct/field-lists-name-a-private-lists-fields`): a field
# scoped to a private list is listed, by name, to a member that list refuses.
# Reddens: custom-field-access: "a project’s field list leaves out, to a member refused a private list, the field scoped to it — the project’s own field and an open list’s still listed — while the admin’s lists it"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "    return reader ? fieldsOnReadableLists(this.db, workspaceId, defs, reader) : defs\n"
b = "    return defs // BROKEN: every field, whatever list it is kept to\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fpl-1-the-project-list-names-every-field: the project's field list names a private list's field")
