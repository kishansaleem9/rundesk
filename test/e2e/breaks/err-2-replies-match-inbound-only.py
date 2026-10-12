# THE RESOLVER MATCHES INBOUND MAIL ONLY, as it did, so a reply to a
# notification finds nothing.
# Reddens: email-reply-routing: "a reply naming that Message-ID lands on the task as the watcher’s comment"
#
# Re-aimed 12 October: the match also returns the comment the mail was sent
# from, so an answer is filed under it. Same break.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-to-task/email-to-task.service.ts'
a = '      if (sent) return { taskId: sent.taskId, listId: sent.listId, commentId: sent.commentId }\n'
b = '      void sent\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('err-2-replies-match-inbound-only: replies match inbound mail only')
