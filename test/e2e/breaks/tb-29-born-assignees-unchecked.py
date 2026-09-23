# CREATETASK AS IT WAS: assigneeIds written straight into task_assignees.
# Reddens: task-boundaries: "and a task cannot be BORN assigned to somebody it could not be assigned to later — nothing is written"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    await this.assertPeopleCanSeeList(data.listId, bornAssignees, 'assignee')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-29-born-assignees-unchecked: applied")
