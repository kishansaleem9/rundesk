# THE LIST NAMES NOBODY (`found-30-sep/attachment-card-names-uploader-by-id`): a task's files come back
# with no `uploaderName`, only the uploader's id, so the card has no name to draw.
# Reddens: task-attachments: "each card names who attached it — the uploader's name, not their id"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      uploaderName: row.uploaderName ?? null,\n"
b = "      uploaderName: null,\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: a task\'s files come back with no uploader name.')
