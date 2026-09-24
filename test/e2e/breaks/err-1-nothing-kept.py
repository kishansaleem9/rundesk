# THE NOTIFICATION'S MESSAGE-ID IS NOT KEPT, as it never was: a reply names an
# id this server does not know.
# Reddens: email-reply-routing: "the comment notification is sent with a Message-ID the server keeps, for the task it is about"
#   or "a reply naming that Message-ID lands on the task as the watcher’s comment"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.service.ts'
a = '    await this.db.insert(outboundEmailMessages).values({ messageId, taskId, listId: task.listId, recipient, replyTo })\n'
b = '    void outboundEmailMessages\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('err-1-nothing-kept: the Message-ID is not kept')
