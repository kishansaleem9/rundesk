# THE ZIP READS THE TASK'S FILES IN NO ORDER (`found-30-sep/attachments-have-no-download-all`): its query asks
# for no ORDER BY, so its entries come in whatever order Postgres finds the rows — the heap's — and not the
# list's (`found-30-sep/attachments-unordered`).
# Reddens: unit: tasks-attachments-zip.test.ts "holds the task’s files in the list’s order, comments’ among them, and lists its links in links.txt"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      .where(eq(taskAttachments.taskId, task.id))\n      .orderBy(...ATTACHMENT_ORDER)\n"
b = "      .where(eq(taskAttachments.taskId, task.id))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dla-18-the-zip-asks-no-order-unit: attachmentsZip asks for no order')
