# A REMINDER IS MADE ON A TASK ITS MAKER MAY NOT READ, AND TELLS ITS TITLE.
# Reddens: task-rows-by-id: "a member refused a private space reaches none of its tasks through their other routes — no template from a checklist there, no checklist from a template, no type changed, no reminder and no title told, no calendar push — while on an open task each goes through"
import io
p = '/home/user/rundesk/apps/api/src/modules/reminders/task-reminders.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (!task || !(await readableTask(this.db, workspaceId, taskId, actor))) throw new NotFoundException('Task not found in this workspace')\n"
b = "    if (!task) throw new NotFoundException('Task not found in this workspace')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('trb-11-reminder-on-an-unread-task: a reminder is made on a task its maker may not read, and tells its title')
