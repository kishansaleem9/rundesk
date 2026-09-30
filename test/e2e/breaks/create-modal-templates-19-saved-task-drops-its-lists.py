# A TASK SAVED AS A TEMPLATE LEAVES ITS PEOPLE AND LABELS FIELDS BEHIND
# (`found-30-sep/templates-null-array-field-values`): the snapshot takes one-value fields only.
#
# Reddens: create-modal-templates: "a task whose People and Labels fields are set, saved as a template, keeps both as lists (read back through the API)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "        .filter((r) => !forTemplate || !NOT_FROM_TEMPLATES.has(r.type))\n"
b = "        .filter((r) => !forTemplate || (!NOT_FROM_TEMPLATES.has(r.type) && !Array.isArray(r.value.v))) // BROKEN: a list is left on the task\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-19-saved-task-drops-its-lists: a saved task leaves its lists out of the template')
