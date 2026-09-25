# RENAMING A FIELD ASKS ONLY THAT THE PROJECT CAN BE OPENED.
# Reddens: field-writes-by-level: "nor renames or deletes a field there (403, the field as it was) — in an open space they rename one"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (reader) await this.assertMayDefineFields(workspaceId, def.projectId, reader)\n    if (patch.options != null'
b = '    if (patch.options != null'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('fwl-4-renaming-asks-nothing: renaming a field asks only that the project can be opened')
