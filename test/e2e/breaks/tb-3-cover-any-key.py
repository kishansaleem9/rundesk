# THE SIGNING ORACLE. Any key is stored as the cover, and getTask signs it for
# whoever opens the task: point your cover at another workspace's attachment and
# read back a working URL to it.
# Reddens: task-boundaries: "a key from a workspace the caller does not belong to is refused and not stored"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
a = "    if (patch.coverStorageKey != null && !isTaskOwnObjectKey(patch.coverStorageKey, taskId, access.workspaceId)) {"
b = "    if (false) {"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-3-cover-any-key: applied")
