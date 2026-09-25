# THE API ANSWERS "COMMENT" FROM THE EDIT RULE: a comment-only reader is told they may not comment.
# Reddens: task-sheet-capabilities: "the API says what each route would: nothing in the view-only space, comments in the comment-only one, the status too on their own task there, and everything where they may edit"
#   or "in a comment-only space it offers the comment box, and no change to the task"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      allowed(this.assertMayComment(taskId, actorId)),\n'
b = '      allowed(this.assertTaskWriteAccess(taskId, actorId)),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tsc-10-api-comment-asks-edit: comment asks edit')
