# THE MENTION MAIL TAKES ITS THREAD AND DOES NOT HAND IT ON (`resume-defects/resume-8`):
# the server keeps a Message-ID the mail a person receives does not carry.
# No lane has a mail server, so only the unit test sees the transport.
#
# Reddens: unit: email.service.test.ts "each sender of a mail about a task sends the Message-ID and the Reply-To it is given"
import io
p = '/home/user/rundesk/apps/api/src/modules/email/email.service.ts'
a = ("      messageId: opts.messageId,\n"
     "      replyTo: opts.replyTo,\n"
     "      subject: `[Rundesk] ${opts.actorName} mentioned you ${opts.context}`,\n")
b = "      subject: `[Rundesk] ${opts.actorName} mentioned you ${opts.context}`,\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('err-7-the-mention-mail-tells-the-transport-nothing-unit: the mention mail drops its thread at send')
