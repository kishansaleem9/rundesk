# THE CHECK THIS REPLACED, PUT BACK. `startsWith(prefix)` on addAttachment, which
# `..` walks straight through on a public-CDN deployment.
# Reddens: task-boundaries: "a key that walks out of the task’s prefix with .. is refused — the prefix check this replaced let it in"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
a = "      if (!isTaskUploadKey(data.storageKey, ctx.workspaceId, taskId)) {"
b = "      if (!data.storageKey.startsWith(`workspaces/${ctx.workspaceId}/tasks/${taskId}/attachments/`)) {"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-12-attachment-prefix-check: applied")
