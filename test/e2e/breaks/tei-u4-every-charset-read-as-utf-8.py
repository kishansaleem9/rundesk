# A MESSAGE IS READ AS UTF-8 WHATEVER CHARSET IT NAMES.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: unit: apps/api/src/modules/email-accounts/imap-mail.test.ts "a message is read as a mail client reads it: the plain part, in its charset, its subject decoded, and the ids it threads by"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/mail-message.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  const label = (charset ?? 'utf-8').trim().toLowerCase() || 'utf-8'\n",
     "  const label = 'utf-8' || charset\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-u4-every-charset-read-as-utf-8: A MESSAGE IS READ AS UTF-8 WHATEVER CHARSET IT NAMES.')
