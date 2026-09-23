# THE KIND IS WRONG FOR FILES. Every attachment reported as a link, so the cover
# picker would offer an uploaded image as a link to a signed, expiring URL.
# Reddens: task-attachments: "an uploaded file is recorded as a file, and its url is signed rather than the bare key"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/task-object-keys.ts"
a = "  return isLinkAttachmentKey(key) ? 'link' : 'file'"
b = "  return 'link'"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tat-12-every-attachment-a-link: applied")
