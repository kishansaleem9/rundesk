# A TEMPLATE KEEPS ANY LIST AS A CUSTOM-FIELD VALUE, WHATEVER IT HOLDS
# (`found-30-sep/templates-null-array-field-values`): numbers and objects are written onto tasks as if ids.
# Reddens: unit: task-templates.service.test.ts "still turns a list that holds anything but text into null, as it does an object"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return [...value]\n"
b = "  if (Array.isArray(value)) return [...value] as string[] // BROKEN: any list, whatever it holds\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ttv-2-any-list-kept-unit: a list of anything is kept')
