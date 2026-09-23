# THE LINK RULE UNANCHORED. A key that merely contains `https://` would be
# treated as a link — handed back unsigned and never deleted from the bucket.
# Reddens: unit: task-object-keys.test.ts "and a key that merely CONTAINS a scheme is still a key"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/task-object-keys.ts"
a = "  return typeof key === 'string' && /^https?:\\/\\//i.test(key)"
b = "  return typeof key === 'string' && /https?:\\/\\//i.test(key)"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tok-1-scheme-anywhere: applied")
