# ANYBODY IS MADE A TASK’S WATCHER, WHETHER OR NOT THEY MAY OPEN IT.
# (`found-14-oct/automation-conditions-and-actions-unbuilt`)
# Reddens: automation-conditions: "a guest the task is not shared with is not made its watcher, and a text field is not filled as an AI field: each run fails in words"
import io
p = '/home/user/rundesk/apps/api/src/modules/automations/automations.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        if (!(await this.mayOpenTask(ctx.workspaceId, userId, ctx.taskId))) throw new Error('That person cannot open this task, so they cannot watch it')\n",
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acn-6-anyone-watches: ANYBODY IS MADE A TASK’S WATCHER, WHETHER OR NOT THEY MAY OPEN IT.')
