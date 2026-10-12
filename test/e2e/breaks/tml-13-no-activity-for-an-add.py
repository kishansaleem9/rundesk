# ADDING A TASK TO A LIST IS NOT IN ITS ACTIVITY.
# (`commit-log/log-713a611-1`)
# Reddens: tasks-in-multiple-lists: "Add to › Another List opens the picker without the task’s own list; the list chosen holds the task (read by SQL), its activity says so, the sheet names both lists, the home one marked, and the picker offers that list no more"
#
# The add writes nothing to the task’s activity.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-lists.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    await this.tasks.logTaskActivity({ taskId, actorId: actor.id, action: 'list_added', meta: { listId } })\n",
     '    // BROKEN: no activity\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tml-13-no-activity-for-an-add: ADDING A TASK TO A LIST IS NOT IN ITS ACTIVITY.')
