# A VALUE FINDS ITS FIELD BY NAME ALONE, as it did (`found-30-sep/template-values-find-fields-by-name-alone`): the field it was taken from is not
# asked, so of two fields of one name both values go to one, the second left out, and where one
# of the two is not the task's, its value, read first, goes into the other.
# Reddens: create-modal-templates:
#   "a task holding two fields of one name, saved as a template and applied in its own list, gives each value back to the field it came from (read by SQL)"
#   "and applied in the other list, where only the project’s Stage is the task’s, it makes the task and writes that field once, with the value taken from it"
#   "and a duplicate of that task copies each value into the field it came from, not both into one (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "    const same = v.fieldId ? byId.get(v.fieldId) : undefined\n"
b = "    const same = undefined as F | undefined // BROKEN: by name alone\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tvn-3-by-name-alone: template values find their field by name alone")
