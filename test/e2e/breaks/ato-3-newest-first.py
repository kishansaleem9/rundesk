# NEWEST FIRST (`found-30-sep/attachments-unordered`): both reads sorted, but the other way round. A file
# attached later is drawn first and pushes every card already drawn down, and the order is not the one the
# ledger read ClickUp's in (the order they were attached, oldest first).
# It also reddens "and the task itself carries its files in the same order" and "the panel draws the files
# in the order they were attached", which read the same constant.
# Reddens: task-attachments: "the list hands the files back in the order they were attached, oldest first — not in the order the heap holds them"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "const ATTACHMENT_ORDER = [asc(taskAttachments.createdAt), asc(taskAttachments.id)]"
b = "const ATTACHMENT_ORDER = [desc(taskAttachments.createdAt), desc(taskAttachments.id)]"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: a task\'s files are read newest first.')
