# AN ASSIGNEE RULE THAT REFUSES EVERYBODY.
# Reddens: task-boundaries: "while assigning a member who can see the task still works"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    await this.assertPersonCanSeeTask(taskId, userId, 'assignee')\n"
b = '    throw new BadRequestException(PERSON_CANNOT_SEE.assignee)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-30-assign-refuses-all: applied")
