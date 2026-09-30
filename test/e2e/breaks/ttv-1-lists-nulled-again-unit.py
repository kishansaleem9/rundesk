# A TEMPLATE KEEPS ONE-VALUE CUSTOM FIELDS ONLY, AND A PEOPLE OR LABELS LIST BECOMES NULL, AS IT DID
# (`found-30-sep/templates-null-array-field-values`).
# Reddens: unit: task-templates.service.test.ts "keeps a list of texts, as a People or Labels field holds it, beside a one-value field"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return [...value]\n"
b = "  // BROKEN: a list is not one of the shapes kept\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ttv-1-lists-nulled-again-unit: a list-valued field is kept as null')
