# A MAILBOX SHARED WITH ONE IS NOT OFFERED.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "From offers the owner their Gmail and the server’s address; Mia her Outlook alone, until the owner lets her send from the Gmail — which only its owner may (403) — and Max neither"
#
# From lists only one’s own mailboxes.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        maySend: mine || its.includes(actor.id),',
     '        maySend: mine,'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-5-shared-not-offered: A MAILBOX SHARED WITH ONE IS NOT OFFERED.')
