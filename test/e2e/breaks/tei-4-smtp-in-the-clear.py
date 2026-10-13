# REQUIRES SSL IS IGNORED BY SMTP: THE PASSWORD GOES IN THE CLEAR.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "Sign in with IMAP links a mailbox once it has signed in to its IMAP and SMTP servers, over TLS as asked; it is kept as its linker’s, under their name, its password sealed and given back to nobody (read by SQL and from the server’s sign-ins)"
#   or "sent from the IMAP mailbox through its own SMTP server, signed in as it over TLS: its people, subject and words, the Bcc in the envelope and in no header; the server’s own mail sent nothing; kept as the task’s email with its Message-ID as the thread, one use taken (read by SQL and from what the server was sent)"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/imap-mailbox.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    requireTLS: g.useSsl && !implicit,\n    ignoreTLS: !g.useSsl,\n',
     '    requireTLS: false,\n    ignoreTLS: true,\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-4-smtp-in-the-clear: REQUIRES SSL IS IGNORED BY SMTP: THE PASSWORD GOES IN THE CLEAR.')
