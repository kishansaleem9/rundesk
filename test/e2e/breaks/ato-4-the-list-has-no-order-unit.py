# THE LIST HAS NO ORDER AGAIN, as `ato-1`, for the unit test that reads the query it asks
# (`found-30-sep/attachments-unordered`).
# Reddens: unit: tasks-attachments-read.test.ts "reads a task’s files in the order they were attached: created_at, then id"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      .where(eq(taskAttachments.taskId, taskId))\n      .orderBy(...ATTACHMENT_ORDER)\n"
b = "      .where(eq(taskAttachments.taskId, taskId))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ato-4-the-list-has-no-order-unit: listAttachments asks for no order')
