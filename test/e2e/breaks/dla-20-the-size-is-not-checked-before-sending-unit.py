# THE FILES' SIZE IS NOT CHECKED BEFORE THE ZIP IS SENT (`found-30-sep/attachments-have-no-download-all`):
# a task whose files come to more than a zip may hold starts downloading, and is cut short by the writer's
# own limit part of the way through, where it should be refused before a byte.
# Reddens: unit: tasks-attachments-zip.test.ts "refuses files that come to more than a zip may hold, before a byte of them is read"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    if (total > ATTACHMENTS_ZIP_MAX_BYTES) {\n"
b = "    if (total > ATTACHMENTS_ZIP_MAX_BYTES && false) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dla-20-the-size-is-not-checked-before-sending-unit: the total is never compared with the cap')
