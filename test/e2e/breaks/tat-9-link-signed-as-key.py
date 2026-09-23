# A LINK SIGNED AS A KEY, the defect put back. `attachmentUrl` hands a link
# through untouched; without that line every linked attachment's url is
# `getObjectUrl('https://…')` — a presigned GET for an object named after the
# URL, which the card then offers as its Download and Expand targets.
# Reddens: task-attachments: "and for a linked file that url IS the link, byte for byte — not signed as if it were a key in the bucket"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
a = "    if (isLinkAttachmentKey(storageKey)) return storageKey\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tat-9-link-signed-as-key: applied")
