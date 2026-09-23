# THE SECOND SIGNING SITE FORGOTTEN. getTask guards the key and the list rows do
# not, so the same poisoned cover leaks from the list view instead.
# Reddens: task-boundaries: "and the list rows do the same — the second place a cover is signed"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
a = "        if (!this.r2.configured || !isTaskOwnObjectKey(r.coverStorageKey, r.id)) {"
b = "        if (!this.r2.configured) {"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-6-list-signs-any-cover: applied")
