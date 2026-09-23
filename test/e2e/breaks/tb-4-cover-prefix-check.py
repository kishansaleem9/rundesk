# THE CHECK THAT LOOKS RIGHT. A `startsWith` prefix test refuses a plainly foreign
# key and lets `<own prefix>../../../../workspaces/<other>/…` through — which a
# public-CDN URL collapses into another workspace's object.
# Reddens: task-boundaries: "and so is one that starts with this task’s own prefix and walks out of it with .."
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
a = "    if (patch.coverStorageKey != null && !isTaskOwnObjectKey(patch.coverStorageKey, taskId, access.workspaceId)) {"
b = "    if (patch.coverStorageKey != null && !patch.coverStorageKey.startsWith(`workspaces/${access.workspaceId}/tasks/${taskId}/attachments/`) && !patch.coverStorageKey.startsWith(`inbound-email/${taskId}/`)) {"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-4-cover-prefix-check: applied")
