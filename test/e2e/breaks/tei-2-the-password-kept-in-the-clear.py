# THE PASSWORD IS KEPT AS TYPED.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "Sign in with IMAP links a mailbox once it has signed in to its IMAP and SMTP servers, over TLS as asked; it is kept as its linker’s, under their name, its password sealed and given back to nobody (read by SQL and from the server’s sign-ins)"
#
# Kept in the clear, it no longer opens as a sealed one; what reads it later refuses (knock-ons).
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      passwordSealed: seal(form.password, passwordContext(id)),\n',
     '      passwordSealed: form.password,\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-2-the-password-kept-in-the-clear: THE PASSWORD IS KEPT AS TYPED.')
