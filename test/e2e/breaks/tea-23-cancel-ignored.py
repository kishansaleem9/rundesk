# CANCEL CANCELS NOTHING.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "one cancelled is never sent, even past its time; one sent now goes at once and is the task’s email (read by SQL)"
#
# A cancelled email stays waiting and goes at its time.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/comment-email.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      .set({ status: 'cancelled', updatedAt: new Date() })",
     "      .set({ status: 'scheduled', updatedAt: new Date() })"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-23-cancel-ignored: CANCEL CANCELS NOTHING.')
