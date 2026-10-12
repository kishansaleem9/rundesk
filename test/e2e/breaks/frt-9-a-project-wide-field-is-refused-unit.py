# THE ROUTE REFUSES A FIELD OF THE WHOLE PROJECT (`found-30-sep/field-route-takes-another-projects-field`): only a field scoped to the task's own
# list is taken, so the refusals above would pass by refusing everything.
# Reddens: unit: custom-fields.service.test.ts "takes a value for a field of the task’s own project, and for one scoped to the task’s own list"
#
# Re-aimed 12 October: the same line now guards an AI field's Generate and a Button's press too; the anchor is the value route's, by the comment above it.
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "     * answer says nothing of fields in a project the caller may not open.\n     */\n    if (!fieldIsOnTask(def, task)) throw new NotFoundException('Custom field not found on this task')\n"
b = "     * answer says nothing of fields in a project the caller may not open.\n     */\n    if (!fieldIsOnTask(def, task) || def.listId == null) throw new NotFoundException('Custom field not found on this task') // BROKEN: no field of the whole project\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("frt-9-a-project-wide-field-is-refused-unit: the value route refuses a field of the whole project")
