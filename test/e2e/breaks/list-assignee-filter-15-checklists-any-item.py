# The Checklists source drops the assignee condition, so any task with a
# checklist item on it counts as one assigned to you.
# Reddens: list-assignee-filter: "and the Checklists source is the task whose checklist item is assigned to me"
#   or "Checklists adds the task whose checklist item is assigned to me"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '                  eq(taskChecklistItems.assigneeId, opts.userId),\n                  inArray(taskChecklists.taskId, inList),'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '                  inArray(taskChecklists.taskId, inList),'))
print('[break 15] Any checklist item now counts as one assigned to you.')
