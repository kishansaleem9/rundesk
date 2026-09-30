# A TASK'S COVER IS HANDED OUT AT ITS PERMANENT PUBLIC ADDRESS (`found-30-sep/public-cdn-url-makes-every-object-public`):
# the task's `coverUrl` is `${R2_PUBLIC_URL}/<key>` for an uploaded cover.
# Reddens: private-object-urls: "and so is its cover, the same file as the task's picture"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "          ? await this.r2.getObjectUrl(row.coverStorageKey)\n"
b = "          ? `${process.env.R2_PUBLIC_URL}/${row.coverStorageKey}`\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-3-a-cover-at-its-public-address: a task cover is served at its public address')
