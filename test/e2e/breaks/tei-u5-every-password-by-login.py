# A PASSWORD A QUOTED STRING CANNOT CARRY IS SENT BY LOGIN ANYWAY.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: unit: apps/api/src/modules/email-accounts/imap-mail.test.ts "the client signs in, searches, fetches and appends as RFC 3501 has it; a password a quoted string cannot carry goes by AUTHENTICATE PLAIN"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/imap.client.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      const quoted = /^[\\x20-\\x7e]*$/.test(a.user) && /^[\\x20-\\x7e]*$/.test(a.password)\n',
     '      const quoted = a.user.length > 0\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-u5-every-password-by-login: A PASSWORD A QUOTED STRING CANNOT CARRY IS SENT BY LOGIN ANYWAY.')
