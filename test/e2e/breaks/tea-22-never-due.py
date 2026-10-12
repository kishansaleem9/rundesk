# AN EMAIL SET FOR LATER IS NEVER SENT.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "an email set for later is kept, not sent, and listed on the task for its writer alone; when its time comes it goes from the Gmail as them and is the task’s email (read by SQL)"
#
# The scheduler looks a year back for what is due.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/comment-email.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('${scheduledTaskEmails.sendAt} <= now() order by',
     "${scheduledTaskEmails.sendAt} <= now() - interval '1 year' order by"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-22-never-due: AN EMAIL SET FOR LATER IS NEVER SENT.')
