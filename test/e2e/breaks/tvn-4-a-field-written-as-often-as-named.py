# A FIELD IS WRITTEN AS OFTEN AS A VALUE NAMES IT (`found-30-sep/template-values-find-fields-by-name-alone`): two values meant for one field write
# two rows, which the table refuses (409), after the task is made.
# Reddens: create-modal-templates: "and applied in the other list, where only the project’s Stage is the task’s, it makes the task and writes that field once, with the value taken from it"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "    if (field && !planned.has(field.id)) planned.set(field.id, { field, value: v.value })\n"
b = "    if (field) planned.set(`${field.id}#${planned.size}`, { field, value: v.value }) // BROKEN: a field as often as named\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tvn-4-a-field-written-as-often-as-named: a field is written as often as a value names it")
