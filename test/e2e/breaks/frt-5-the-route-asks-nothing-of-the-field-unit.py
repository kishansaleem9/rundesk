# THE VALUE ROUTE ASKS NOTHING OF THE FIELD BUT ITS WORKSPACE, as `frt-2`, for the unit tests of
# `setValue` (`found-30-sep/field-route-takes-another-projects-field`).
# Reddens: unit: custom-fields.service.test.ts "refuses a value for a field of another project, as a field that is not there, and writes nothing"
#   "refuses a value for a field scoped to another list of the task’s project, and writes nothing"
#   "refuses a vote on a field of another project before it is cast"
#
# Re-aimed 12 October: the same line now guards an AI field's Generate and a Button's press too; the anchor is the value route's, by the comment above it.
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "     * answer says nothing of fields in a project the caller may not open.\n     */\n    if (!fieldIsOnTask(def, task)) throw new NotFoundException('Custom field not found on this task')\n"
b = "     * answer says nothing of fields in a project the caller may not open.\n     */\n    // BROKEN: any field of the workspace takes a value onto the task\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("frt-5-the-route-asks-nothing-of-the-field-unit: the value route takes any field of the workspace")
