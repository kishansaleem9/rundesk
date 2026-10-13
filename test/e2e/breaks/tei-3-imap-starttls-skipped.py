# REQUIRES SSL IS IGNORED BY IMAP: NO STARTTLS BEFORE THE PASSWORD.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "Sign in with IMAP links a mailbox once it has signed in to its IMAP and SMTP servers, over TLS as asked; it is kept as its linker’s, under their name, its password sealed and given back to nobody (read by SQL and from the server’s sign-ins)"
#   or "a mailbox linked without SSL is signed in to in the clear, as its linker chose; one that requires it never sends its password in the clear (read from the server’s sign-ins)"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/imap.client.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (a.useSsl && !implicit) {\n',
     '      if (a.useSsl && implicit) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-3-imap-starttls-skipped: REQUIRES SSL IS IGNORED BY IMAP: NO STARTTLS BEFORE THE PASSWORD.')
