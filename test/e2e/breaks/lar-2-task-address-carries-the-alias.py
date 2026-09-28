# A TASK'S ADDRESS CARRIES ITS LIST'S ALIAS, as it did: cut its task off and the list's address is left.
# Reddens: list-address-readers: ") && !taskAddr.includes(listPart.replace(/^list-/, '')) && Boolean(comment) && Boolean(oldComment) && Boolean(cut) && !fromCut, 'a task’s address holds no part of its list’s address: mail to it still comments on the task, as mail to an address given out before does, and with its task cut off it makes nothing',"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-to-task/task-address.ts'
a = '  `${LOCAL_PART_PREFIX}${taskAddressTag(localPart, taskId)}${TASK_TAG}${taskId}@${inboundDomain()}`\n'
b = '  `${LOCAL_PART_PREFIX}${localPart}${TASK_TAG}${taskId}@${inboundDomain()}`\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lar-2-task-address-carries-the-alias: applied')
