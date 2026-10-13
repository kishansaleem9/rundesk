# A SIGN-IN THE SERVER REFUSES IS READ AS A PASSING FAULT: THE MAILBOX IS NEVER MARKED.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "when the provider stops taking the password, the next read of the inbox marks the mailbox to link again in the server’s words, and From refuses it (409); linked again with the new password, it is the same mailbox, connected (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/imap-mailbox.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (err instanceof ImapRefused) return new MailboxRefused(err.said, err.signIn)\n',
     '  if (err instanceof ImapRefused) return new MailboxRefused(err.said, false)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-17-a-refused-sign-in-not-marked: A SIGN-IN THE SERVER REFUSES IS READ AS A PASSING FAULT: THE MAILBOX IS NEVER MARKED.')
