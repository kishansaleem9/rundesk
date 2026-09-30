# A TASK'S FILE IS HANDED OUT AT ITS PERMANENT PUBLIC ADDRESS (`found-30-sep/public-cdn-url-makes-every-object-public`):
# the attachments list gives `${R2_PUBLIC_URL}/<key>` for each uploaded file, which anybody once handed it can
# keep for as long as the file lives — on the private bucket's domain, and on the pictures' too.
# Reddens: private-object-urls: "a task's file is handed out signed, for a window, not at its permanent public address — and the signed URL serves it"
#   "where the pictures have a bucket of their own, a task's file stays in the private bucket and is handed out signed — and read by its key at the public domain, as anybody once handed its URL could, it is not there"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    return this.r2.configured ? this.r2.getObjectUrl(storageKey) : storageKey\n"
b = "    return this.r2.configured ? `${process.env.R2_PUBLIC_URL}/${storageKey}` : storageKey\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-2-a-task-file-at-its-public-address: task files are listed at their public address')
