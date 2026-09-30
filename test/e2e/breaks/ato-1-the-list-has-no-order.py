# THE LIST HAS NO ORDER AGAIN (`found-30-sep/attachments-unordered`). `listAttachments` asks for no
# ORDER BY, so a task's files come back in whatever order a scan meets them — the heap's — and the tab
# draws them in that order. The suite rewrites its rows into the heap out of the order they were attached.
# It also reddens "the panel draws the files in the order they were attached", which draws this list.
# Reddens: task-attachments: "the list hands the files back in the order they were attached, oldest first — not in the order the heap holds them"
#   or "the panel draws the files in the order they were attached"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      .where(eq(taskAttachments.taskId, taskId))\n      .orderBy(...ATTACHMENT_ORDER)\n"
b = "      .where(eq(taskAttachments.taskId, taskId))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: listAttachments reads a task\'s files in heap order.')
