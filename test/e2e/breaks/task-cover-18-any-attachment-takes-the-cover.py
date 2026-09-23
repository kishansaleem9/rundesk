# Deleting ANY attachment takes the cover off, not only the one it was picked from.
#
# The over-eager version of the fix: the cover goes whenever an attachment is
# removed, so tidying away an unrelated file strips the card of its image.
#
# Reddens: task-cover: "deleting another attachment leaves the cover where it was, still drawn"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "        .where(and(eq(tasks.id, taskId), eq(tasks.coverStorageKey, attachment.storageKey)))\n"
b = "        .where(eq(tasks.id, taskId))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: removing any attachment clears the cover.')
