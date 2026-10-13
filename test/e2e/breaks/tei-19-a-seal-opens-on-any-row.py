# A SEALED PASSWORD IS BOUND TO NO ROW: ONE COPIED ONTO ANOTHER MAILBOX OPENS THERE.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "a password sealed for another mailbox does not open in this one: the send is refused in words (502, not 500), nothing is sent, and the mailbox is marked to link again (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('const passwordContext = (accountId: string) => `email_accounts.password:${accountId}`\n',
     'const passwordContext = (accountId: string) => `email_accounts.password:${accountId.length}`\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-19-a-seal-opens-on-any-row: A SEALED PASSWORD IS BOUND TO NO ROW: ONE COPIED ONTO ANOTHER MAILBOX OPENS THERE.')
