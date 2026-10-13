# A HOST THE OPERATOR NAMED FOR ONE PORT IS REACHED ON EVERY PORT.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: unit: apps/api/src/modules/email-accounts/imap-mail.test.ts "a mail server on a private network is refused unless the operator names it; one on the internet is reached at the address checked"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/mail-server.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  const letThrough = allowed.has(`${host}:${port}`)\n',
     '  const letThrough = [...allowed].some((x) => x.startsWith(`${host}:`))\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-u2-a-named-host-opens-every-port: A HOST THE OPERATOR NAMED FOR ONE PORT IS REACHED ON EVERY PORT.')
