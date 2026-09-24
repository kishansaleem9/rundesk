# THE MESSAGE-ID AND REPLY-TO STOP AT `send`: the transport is never told, so
# the mail a person receives carries neither.
# Reddens: unit: email.service.test.ts "sends the Message-ID and the Reply-To it is given"
import io
p = '/home/user/rundesk/apps/api/src/modules/email/email.service.ts'
a = '        ...(opts.messageId ? { messageId: opts.messageId } : {}),\n        ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('err-4-transport-never-told: the transport is never told')
