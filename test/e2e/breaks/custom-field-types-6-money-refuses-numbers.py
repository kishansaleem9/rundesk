# A money field stops accepting numbers, so a formula input cannot be filled in at
# all. Also reddens the checks that read the number it would have fed.
# Reddens: custom-field-types: "its two inputs take values"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "        case 'number':\n        case 'money':\n          if (typeof value !== 'number' || !Number.isFinite(value)) {\n"
b = "        case 'number':\n        case 'money':\n          if (typeof value === 'number' || !Number.isFinite(value)) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('custom-fields.service.ts: money now refuses the numbers it exists to hold.')
