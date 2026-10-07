# ONLY THE COMMENT NOTIFICATION IS SENT WITH A THREAD, AS BEFORE (`resume-defects/resume-8`).
#
# The mail that tells somebody they were mentioned, or that the task is theirs,
# keeps no Message-ID, and a reply to it finds no task.
#
# Reddens: email-reply-routing:
#   "the mail that tells somebody they were mentioned is sent with a Message-ID the server keeps and the task’s own Reply-To, and a reply naming it lands on the task as their comment"
#   "and the mail that tells somebody the task is theirs is answered on the task the same way"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.service.ts'
a = "    const thread = data.target?.entityType === 'task'\n"
b = "    const thread = data.type === 'task_commented' && data.target?.entityType === 'task'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('err-5-only-the-comment-mail-is-threaded: only the comment mail keeps a thread')
