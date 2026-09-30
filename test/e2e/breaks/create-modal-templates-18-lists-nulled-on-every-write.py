# A TEMPLATE KEEPS ONE-VALUE CUSTOM FIELDS ONLY: THE DEFECT AS IT WAS
# (`found-30-sep/templates-null-array-field-values`).
#
# The normaliser keeps a text, a number or a yes/no and turns anything else to
# null, so a People or Labels list is stored as null by the create, by a save
# from a task and by every PATCH with a payload.
#
# Reddens: create-modal-templates: "a template made through the API with a People and a Labels value holds both as lists (read back through the API)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return [...value]\n"
b = "  // BROKEN: a list is not one of the shapes kept\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-18-lists-nulled-on-every-write: every write stores a list as null')
