# A TASK MADE FROM A TEMPLATE NAMES IN ITS PEOPLE FIELD WHOEVER THE TEMPLATE NAMED, MEMBER OR NOT
# (`found-30-sep/templates-null-array-field-values`): somebody who has left, or a stranger an API payload put there.
# Reddens: unit: task-templates.service.test.ts "writes a People list with only the people who are members of the workspace now, each once"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "    field.type === 'people' ? known.members\n"
b = "    field.type === 'people' ? new Set(value) // BROKEN: anybody named, member or not\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ttv-4-strangers-kept-unit: a People list is written whoever it names')
