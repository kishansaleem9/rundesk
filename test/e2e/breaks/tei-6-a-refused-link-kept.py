# A MAILBOX ITS SERVER REFUSED IS KEPT.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "a password the server refuses is said in its words, and a server on a private network nobody named is refused before a password goes to it; neither leaves a mailbox (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (err instanceof MailboxRefused) throw new BadRequestException(err.said)\n      throw err\n    }\n    const id = existing?.id ?? randomUUID()',
     '      if (!(err instanceof MailboxRefused)) throw err\n    }\n    const id = existing?.id ?? randomUUID()'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-6-a-refused-link-kept: A MAILBOX ITS SERVER REFUSED IS KEPT.')
