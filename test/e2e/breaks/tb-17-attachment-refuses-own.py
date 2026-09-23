# AN ATTACHMENT RULE THAT REFUSES EVERYTHING. No traversal gets in, and no upload
# does either.
# Reddens: task-boundaries: "while an upload in the task’s own shape is registered"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/task-object-keys.ts"
# Re-anchored on 23 September: the segment rule moved into
# common/storage/object-key-shape.ts, which chat and calls now share.
a = "  return isKeyDirectlyUnder(key, `workspaces/${workspaceId}/tasks/${taskId}/attachments/`)"
b = "  return false"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-17-attachment-refuses-own: applied")
