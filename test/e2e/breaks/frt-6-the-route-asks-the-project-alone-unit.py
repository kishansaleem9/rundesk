# THE VALUE ROUTE ASKS ONLY THAT THE FIELD IS OF THE TASK'S PROJECT, as `frt-1`, for the unit test
# of a field scoped to another list (`found-30-sep/field-route-takes-another-projects-field`).
# Reddens: unit: custom-fields.service.test.ts "refuses a value for a field scoped to another list of the task’s project, and writes nothing"
#
# Re-aimed 12 October: the same line now guards an AI field's Generate and a Button's press too; the anchor is the value route's, by the comment above it.
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "     * answer says nothing of fields in a project the caller may not open.\n     */\n    if (!fieldIsOnTask(def, task)) throw new NotFoundException('Custom field not found on this task')\n"
b = "     * answer says nothing of fields in a project the caller may not open.\n     */\n    if (def.projectId !== task.projectId) throw new NotFoundException('Custom field not found on this task') // BROKEN: the project alone\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("frt-6-the-route-asks-the-project-alone-unit: the value route takes a field scoped to another list of the task’s project")
