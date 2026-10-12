# ANYBODY CHANGES WHO SENDS FROM A MAILBOX.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "From offers the owner their Gmail and the server’s address; Mia her Outlook alone, until the owner lets her send from the Gmail — which only its owner may (403) — and Max neither"
#
# The owner’s check is gone from the mailbox’s settings.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (a.ownerId !== actor.id) throw new ForbiddenException(EMAIL_ACCOUNTS_REFUSALS.notYours)\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-6-anyone-shares: ANYBODY CHANGES WHO SENDS FROM A MAILBOX.')
