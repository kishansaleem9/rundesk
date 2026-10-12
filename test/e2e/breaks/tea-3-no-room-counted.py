# A PLAN’S ROOM FOR MAILBOXES IS NOT COUNTED.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "on Pro, which has one mailbox, a second is refused in words before Microsoft is asked; on Business, Mia links her Outlook through Microsoft’s consent, as hers (read by SQL)"
#
# Every plan links as many mailboxes as asked.
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (room === null) return\n    const linked',
     '    if (room === null || room > 0) return\n    const linked'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-3-no-room-counted: A PLAN’S ROOM FOR MAILBOXES IS NOT COUNTED.')
