# THE NOTIFICATION CARRIES NO REPLY-TO, though the task has an address.
# Reddens: email-reply-routing: "where the task’s list takes email, the notification’s Reply-To is the task’s own address"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.service.ts'
a = '    const replyTo = alias ? taskReplyAddress(alias.localPart, taskId) : null\n'
b = '    const replyTo = alias ? null : null\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('err-3-no-reply-to: no Reply-To')
