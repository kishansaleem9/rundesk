# THE READ SIDE TRUSTS THE ROW. The write path refuses a foreign key, but a row that
# took one before the fix — or from any later path — is signed on read anyway.
# Reddens: task-boundaries: "reading a task signs its own cover and refuses to sign a foreign key already sitting in the row"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
a = "        ? this.r2.configured && isTaskOwnObjectKey(row.coverStorageKey, row.id)\n"
b = "        ? this.r2.configured\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-5-read-signs-any-cover: applied")
