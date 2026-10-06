# DEFINING A FIELD ASKS THE PROJECT ALONE, NOT THE LIST IT IS SCOPED TO (`found-30-sep/field-definition-takes-a-foreign-list`, its review): a member refused
# fields in a view-only space is refused one scoped to the project’s list shared with them to edit, and one refused a private list defines one scoped to it.
# Reddens: field-writes-by-level: "a field is made as its own list says: a member refused fields in a view-only space makes one there scoped to the project’s list shared with them to edit (201, stored with that list, read by SQL) — and none scoped to a private list of an open space that they may not open (403 “This list is private”, none made)"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = '    if (reader) await this.assertMayDefineFields(workspaceId, projectId, reader, dto.listId)\n'
b = '    if (reader) await this.assertMayDefineFields(workspaceId, projectId, reader) // BROKEN: the list is not asked\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fdl-5-defining-asks-the-project-alone: defining a field asks the project alone, not the list it is scoped to')
