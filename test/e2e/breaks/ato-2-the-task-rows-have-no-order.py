# THE TASK'S OWN ROWS HAVE NO ORDER AGAIN (`found-30-sep/attachments-unordered`): `getTask` reads its
# attachments with no ORDER BY, in heap order, while the list is sorted. The two reads of one task's files
# disagree, and the sheet counts from this one until its list answers.
# Reddens: task-attachments: "and the task itself carries its files in the same order"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "this.db.select().from(taskAttachments).where(eq(taskAttachments.taskId, taskId)).orderBy(...ATTACHMENT_ORDER),"
b = "this.db.select().from(taskAttachments).where(eq(taskAttachments.taskId, taskId)),"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: getTask reads its attachments in heap order.')
