# A FIX THAT SKIPS TOO MUCH. Guarding the delete against links is right;
# guarding it against everything leaves every removed file in the bucket
# forever, and the link check alone would still pass.
# Reddens: task-attachments: "and removing it deletes exactly its object from the bucket"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
a = "    if (this.r2.configured && attachment.storageKey && !isLinkAttachmentKey(attachment.storageKey)) {"
b = "    if (false) {"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tat-11-file-delete-skipped: applied")
