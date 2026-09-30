# A TASK'S VALUES ARE TAKEN BY NAME ALONE (`found-30-sep/template-values-find-fields-by-name-alone`): the snapshot a duplicate and Save as template
# read drops the field each value came from.
# Reddens: unit: task-templates.service.test.ts "a duplicate copies each value into the field it came from, where two of its fields share a name"
#   "a template saved from a task names the field each value came from, beside its name"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "        .map((r) => ({ ...(r.fieldId ? { fieldId: r.fieldId } : {}), fieldName: r.name, value: r.value.v ?? null })),\n"
b = "        .map((r) => ({ fieldName: r.name, value: r.value.v ?? null })), // BROKEN: no field id\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tvn-10-the-snapshot-names-no-field-unit: the snapshot names no field")
