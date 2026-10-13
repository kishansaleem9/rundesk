# REQUIRES SSL WITH NO STARTTLS OFFERED SIGNS IN IN THE CLEAR.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: unit: apps/api/src/modules/email-accounts/imap-mail.test.ts "a sign-in the server refuses is a refusal of the sign-in, in its words; and \"Requires SSL\" with no STARTTLS offered is refused before any password is sent"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/imap.client.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        if (!session.capabilities.has('STARTTLS')) {\n",
     "        if (!session.capabilities.has('STARTTLS') && a.user === 'never') {\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-u6-the-password-before-tls: REQUIRES SSL WITH NO STARTTLS OFFERED SIGNS IN IN THE CLEAR.')
