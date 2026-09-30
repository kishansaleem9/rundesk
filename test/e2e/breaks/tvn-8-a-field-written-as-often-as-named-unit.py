# A FIELD IS WRITTEN AS OFTEN AS A VALUE NAMES IT, as `tvn-4`, for the unit test (`found-30-sep/template-values-find-fields-by-name-alone`).
# Reddens: unit: task-templates.service.test.ts "writes a value taken from a field back into that field where the new task has it, and each field once"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "    if (field && !planned.has(field.id)) planned.set(field.id, { field, value: v.value })\n"
b = "    if (field) planned.set(`${field.id}#${planned.size}`, { field, value: v.value }) // BROKEN: a field as often as named\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tvn-8-a-field-written-as-often-as-named-unit: a field is written as often as a value names it")
