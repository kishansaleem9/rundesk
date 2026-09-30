# THE CARD NAMES ITS UPLOADER BY ID AGAIN (`found-30-sep/attachment-card-names-uploader-by-id`): the card
# draws `uploadedBy`, the uploader's id, where the list hands back their name, so it reads
# "1.0 KB · 978243e1-…".
# Reddens: task-attachments: "each card names who attached it — the uploader's name, not their id"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '<span data-testid="attachment-uploader">{a.uploaderName}</span>'
b = '<span data-testid="attachment-uploader">{a.uploadedBy}</span>'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: an attachment card names its uploader by id.')
