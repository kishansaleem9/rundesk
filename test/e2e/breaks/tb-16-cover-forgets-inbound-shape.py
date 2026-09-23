# THE SECOND SHAPE FORGOTTEN. Uploads pass and inbound-email attachments are
# refused, so an image that arrived by mail can no longer be a task's cover.
# Reddens: task-boundaries: "and so is its own inbound-email attachment, which the Attachments tab also offers"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/task-object-keys.ts"
a = "  if (key.startsWith(inbound)) return isSafeSegment(key.slice(inbound.length))"
b = "  if (key.startsWith(inbound)) return false"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-16-cover-forgets-inbound-shape: applied")
