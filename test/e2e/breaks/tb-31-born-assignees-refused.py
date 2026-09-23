# A CREATE THAT REFUSES EVERY ASSIGNEE — the create modal's assignee picker breaks.
# Reddens: task-boundaries: "while one born assigned to a member who can see it is made, assigned"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    await this.assertPeopleCanSeeList(data.listId, bornAssignees, 'assignee')\n"
b = '    if (bornAssignees.length > 0) throw new BadRequestException(PERSON_CANNOT_SEE.assignee)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-31-born-assignees-refused: applied")
