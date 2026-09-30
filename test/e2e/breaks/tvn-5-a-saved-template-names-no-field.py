# A TEMPLATE KEEPS NO FIELD ID (`found-30-sep/template-values-find-fields-by-name-alone`): the payload's shaping drops the field each value was taken
# from, so a template saved from a task gives its values back by name alone: of two fields of one
# name, the list's value, read first, goes into the project's.
# Reddens: create-modal-templates:
#   "a task holding two fields of one name, saved as a template and applied in its own list, gives each value back to the field it came from (read by SQL)"
#   "and applied in the other list, where only the project’s Stage is the task’s, it makes the task and writes that field once, with the value taken from it"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "          ...(typeof v.fieldId === 'string' && isUuid(v.fieldId) ? { fieldId: v.fieldId } : {}),\n"
b = "          // BROKEN: the field each value came from is dropped\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tvn-5-a-saved-template-names-no-field: a saved template names no field")
