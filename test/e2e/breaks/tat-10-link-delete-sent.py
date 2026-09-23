# REMOVING A LINK DELETES IT FROM THE BUCKET, as it did. S3 answers 204 to a
# DELETE for any key, so nothing fails — only the stub's request log sees it.
# Reddens: task-attachments: "and removing a linked file sends nothing to the bucket — there is no object behind a link"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
a = "    if (this.r2.configured && attachment.storageKey && !isLinkAttachmentKey(attachment.storageKey)) {"
b = "    if (this.r2.configured && attachment.storageKey) {"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tat-10-link-delete-sent: applied")
