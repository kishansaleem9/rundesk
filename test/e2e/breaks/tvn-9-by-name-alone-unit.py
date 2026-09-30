# A VALUE FINDS ITS FIELD BY NAME ALONE, as `tvn-3`, for the unit tests (`found-30-sep/template-values-find-fields-by-name-alone`).
# Reddens: unit: task-templates.service.test.ts "writes a value taken from a field back into that field where the new task has it, and each field once"
#   "a duplicate copies each value into the field it came from, where two of its fields share a name"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "    const same = v.fieldId ? byId.get(v.fieldId) : undefined\n"
b = "    const same = undefined as F | undefined // BROKEN: by name alone\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tvn-9-by-name-alone-unit: template values find their field by name alone")
