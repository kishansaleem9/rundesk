# A FILE WHOSE UPLOADER IS GONE LEAVES THE LIST (`found-30-sep/attachment-card-names-uploader-by-id`): the
# uploader's name is read through an INNER join, so a file whose `uploaded_by_id` was set null when its
# uploader's account was deleted is no longer listed at all.
# Reddens: unit: tasks-attachments-read.test.ts "names who attached each file, from users, joined so a file whose uploader is gone is still listed"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      .leftJoin(users, eq(users.id, taskAttachments.uploadedById))\n"
b = "      .innerJoin(users, eq(users.id, taskAttachments.uploadedById))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('aup-3-a-gone-uploader-drops-the-file-unit: the list inner-joins the uploader')
