# A TASK MOVED INTO A LIST IT WAS ADDED TO IS IN IT TWICE.
# (`commit-log/log-713a611-1`)
# Reddens: tasks-in-multiple-lists: "moved into a list it was added to, that list is its home, and it is not in it twice (read by SQL)"
#   or "turning the ClickApp off takes every task of the workspace out of the lists it was added to, and turning it on again brings none back (read by SQL)"
#
# Re-aimed 12 October: the last 1 of these are knock-ons of the same edit, measured on lane 10 — checks that stand on what the first ones lost.
#
# The move leaves the placement it made the task’s home.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      await tx.delete(taskLists).where(and(eq(taskLists.taskId, taskId), eq(taskLists.listId, targetListId)))\n',
     '      // BROKEN: the placement stays\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tml-10-a-move-keeps-the-placement: A TASK MOVED INTO A LIST IT WAS ADDED TO IS IN IT TWICE.')
