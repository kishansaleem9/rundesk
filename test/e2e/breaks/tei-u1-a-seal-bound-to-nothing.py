# A SEALED SECRET IS BOUND TO NO ROW: IT OPENS FOR ANY.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: unit: apps/api/src/modules/email-accounts/imap-mail.test.ts "a sealed password opens for its own row under its own key, and nowhere else"
import io
p = '/home/user/rundesk/apps/api/src/common/security/secret-box.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  cipher.setAAD(Buffer.from(context, 'utf8'))\n",
     '  void context\n'),
    ("    decipher.setAAD(Buffer.from(context, 'utf8'))\n",
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-u1-a-seal-bound-to-nothing: A SEALED SECRET IS BOUND TO NO ROW: IT OPENS FOR ANY.')
