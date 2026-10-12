# AN EMAIL SET FOR LATER IS SENT AT ONCE.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "an email set for later is kept, not sent, and listed on the task for its writer alone; when its time comes it goes from the Gmail as them and is the task’s email (read by SQL)"
#   or "one cancelled is never sent, even past its time; one sent now goes at once and is the task’s email (read by SQL)"
#
# The send time is not read. (A condition false where it runs and typed where it is read:
# `false && …` left the block unreachable to TypeScript, which refused to build it.)
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/comment-email.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (input.sendAt !== undefined && input.sendAt !== null && input.sendAt !== '') {",
     "    if (input.sendAt !== undefined && input.sendAt !== null && input.sendAt !== '' && input.sendAt === 'never-a-time') {"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-21-later-is-now: AN EMAIL SET FOR LATER IS SENT AT ONCE.')
