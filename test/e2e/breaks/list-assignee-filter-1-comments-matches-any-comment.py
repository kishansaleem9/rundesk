# The Comments source drops the assignee condition, so it matches "tasks
# with a comment on them" instead of "tasks with a comment assigned to me".
# Reddens: "the Comments source is exactly the task whose comment is
#          assigned to me", "a comment I wrote and assigned to nobody pulls
#          nothing in".
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '                  eq(taskComments.assignedToUserId, opts.userId),\n                  inArray(taskComments.taskId, inList),'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '                  inArray(taskComments.taskId, inList),'))
print('[break 1] Any comment at all now counts as a comment assigned to you.')
