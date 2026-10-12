# AN ANSWER LANDS BESIDE THE EMAIL, NOT UNDER IT.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "the client’s answer, read from the Gmail, lands in the task once, under the email, without the quote of what it answers (read by SQL)"
#   or "Mia’s email goes through Graph as a draft sent from her Outlook, file and all; the answer is read from that conversation into the task, under hers (read by SQL)"
#
# The answer is a comment of its own.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-email-jobs.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("channel: 'email', parentCommentId: rootId })",
     "channel: 'email', parentCommentId: null })"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-10-answers-unthreaded: AN ANSWER LANDS BESIDE THE EMAIL, NOT UNDER IT.')
