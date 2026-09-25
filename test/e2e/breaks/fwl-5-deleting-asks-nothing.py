# DELETING A FIELD — AND EVERY TASK'S VALUE IN IT — ASKS ONLY THAT THE PROJECT CAN BE OPENED.
# Reddens: field-writes-by-level: "nor renames or deletes a field there (403, the field as it was) — in an open space they rename one"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (reader) await this.assertMayDefineFields(workspaceId, def.projectId, reader)\n    // Cascade deletes'
b = '    // Cascade deletes'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("fwl-5-deleting-asks-nothing: deleting a field — and every task's value in it — asks only that the project can be opened")
