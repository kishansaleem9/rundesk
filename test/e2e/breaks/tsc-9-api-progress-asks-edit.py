# THE API ANSWERS "PROGRESS" FROM THE EDIT RULE: an assignee in a comment-only space is told no.
# Reddens: task-sheet-capabilities: "the API says what each route would: nothing in the view-only space, comments in the comment-only one, the status too on their own task there, and everything where they may edit"
#   or "on a task assigned to them there it offers the status too — and moving it on saves — and still no other change"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "      allowed(this.assertTaskWriteAccess(taskId, actorId, { level: 'comment' })),\n"
b = "      allowed(this.assertTaskWriteAccess(taskId, actorId, { level: 'edit' })),\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tsc-9-api-progress-asks-edit: progress asks edit')
