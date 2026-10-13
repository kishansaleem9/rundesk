# A LITERAL IS READ A BYTE SHORT.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: unit: apps/api/src/modules/email-accounts/imap-mail.test.ts "an IMAP response is taken whole, literals and all, only once all of it has come"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/imap.client.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    literals.push(Buffer.from(buf.subarray(start, start + n)))\n',
     '    literals.push(Buffer.from(buf.subarray(start, start + n - 1)))\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-u3-a-literal-read-short: A LITERAL IS READ A BYTE SHORT.')
