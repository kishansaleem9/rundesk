# A TASK'S TAGGED ADDRESS IS REFUSED: only the old form, the alias itself, is taken.
# Reddens: list-address-readers: ") && !taskAddr.includes(listPart.replace(/^list-/, '')) && Boolean(comment) && Boolean(oldComment) && Boolean(cut) && !fromCut, 'a task’s address holds no part of its list’s address: mail to it still comments on the task, as mail to an address given out before does, and with its task cut off it makes nothing',"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-to-task/task-address.ts'
a = '  return same(given, taskAddressTag(localPart, taskId)) || same(given, localPart)\n'
b = '  return same(given, localPart) && taskId.length > 0\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lar-3-tags-refused: applied')
