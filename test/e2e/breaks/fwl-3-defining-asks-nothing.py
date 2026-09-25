# DEFINING A FIELD ASKS ONLY THAT THE PROJECT CAN BE OPENED.
# Reddens: field-writes-by-level: "a member in a view-only space defines no field there, from a task or on the project (403, none made) — in an open space they define one from a task"
#   or "a guest defines no field, even on a project shared with them to edit (403, none made), and sets no value on a task shared with them to view (403, none written)"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (reader) await this.assertMayDefineFields(workspaceId, projectId, reader, dto.listId)\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('fwl-3-defining-asks-nothing: defining a field asks only that the project can be opened')
