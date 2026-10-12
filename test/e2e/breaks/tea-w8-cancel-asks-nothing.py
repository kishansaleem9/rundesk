# CANCEL ON THE TASK ASKS THE SERVER NOTHING.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "“In 1 hour” keeps the email for an hour, listed on the task with whom it goes to; Cancel there cancels it (read by SQL) and it leaves the list"
#
# The row’s Cancel does not reach the server.
import io
p = '/home/user/rundesk/apps/web/src/components/comment-email.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        : api(`/tasks/${taskId}/comments/email/scheduled/${id}`, { method: 'DELETE' }),",
     '        : Promise.resolve(null),'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-w8-cancel-asks-nothing: CANCEL ON THE TASK ASKS THE SERVER NOTHING.')
