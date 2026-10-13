# ANY MEMBER SENDS FROM A MAILBOX, SHARED WITH THEM OR NOT.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "the mailbox sends for whom its linker lets it: Max is refused (403, in words) until Olga lets him, and then his email goes from her mailbox"
#
# Shared with Gmail and Outlook: `task-email-accounts` reads the same rule.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (!granted) throw new ForbiddenException(EMAIL_ACCOUNTS_REFUSALS.mayNotSend)\n',
     '      void granted\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-16-anybody-sends-from-it: ANY MEMBER SENDS FROM A MAILBOX, SHARED WITH THEM OR NOT.')
