# THE ZIP WRITES THE FILES NEWEST FIRST (`found-30-sep/attachments-have-no-download-all`): the list draws a
# task's files in the order they were attached, oldest first, and the zip turns that round, so its entries are
# not the list's order. The names are still the same set, and links.txt is untouched.
# Reddens: task-attachments: "pressing it saves one zip holding the task's files, byte for byte, in the list's order — each the bytes its Download link serves"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    const present = sized.filter((s): s is { file: ZipAttachmentRow; bytes: number } => s !== null)\n"
b = "    const present = sized.filter((s): s is { file: ZipAttachmentRow; bytes: number } => s !== null).reverse()\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: Download all writes the task\'s files newest first.')
