# THE TASK'S OWN ROWS HAVE NO ORDER AGAIN, as `ato-2`, for the unit test that reads the query it asks
# (`found-30-sep/attachments-unordered`).
# Reddens: unit: tasks-attachments-read.test.ts "reads the task’s attachments by created_at, then id, as the list does"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "this.db.select().from(taskAttachments).where(eq(taskAttachments.taskId, taskId)).orderBy(...ATTACHMENT_ORDER),"
b = "this.db.select().from(taskAttachments).where(eq(taskAttachments.taskId, taskId)),"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ato-5-the-task-rows-have-no-order-unit: getTask asks for no order')
