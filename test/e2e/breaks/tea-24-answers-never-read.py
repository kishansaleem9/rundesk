# NO ANSWER IS READ FROM ANY MAILBOX.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "the client’s answer, read from the Gmail, lands in the task once, under the email, without the quote of what it answers (read by SQL)"
#   or "Mia’s email goes through Graph as a draft sent from her Outlook, file and all; the answer is read from that conversation into the task, under hers (read by SQL)"
#
# The poller looks for threads of emails that came in, of which there are none to start.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-email-jobs.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("          eq(taskCommentEmails.direction, 'out'),\n          gt(",
     "          eq(taskCommentEmails.direction, 'in'),\n          gt("),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-24-answers-never-read: NO ANSWER IS READ FROM ANY MAILBOX.')
