# Deleting an attachment leaves the cover that was picked from it, as it did.
#
# The object is deleted, the key stays on the task, and every reader signs it:
# the banner, the board card and the list payload all carry a live-looking URL
# to nothing, which draws as a broken image. The pair's other half, deleting a
# different attachment, is untouched.
#
# Reddens: task-cover: "deleting the attachment the cover was picked from takes the cover off — the banner and the board card draw none"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "        .where(and(eq(tasks.id, taskId), eq(tasks.coverStorageKey, attachment.storageKey)))\n"
b = "        .where(and(eq(tasks.id, taskId), eq(tasks.coverStorageKey, '')))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: removing an attachment no longer clears the cover picked from it.')
