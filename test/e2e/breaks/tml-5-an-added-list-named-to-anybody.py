# A LIST THE TASK WAS ADDED TO IS NAMED TO ANYBODY.
# (`commit-log/log-713a611-1`)
# Reddens: tasks-in-multiple-lists: "a list the task was added to is named only to those who may open it: Olga’s own list is in her answer and not in Mia’s"
#
# The task’s lists name a private list it was added to to whoever reads the task.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-lists.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (!(await readableList(this.db, ctx.workspaceId, id, actor))) {\n',
     '      if (home && !(await readableList(this.db, ctx.workspaceId, id, actor))) { // BROKEN: an added list is named to all\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tml-5-an-added-list-named-to-anybody: A LIST THE TASK WAS ADDED TO IS NAMED TO ANYBODY.')
