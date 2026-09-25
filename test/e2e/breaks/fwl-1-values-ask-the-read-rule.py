# A FIELD'S VALUE ASKS ONLY THAT THE TASK CAN BE OPENED, AS IT DID.
# Reddens: field-writes-by-level: "a member in a view-only space sets no field value on a task there (403, none written) — in an open space they do, read back"
#   or "a guest defines no field, even on a project shared with them to edit (403, none made), and sets no value on a task shared with them to view (403, none written)"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (reader && def.type !== 'voting') await assertTaskWritable(this.db, taskId, reader.id)\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("fwl-1-values-ask-the-read-rule: a field's value asks only that the task can be opened, as it did")
