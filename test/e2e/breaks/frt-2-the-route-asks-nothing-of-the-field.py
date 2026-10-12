# THE VALUE ROUTE ASKS NOTHING OF THE FIELD BUT ITS WORKSPACE, as it did (`found-30-sep/field-route-takes-another-projects-field`): a field of another
# project, one of a project the caller may not open, or one scoped to another list, takes a value onto the task.
# Reddens: custom-field-access:
#   "a value for a field of another project is refused on a task (404 each, nothing written, read by SQL) — a Text field and a Voting field alike, and one of a project the member may not open — while the task’s own project’s field is set"
#   "and a value for a field scoped to another list of the task’s project is refused (404, nothing written) — while a field scoped to the task’s own list is set, and the task’s fields read it back"
#
# Re-aimed 12 October: the same line now guards an AI field's Generate and a Button's press too; the anchor is the value route's, by the comment above it.
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "     * answer says nothing of fields in a project the caller may not open.\n     */\n    if (!fieldIsOnTask(def, task)) throw new NotFoundException('Custom field not found on this task')\n"
b = "     * answer says nothing of fields in a project the caller may not open.\n     */\n    // BROKEN: any field of the workspace takes a value onto the task\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("frt-2-the-route-asks-nothing-of-the-field: the value route takes any field of the workspace")
