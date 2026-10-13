# AN IMAP MAILBOX TAKES NO ROOM IN THE PLAN.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "a guest links no mailbox (403, in words); on Pro, whose one mailbox is linked, another is refused in words before any server is asked"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (!existing) await this.connections.assertEmailAccountRoom(workspaceId)\n    try {\n      await verifyImapMailbox',
     '    try {\n      await verifyImapMailbox'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-9-no-room-asked: AN IMAP MAILBOX TAKES NO ROOM IN THE PLAN.')
