# ADDASSIGNEE AS IT WAS: write access to the task, and nothing about the person.
# An account outside the workspace is assigned and notified.
# Reddens: task-boundaries: "a task cannot be assigned to an account outside its workspace"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    await this.assertPersonCanSeeTask(taskId, userId, 'assignee')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-27-assign-anyone: applied")
