# DEFINING A FIELD ASKS ONLY THAT THE PROJECT CAN BE OPENED.
# Re-aimed 5 October: `found-30-sep/field-definition-takes-a-foreign-list` added a third check this reddens (4/7 on lane 7, the three named), and its review a fourth: a private list asks the rule too (6/10 on lane 7, the four named).
# Reddens: field-writes-by-level: "a member in a view-only space defines no field there, from a task or on the project (403, none made) — in an open space they define one from a task"
#   or "a guest defines no field, even on a project shared with them to edit (403, none made), and sets no value on a task shared with them to view (403, none written)"
#   or "a member refused fields in a view-only space is refused one there with no list (403), and naming a list of another space shared with them to edit (403) — no step on the way to this project — the space’s reason both times, none made (read by SQL)"
#   or "a field is made as its own list says: a member refused fields in a view-only space makes one there scoped to the project’s list shared with them to edit (201, stored with that list, read by SQL) — and none scoped to a private list of an open space that they may not open (403 “This list is private”, none made)"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (reader) await this.assertMayDefineFields(workspaceId, projectId, reader, dto.listId)\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('fwl-3-defining-asks-nothing: defining a field asks only that the project can be opened')
