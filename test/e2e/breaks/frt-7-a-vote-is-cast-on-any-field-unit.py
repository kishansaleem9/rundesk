# A VOTE IS CAST ON ANY FIELD OF THE WORKSPACE, as `frt-3`, for the unit test of a vote (`found-30-sep/field-route-takes-another-projects-field`).
# Reddens: unit: custom-fields.service.test.ts "refuses a vote on a field of another project before it is cast"
#
# Re-aimed 12 October: the same line now guards an AI field's Generate and a Button's press too; the anchor is the value route's, by the comment above it.
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "     * answer says nothing of fields in a project the caller may not open.\n     */\n    if (!fieldIsOnTask(def, task)) throw new NotFoundException('Custom field not found on this task')\n"
b = "     * answer says nothing of fields in a project the caller may not open.\n     */\n    if (def.type !== 'voting' && !fieldIsOnTask(def, task)) throw new NotFoundException('Custom field not found on this task') // BROKEN: a vote on any field\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("frt-7-a-vote-is-cast-on-any-field-unit: a vote is cast on a Voting field of another project")
