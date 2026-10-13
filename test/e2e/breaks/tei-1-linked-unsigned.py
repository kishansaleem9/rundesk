# A MAILBOX IS KEPT WITHOUT SIGNING IN TO IT.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "Sign in with IMAP links a mailbox once it has signed in to its IMAP and SMTP servers, over TLS as asked; it is kept as its linker’s, under their name, its password sealed and given back to nobody (read by SQL and from the server’s sign-ins)"
#   or "a password the server refuses is said in its words, and a server on a private network nobody named is refused before a password goes to it; neither leaves a mailbox (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      await verifyImapMailbox({ provider: 'imap', ...form })\n",
     '      void verifyImapMailbox\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-1-linked-unsigned: A MAILBOX IS KEPT WITHOUT SIGNING IN TO IT.')
