# A REACTION'S COMMENT IS NOT MATCHED TO THE TASK IN THE URL.
# Reddens: task-rows-by-id: "a reaction is to a comment on the task named, by somebody who may comment there: the outsider’s through their own task is not found, and a view-only member’s refused — none written — while a member reacts in an open space"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      .where(and(eq(taskComments.id, commentId), eq(taskComments.taskId, taskId)))\n'
b = '      .where(eq(taskComments.id, commentId))\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("trb-5-reaction-to-any-comment: a reaction's comment is not matched to the task in the url")
