# A TASK MADE FROM A TEMPLATE GETS THE TEMPLATE'S VOTES AND FILES AS SAVED
# (`found-30-sep/templates-null-array-field-values`): votes cast for people who
# never saw the task, and files that are another task's attachments.
# Reddens: unit: task-templates.service.test.ts "never writes a template's votes or files onto a task"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "  if (NOT_FROM_TEMPLATES.has(field.type)) return undefined\n"
b = ("  if (field.type === 'voting' || field.type === 'files') return Array.isArray(value) ? [...new Set(value)] : undefined // BROKEN: written as saved\n"
     "  if (NOT_FROM_TEMPLATES.has(field.type)) return undefined\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ttv-3-votes-and-files-written-unit: votes and files are written from a template')
