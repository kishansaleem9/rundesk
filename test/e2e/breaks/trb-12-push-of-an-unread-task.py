# A CALENDAR PUSH ASKS ONLY THAT THE TASK IS IN THE WORKSPACE.
# Reddens: task-rows-by-id: "a member refused a private space reaches none of its tasks through their other routes — no template from a checklist there, no checklist from a template, no type changed, no reminder and no title told, no calendar push — while on an open task each goes through"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (!(await readableTask(this.db, workspaceId, taskId, actor))) throw new NotFoundException('Task not found')\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('trb-12-push-of-an-unread-task: a calendar push asks only that the task is in the workspace')
