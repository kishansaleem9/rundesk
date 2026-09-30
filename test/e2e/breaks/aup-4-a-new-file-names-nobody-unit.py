# THE ROW `addAttachment` HANDS BACK NAMES NOBODY (`found-30-sep/attachment-card-names-uploader-by-id`):
# the list names the uploader and the answer to the upload does not, so the two are not one shape.
# Reddens: unit: tasks-attachments-read.test.ts "names the uploader, as the list does"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    return this.attachmentView({ ...row, uploaderName: uploader?.displayName ?? null })\n"
b = "    return this.attachmentView({ ...row, uploaderName: null })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('aup-4-a-new-file-names-nobody-unit: addAttachment hands back no uploader name')
