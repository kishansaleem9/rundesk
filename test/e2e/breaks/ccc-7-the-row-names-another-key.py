# The copy lands at one key and the row records another.
#
# Every row-level fact still reads right: one attachment, under the task's own
# prefix, with the recording's type and size. But nothing is stored at the key
# the row names, so the URL the task hands out, signed and valid-looking, leads
# to nothing. Only fetching it shows that.
#
# Reddens: clip-created-card: "and the task serves it: the attachment’s URL, signed when the task is read, returns the recording"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    await this.r2.copyObject(data.storageKey, storageKey, {\n"
b = "    await this.r2.copyObject(data.storageKey, `${storageKey}.copy`, {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: the attachment row names a key the copy was not written to.')
